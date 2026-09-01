-- ============================================================================
-- 0007_customer_loyalty_rewards.sql
--
-- Customer loyalty / reward points subsystem (Priority 4C).
--
-- Architecture summary:
--   loyalty_programs      one org-scoped configuration row (at most one
--                          ACTIVE per organization)
--   loyalty_accounts      one row per (organization, customer) — carries NO
--                          balance column; a balance is not stored, it is a
--                          fact computed from the ledger below
--   loyalty_transactions  APPEND-ONLY ledger. Every row is a signed integer
--                          points delta. The authoritative balance for any
--                          account is sum(points) over its transactions.
--
-- No table here is directly writable by the `authenticated` role — there is
-- no INSERT/UPDATE/DELETE policy granting it, so RLS denies all such access
-- by default. All ledger mutation happens through SECURITY DEFINER
-- functions/triggers that run as the table owner (the same pattern already
-- used by post_sale(), post_sales_return(), record_audit_log(), etc.), each
-- of which re-derives the caller's organization from current_org_id() and
-- never trusts a client-supplied organization_id.
--
-- Earning and redemption are wired to the EXISTING, UNMODIFIED post_sale()
-- RPC via an AFTER UPDATE trigger on `sales` that fires only on the
-- DRAFT/CANCELLED -> POSTED transition. Because the trigger runs inside the
-- same transaction post_sale() itself opened, any failure inside it
-- (insufficient points, no account, etc.) rolls back the ENTIRE sale
-- posting — journal entries, stock movements, everything — giving true
-- atomicity without a single line of post_sale() being touched. The same
-- pattern reverses points on the existing sales_returns POSTED transition.
--
-- Redemption is represented using the sales table's EXISTING
-- `discount_amount` column (already summed into total_amount by the
-- existing recalc_document_total_only trigger and already read by
-- post_sale() itself) — no hidden discount field invented. A new,
-- additive, backward-compatible `loyalty_points_redeemed` column on `sales`
-- exists only so the posting-time trigger knows how many POINTS (not
-- currency) to deduct from the ledger; it has no accounting meaning of its
-- own and nothing in post_sale() reads it.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------

create type public.loyalty_transaction_type as enum (
  'EARN', 'REDEEM', 'REVERSAL', 'EXPIRY', 'BONUS', 'ADJUSTMENT'
);

create type public.loyalty_account_status as enum ('ACTIVE', 'SUSPENDED', 'CLOSED');

-- ----------------------------------------------------------------------------
-- loyalty_programs — org-scoped configuration
-- ----------------------------------------------------------------------------

create table public.loyalty_programs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict default public.current_org_id(),
  name text not null,
  active boolean not null default true,
  -- Earn rule: `earn_points` points for every `earn_amount` currency units
  -- of an eligible sale's total (e.g. earn_points=1, earn_amount=100 means
  -- "1 point per Rs. 100"). Kept as an integer-points-per-amount ratio
  -- rather than a per-unit float rate so the earn computation stays exact.
  earn_points integer not null default 0 check (earn_points >= 0),
  earn_amount numeric(14, 2) not null default 0 check (earn_amount >= 0),
  -- Redemption rule: redeeming `redemption_points` points is worth
  -- `redemption_value` currency.
  redemption_points integer not null default 0 check (redemption_points >= 0),
  redemption_value numeric(14, 2) not null default 0 check (redemption_value >= 0),
  minimum_redemption_points integer not null default 0 check (minimum_redemption_points >= 0),
  maximum_redemption_percentage numeric(5, 2) not null default 100
    check (maximum_redemption_percentage > 0 and maximum_redemption_percentage <= 100),
  -- Expiry: data model only (Part Q) — no scheduled job exists in this
  -- stack to act on it. See migration header / CTO report.
  points_expiry_days integer check (points_expiry_days is null or points_expiry_days > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one ACTIVE program per organization (Part C).
create unique index loyalty_programs_one_active_per_org
  on public.loyalty_programs (organization_id)
  where active = true;

create index loyalty_programs_organization_id_idx on public.loyalty_programs (organization_id);

create trigger loyalty_programs_set_updated_at
  before update on public.loyalty_programs
  for each row execute function public.set_updated_at();

create trigger loyalty_programs_audit
  after insert or update or delete on public.loyalty_programs
  for each row execute function public.record_audit_log();

-- ----------------------------------------------------------------------------
-- loyalty_accounts — one per (organization, customer). No balance column.
-- ----------------------------------------------------------------------------

create table public.loyalty_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict default public.current_org_id(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  status public.loyalty_account_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, customer_id)
);

create index loyalty_accounts_organization_id_idx on public.loyalty_accounts (organization_id);

create index loyalty_accounts_customer_id_idx on public.loyalty_accounts (customer_id);

create trigger loyalty_accounts_set_updated_at
  before update on public.loyalty_accounts
  for each row execute function public.set_updated_at();

create trigger loyalty_accounts_audit
  after insert or update or delete on public.loyalty_accounts
  for each row execute function public.record_audit_log();

-- ----------------------------------------------------------------------------
-- loyalty_transactions — append-only ledger. This IS the balance.
-- ----------------------------------------------------------------------------

create table public.loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict default public.current_org_id(),
  loyalty_account_id uuid not null references public.loyalty_accounts(id) on delete restrict,
  transaction_type public.loyalty_transaction_type not null,
  -- Signed integer delta. Positive credits the account, negative debits it.
  -- Never floating point (Part C).
  points integer not null,
  source_type text not null,
  source_id uuid,
  -- REVERSAL rows point back at the EARN (or REDEEM) row they reverse, so a
  -- reversal is always traceable to what it undid (Part H).
  reference_transaction_id uuid references public.loyalty_transactions(id) on delete restrict,
  reason text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (
    (transaction_type = 'EARN' and points > 0) or
    (transaction_type = 'REDEEM' and points < 0) or
    (transaction_type = 'REVERSAL' and points <> 0 and reference_transaction_id is not null) or
    (transaction_type = 'EXPIRY' and points < 0) or
    (transaction_type = 'BONUS' and points > 0) or
    (transaction_type = 'ADJUSTMENT' and points <> 0 and reason is not null and btrim(reason) <> '')
  )
);

-- Idempotency at the database level (Part G/H): a given sale can earn at
-- most once and redeem at most once; a given sales return can reverse at
-- most once. This is a hard backstop behind the trigger's own WHEN clause
-- (which already only fires once per row, since a sale can only transition
-- into POSTED a single time) — belt and suspenders, not the only guard.
create unique index loyalty_transactions_source_once
  on public.loyalty_transactions (organization_id, transaction_type, source_type, source_id)
  where transaction_type in ('EARN', 'REDEEM', 'REVERSAL');

create index loyalty_transactions_account_idx on public.loyalty_transactions (loyalty_account_id);

create index loyalty_transactions_source_idx on public.loyalty_transactions (source_type, source_id);

create index loyalty_transactions_reference_idx on public.loyalty_transactions (reference_transaction_id);

create index loyalty_transactions_created_at_idx on public.loyalty_transactions (created_at);

-- No update/delete trigger needed: the table is append-only by construction
-- (no UPDATE/DELETE RLS policy exists for any role — see below — so no
-- client request can alter or remove a row regardless of role).
create trigger loyalty_transactions_audit
  after insert on public.loyalty_transactions
  for each row execute function public.record_audit_log();

-- ----------------------------------------------------------------------------
-- loyalty_balances — the balance, derived from the ledger. Mirrors the
-- existing stock_balances view convention (security_invoker over a
-- movement/transaction ledger) rather than a callable RPC, since a plain
-- RLS-respecting view is simpler and already this codebase's established
-- pattern for "current balance from an append-only ledger".
-- ----------------------------------------------------------------------------

create view public.loyalty_balances
  with (security_invoker = true) as
select
  la.id as loyalty_account_id,
  la.organization_id,
  la.customer_id,
  coalesce(sum(lt.points), 0)::integer as points_balance,
  coalesce(sum(lt.points) filter (where lt.points > 0), 0)::integer as lifetime_earned,
  coalesce(-sum(lt.points) filter (where lt.transaction_type = 'REDEEM'), 0)::integer as lifetime_redeemed
from public.loyalty_accounts la
left join public.loyalty_transactions lt on lt.loyalty_account_id = la.id
group by la.id, la.organization_id, la.customer_id;

-- ----------------------------------------------------------------------------
-- sales: one additive, backward-compatible column. See header comment.
-- ----------------------------------------------------------------------------

alter table public.sales
  add column loyalty_points_redeemed integer not null default 0 check (loyalty_points_redeemed >= 0);

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------

alter table public.loyalty_programs enable row level security;

alter table public.loyalty_accounts enable row level security;

alter table public.loyalty_transactions enable row level security;

-- Programs: any org member can read the active configuration (POS/customer
-- profile need it); only OWNER/ADMIN can configure it.
create policy loyalty_programs_select on public.loyalty_programs
  for select to authenticated
  using (organization_id = public.current_org_id());

create policy loyalty_programs_insert on public.loyalty_programs
  for insert to authenticated
  with check (
    organization_id = public.current_org_id()
    and "current_role"() = any (array['OWNER', 'ADMIN']::public.user_role[])
  );

create policy loyalty_programs_update on public.loyalty_programs
  for update to authenticated
  using (
    organization_id = public.current_org_id()
    and "current_role"() = any (array['OWNER', 'ADMIN']::public.user_role[])
  )
  with check (organization_id = public.current_org_id());

-- Accounts: read-only for any org member (POS/customer profile). No
-- INSERT/UPDATE/DELETE policy exists for `authenticated` at all — every
-- write goes through ensure_loyalty_account()/the provisioning trigger,
-- both SECURITY DEFINER and both re-validating organization ownership
-- themselves before writing.
create policy loyalty_accounts_select on public.loyalty_accounts
  for select to authenticated
  using (organization_id = public.current_org_id());

-- Transactions: read-only for any org member (ledger/history views). Same
-- "no write policy at all" posture — the ledger is append-only and every
-- insert goes through a SECURITY DEFINER function/trigger.
create policy loyalty_transactions_select on public.loyalty_transactions
  for select to authenticated
  using (organization_id = public.current_org_id());

-- ----------------------------------------------------------------------------
-- ensure_loyalty_account(): idempotent provisioning, callable directly (for
-- customers that existed before a program went active) and from the
-- provisioning trigger/other loyalty functions below.
-- ----------------------------------------------------------------------------

create or replace function public.ensure_loyalty_account(p_customer_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  caller_org_id uuid := public.current_org_id();
  v_customer_org uuid;
  v_account_id uuid;
begin
  select organization_id into v_customer_org from public.customers where id = p_customer_id;
  if v_customer_org is null or v_customer_org <> caller_org_id then
    raise exception 'Customer not found in organization';
  end if;

  if not exists (
    select 1 from public.loyalty_programs
    where organization_id = caller_org_id and active = true
  ) then
    return null;
  end if;

  insert into public.loyalty_accounts (organization_id, customer_id, status)
  values (caller_org_id, p_customer_id, 'ACTIVE')
  on conflict (organization_id, customer_id) do nothing;

  select id into v_account_id from public.loyalty_accounts
    where organization_id = caller_org_id and customer_id = p_customer_id;

  return v_account_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Auto-provision a loyalty account the moment a customer is created, if an
-- active program already exists (Part M) — covers both the ERP customer
-- form and POS quick-create with zero app-code changes, and the unique
-- constraint + ON CONFLICT guarantees no duplicate account is possible even
-- under concurrent requests.
-- ----------------------------------------------------------------------------

create or replace function public.loyalty_provision_account()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if exists (
    select 1 from public.loyalty_programs
    where organization_id = new.organization_id and active = true
  ) then
    insert into public.loyalty_accounts (organization_id, customer_id, status)
    values (new.organization_id, new.id, 'ACTIVE')
    on conflict (organization_id, customer_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger customers_provision_loyalty_account
  after insert on public.customers
  for each row execute function public.loyalty_provision_account();

-- ----------------------------------------------------------------------------
-- preview_loyalty_redemption(): read-only validation + server-recomputed
-- value (Part I: "never trust the browser's calculated redemption value").
-- Mutates nothing — actual redemption is recorded atomically at posting
-- time by loyalty_process_sale_posted() below.
-- ----------------------------------------------------------------------------

create or replace function public.preview_loyalty_redemption(p_customer_id uuid, p_points integer)
returns table (valid boolean, message text, redemption_value numeric, available_points integer)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  caller_org_id uuid := public.current_org_id();
  v_program public.loyalty_programs%rowtype;
  v_account_id uuid;
  v_balance integer;
begin
  select * into v_program from public.loyalty_programs
    where organization_id = caller_org_id and active = true limit 1;

  if v_program.id is null then
    return query select false, 'No active loyalty program for this organization.'::text, 0::numeric, 0;
    return;
  end if;

  select la.id into v_account_id from public.loyalty_accounts la
    where la.organization_id = caller_org_id and la.customer_id = p_customer_id;

  if v_account_id is null then
    return query select false, 'Customer has no loyalty account.'::text, 0::numeric, 0;
    return;
  end if;

  select coalesce(sum(points), 0) into v_balance
    from public.loyalty_transactions where loyalty_account_id = v_account_id;

  if p_points is null or p_points <= 0 then
    return query select false, 'Points to redeem must be greater than zero.'::text, 0::numeric, v_balance;
    return;
  end if;
  if p_points > v_balance then
    return query select false,
      format('Insufficient points: available %s, requested %s', v_balance, p_points),
      0::numeric, v_balance;
    return;
  end if;
  if v_program.minimum_redemption_points > 0 and p_points < v_program.minimum_redemption_points then
    return query select false,
      format('Minimum redemption is %s points.', v_program.minimum_redemption_points),
      0::numeric, v_balance;
    return;
  end if;
  if v_program.redemption_points <= 0 or v_program.redemption_value <= 0 then
    return query select false, 'Redemption is not configured for this program.'::text, 0::numeric, v_balance;
    return;
  end if;

  return query select
    true,
    null::text,
    round(p_points::numeric * v_program.redemption_value / v_program.redemption_points, 2),
    v_balance;
end;
$$;

-- ----------------------------------------------------------------------------
-- loyalty_process_sale_posted(): the atomic earn+redeem hook. Fires only on
-- the transition into POSTED, inside post_sale()'s own transaction — see
-- migration header for the atomicity argument. post_sale() itself is not
-- modified by one byte.
-- ----------------------------------------------------------------------------

create or replace function public.loyalty_process_sale_posted()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_program public.loyalty_programs%rowtype;
  v_account_id uuid;
  v_balance integer;
  v_earn_points integer;
begin
  -- Redemption: staged pre-posting by the POS redemption action, which set
  -- discount_amount (currency, already handled by the existing total-amount
  -- machinery) and loyalty_points_redeemed (points, meaningful only here).
  if new.loyalty_points_redeemed > 0 then
    if new.customer_id is null then
      raise exception 'Loyalty redemption requires a registered customer';
    end if;

    v_account_id := public.ensure_loyalty_account(new.customer_id);
    if v_account_id is null then
      raise exception 'No active loyalty account for this customer';
    end if;

    select coalesce(sum(points), 0) into v_balance
      from public.loyalty_transactions where loyalty_account_id = v_account_id;

    if new.loyalty_points_redeemed > v_balance then
      raise exception 'Insufficient loyalty points: available %, requested %', v_balance, new.loyalty_points_redeemed;
    end if;

    insert into public.loyalty_transactions (
      organization_id, loyalty_account_id, transaction_type, points, source_type, source_id, reason, created_by
    ) values (
      new.organization_id, v_account_id, 'REDEEM', -new.loyalty_points_redeemed, 'SALE', new.id,
      'Redeemed on sale ' || new.invoice_number, new.posted_by
    )
    on conflict (organization_id, transaction_type, source_type, source_id) where transaction_type in ('EARN','REDEEM','REVERSAL') do nothing;
  end if;

  -- Earning: walk-in sales (customer_id is null) are never eligible — there
  -- is no account to credit.
  if new.customer_id is not null then
    select * into v_program from public.loyalty_programs
      where organization_id = new.organization_id and active = true limit 1;

    if v_program.id is not null and v_program.earn_amount > 0 and v_program.earn_points > 0 then
      if v_account_id is null then
        v_account_id := public.ensure_loyalty_account(new.customer_id);
      end if;

      if v_account_id is not null then
        v_earn_points := floor(new.total_amount * v_program.earn_points / v_program.earn_amount)::integer;
        if v_earn_points > 0 then
          insert into public.loyalty_transactions (
            organization_id, loyalty_account_id, transaction_type, points, source_type, source_id, reason, created_by
          ) values (
            new.organization_id, v_account_id, 'EARN', v_earn_points, 'SALE', new.id,
            'Earned from sale ' || new.invoice_number, new.posted_by
          )
          on conflict (organization_id, transaction_type, source_type, source_id) where transaction_type in ('EARN','REDEEM','REVERSAL') do nothing;
        end if;
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger sales_loyalty_process
  after update of status on public.sales
  for each row
  when (old.status is distinct from 'POSTED' and new.status = 'POSTED')
  execute function public.loyalty_process_sale_posted();

-- ----------------------------------------------------------------------------
-- loyalty_reverse_on_sales_return_posted(): proportional reversal of the
-- original sale's EARN, referencing it explicitly (Part H). Fires only on
-- the sales_return's transition into POSTED, inside post_sales_return()'s
-- own transaction — post_sales_return() itself is not modified.
-- ----------------------------------------------------------------------------

create or replace function public.loyalty_reverse_on_sales_return_posted()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_original_sale record;
  v_earn_txn record;
  v_already_reversed integer;
  v_proportion numeric;
  v_reverse_points integer;
begin
  select id, customer_id, total_amount into v_original_sale
    from public.sales where id = new.original_sale_id;

  if v_original_sale.customer_id is null then
    return new;
  end if;

  select id, loyalty_account_id, points into v_earn_txn
    from public.loyalty_transactions
    where source_type = 'SALE' and source_id = v_original_sale.id and transaction_type = 'EARN'
    limit 1;

  if v_earn_txn.id is null then
    return new;
  end if;

  select coalesce(sum(-points), 0) into v_already_reversed
    from public.loyalty_transactions
    where transaction_type = 'REVERSAL' and reference_transaction_id = v_earn_txn.id;

  if v_original_sale.total_amount > 0 then
    v_proportion := least(1, new.total_amount / v_original_sale.total_amount);
  else
    v_proportion := 0;
  end if;

  v_reverse_points := floor(v_earn_txn.points * v_proportion)::integer;
  v_reverse_points := least(v_reverse_points, v_earn_txn.points - v_already_reversed);

  if v_reverse_points <= 0 then
    return new;
  end if;

  insert into public.loyalty_transactions (
    organization_id, loyalty_account_id, transaction_type, points, source_type, source_id,
    reference_transaction_id, reason, created_by
  ) values (
    new.organization_id, v_earn_txn.loyalty_account_id, 'REVERSAL', -v_reverse_points, 'SALES_RETURN', new.id,
    v_earn_txn.id, 'Reversed for return ' || new.return_number, new.posted_by
  )
  on conflict (organization_id, transaction_type, source_type, source_id) where transaction_type in ('EARN','REDEEM','REVERSAL') do nothing;

  return new;
end;
$$;

create trigger sales_returns_loyalty_reverse
  after update of status on public.sales_returns
  for each row
  when (old.status is distinct from 'POSTED' and new.status = 'POSTED')
  execute function public.loyalty_reverse_on_sales_return_posted();

-- ----------------------------------------------------------------------------
-- adjust_customer_points(): the ONE directly-callable point-mutating RPC —
-- for a standalone OWNER/ADMIN manual adjustment, which by definition is
-- not coupled to any other atomic business event (Part P). Every other
-- mutation path is a trigger, deliberately not exposed as a callable
-- function, so the app can never "earn" or "reverse" points without a real
-- posted sale/return backing it.
-- ----------------------------------------------------------------------------

create or replace function public.adjust_customer_points(p_customer_id uuid, p_points integer, p_reason text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  caller_org_id uuid := public.current_org_id();
  v_account_id uuid;
  v_balance integer;
  v_txn_id uuid;
begin
  -- Note: <> ALL (not <> ANY) — "<> ANY" is true as soon as the role
  -- differs from ONE element of the array, which is true for almost any
  -- role including OWNER/ADMIN themselves. "<> ALL" correctly means "not
  -- equal to every element", i.e. "not in this set".
  if "current_role"() <> all (array['OWNER', 'ADMIN']::public.user_role[]) then
    raise exception 'Insufficient privileges to adjust loyalty points';
  end if;
  if p_points is null or p_points = 0 then
    raise exception 'Adjustment points cannot be zero';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required for a manual adjustment';
  end if;

  v_account_id := public.ensure_loyalty_account(p_customer_id);
  if v_account_id is null then
    raise exception 'No active loyalty program or account for this customer';
  end if;

  if p_points < 0 then
    select coalesce(sum(points), 0) into v_balance
      from public.loyalty_transactions where loyalty_account_id = v_account_id;
    if v_balance + p_points < 0 then
      raise exception 'Adjustment would result in a negative balance (available %, requested %)', v_balance, -p_points;
    end if;
  end if;

  insert into public.loyalty_transactions (
    organization_id, loyalty_account_id, transaction_type, points, source_type, source_id, reason, created_by
  ) values (
    caller_org_id, v_account_id, 'ADJUSTMENT', p_points, 'MANUAL', null, p_reason, auth.uid()
  )
  returning id into v_txn_id;

  return v_txn_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Grants — matching the exact convention every prior migration uses for a
-- callable RPC (post_sale, post_sales_return, next_document_number, etc.):
-- explicit `grant execute ... to authenticated`. Table-level grants are not
-- listed here because no existing table in this schema has one either
-- (verified: zero `grant ... on table` statements across 0001-0006) — base
-- table privileges for `authenticated`/`anon`/`service_role` are inherited
-- from the project's own default-privilege configuration, applied outside
-- the migrations, the same way every previous table's grants were. Trigger
-- functions (loyalty_provision_account, loyalty_process_sale_posted,
-- loyalty_reverse_on_sales_return_posted) need no grant of their own either,
-- matching record_audit_log()/recalc_document_totals() — they are invoked
-- by the trigger mechanism, never called directly.
-- ----------------------------------------------------------------------------

grant select on public.loyalty_balances to authenticated;

grant execute on function public.ensure_loyalty_account(uuid) to authenticated;

grant execute on function public.preview_loyalty_redemption(uuid, integer) to authenticated;

grant execute on function public.adjust_customer_points(uuid, integer, text) to authenticated
;
