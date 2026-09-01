-- KANTIRA Business OS — Priority 4D: POS cash sessions and terminals
-- Purely additive: 0001-0007 are not modified. No change to post_sale(),
-- record_stock_movement(), or any existing table's columns/RLS/RPCs.
--
-- CONTEXT (from the Priority 4D architecture audit): no table, column, or
-- RPC anywhere represents a terminal/register identity, a cash-drawer
-- session, an opening float, or a reconciliation variance. The Part D/F
-- cash-session-open / cash-session-close / reconciliation UX cannot be
-- built honestly without this. Everything else in Priority 4D (held bills,
-- payment summary, dashboard, receipt/loyalty polish) shipped without any
-- migration and is unaffected by this one.
--
-- DESIGN: expected cash at close time is computed by summing existing
-- POSTED sales/customer_receipts/supplier_payments/sales_returns rows
-- (payment_method = 'CASH', scoped to the session's store + cashier +
-- time window) rather than by adding a session_id column to those tables.
-- This means no existing table, RLS policy, or RPC needs to change —
-- cash_sessions and pos_terminals are the only new surface. Tendered/change
-- amounts remain POS-display-only (per Part I) and are never persisted;
-- reconciliation only needs total_amount, which is already authoritative.

-- ============================================================
-- ENUM
-- ============================================================

create type public.cash_session_status as enum (
  'OPEN',
  'CLOSED'
);

-- ============================================================
-- TABLE: pos_terminals
-- ============================================================

create table public.pos_terminals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org_id() references public.organizations (id) on delete restrict,
  store_id uuid not null references public.stores (id) on delete restrict,
  terminal_code text not null,
  terminal_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, terminal_code)
);

create index pos_terminals_organization_id_idx on public.pos_terminals (organization_id);

create index pos_terminals_store_id_idx on public.pos_terminals (store_id);

create trigger pos_terminals_set_updated_at
  before update on public.pos_terminals
  for each row execute function public.set_updated_at();

-- ============================================================
-- TABLE: cash_sessions
-- ============================================================

create table public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org_id() references public.organizations (id) on delete restrict,
  store_id uuid not null references public.stores (id) on delete restrict,
  terminal_id uuid not null references public.pos_terminals (id) on delete restrict,
  status public.cash_session_status not null default 'OPEN',
  opening_cash numeric(14, 2) not null check (opening_cash >= 0),
  opened_at timestamptz not null default now(),
  opened_by uuid not null default auth.uid() references public.profiles (id),
  notes text,
  closed_at timestamptz,
  closed_by uuid references public.profiles (id),
  declared_closing_cash numeric(14, 2),
  expected_cash numeric(14, 2),
  variance numeric(14, 2),
  variance_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index cash_sessions_organization_id_idx on public.cash_sessions (organization_id);

create index cash_sessions_store_id_idx on public.cash_sessions (store_id);

create index cash_sessions_opened_by_idx on public.cash_sessions (opened_by);

-- At most one OPEN session per terminal at a time.
create unique index cash_sessions_one_open_per_terminal
  on public.cash_sessions (terminal_id)
  where status = 'OPEN';

create trigger cash_sessions_set_updated_at
  before update on public.cash_sessions
  for each row execute function public.set_updated_at();

-- ============================================================
-- HELPER FUNCTION (same posture as 0006's *_belongs_to_org helpers)
-- ============================================================

create or replace function public.terminal_belongs_to_store(p_terminal_id uuid, p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.pos_terminals
    where id = p_terminal_id
      and store_id = p_store_id
      and organization_id = public.current_org_id()
  );
$$;

revoke all on function public.terminal_belongs_to_store(uuid, uuid) from public;

grant execute on function public.terminal_belongs_to_store(uuid, uuid) to authenticated;

-- ============================================================
-- RLS
-- ============================================================

alter table public.pos_terminals enable row level security;

alter table public.cash_sessions enable row level security;

-- ---------- pos_terminals ----------
-- Same visibility/management posture as `stores`: any accessible-store
-- employee can see the terminal list, only OWNER/ADMIN manage it.

create policy pos_terminals_select on public.pos_terminals
  for select
  to authenticated
  using (
    organization_id = public.current_org_id()
    and (
      public.current_role() in ('OWNER', 'ADMIN')
      or public.has_store_access(store_id)
    )
  );

create policy pos_terminals_insert_admin on public.pos_terminals
  for insert
  to authenticated
  with check (
    organization_id = public.current_org_id()
    and public.current_role() in ('OWNER', 'ADMIN')
  );

create policy pos_terminals_update_admin on public.pos_terminals
  for update
  to authenticated
  using (
    organization_id = public.current_org_id()
    and public.current_role() in ('OWNER', 'ADMIN')
  )
  with check (organization_id = public.current_org_id());

-- No delete policy: deactivate via is_active, matching `stores`.

-- ---------- cash_sessions ----------
-- SELECT mirrors `sales_select` exactly (OWNER/ADMIN/ACCOUNTANT org-wide,
-- everyone else only their accessible stores) so shift visibility at a
-- store never leaks to a different store.
--
-- INSERT (opening a session) is a direct, RLS-governed insert — same
-- posture as `sales_insert` — because opening requires no server-computed
-- aggregate, only ownership/role checks; the partial unique index above
-- is what actually guarantees at most one OPEN session per terminal,
-- atomically, independent of this policy.
--
-- There is deliberately NO update policy for `authenticated`. The only way
-- a session transitions OPEN -> CLOSED is `close_cash_session()` below,
-- which is SECURITY DEFINER (so it bypasses RLS on this table, the same
-- way `post_sale()` bypasses `sales_update`'s WITH CHECK to reach POSTED)
-- and computes expected_cash/variance itself — a client can never write
-- declared_closing_cash, expected_cash, or variance directly.

create policy cash_sessions_select on public.cash_sessions
  for select
  to authenticated
  using (
    organization_id = public.current_org_id()
    and (
      public.current_role() in ('OWNER', 'ADMIN', 'ACCOUNTANT')
      or public.has_store_access(store_id)
    )
  );

create policy cash_sessions_insert on public.cash_sessions
  for insert
  to authenticated
  with check (
    organization_id = public.current_org_id()
    and status = 'OPEN'
    and opened_by = auth.uid()
    and public.store_belongs_to_org(store_id)
    and public.terminal_belongs_to_store(terminal_id, store_id)
    and (
      public.current_role() in ('OWNER', 'ADMIN')
      or (public.current_role() = 'SALES' and public.has_store_access(store_id))
    )
  );

-- No delete policy: a session is a permanent audit record once opened.

-- ============================================================
-- RPC: close_cash_session
--
-- The only write path that can close a session. Recomputes expected cash
-- server-side from existing POSTED sales/customer_receipts/
-- supplier_payments/sales_returns rows (CASH only, this store, this
-- cashier, opened_at..now) — never trusts a client-supplied expected
-- figure. Requires a non-empty reason when actual counted cash differs
-- from expected, per Part D/F ("require explicit confirmation... require a
-- reason if difference != 0"). No journal entry is created and no existing
-- accounting/inventory table is touched — this is an operational/audit
-- layer on top of already-posted accounting, not a new accounting event.
-- ============================================================

create or replace function public.close_cash_session(
  p_session_id uuid,
  p_declared_closing_cash numeric,
  p_variance_reason text default null
)
returns public.cash_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_org_id uuid := public.current_org_id();
  caller_role public.user_role := public.current_role();
  session_row public.cash_sessions;
  cash_sales numeric(14, 2);
  cash_receipts numeric(14, 2);
  cash_payments numeric(14, 2);
  cash_refunds numeric(14, 2);
  computed_expected numeric(14, 2);
  computed_variance numeric(14, 2);
begin
  if caller_org_id is null then
    raise exception 'Not authenticated or no organization';
  end if;

  select * into session_row from public.cash_sessions where id = p_session_id for update;
  if not found or session_row.organization_id <> caller_org_id then
    raise exception 'Cash session not found';
  end if;

  if session_row.status <> 'OPEN' then
    raise exception 'Only an OPEN cash session can be closed (current status: %)', session_row.status;
  end if;

  if caller_role not in ('OWNER', 'ADMIN') and session_row.opened_by <> auth.uid() then
    raise exception 'Only the cashier who opened this session, or an OWNER/ADMIN, may close it';
  end if;

  if p_declared_closing_cash is null or p_declared_closing_cash < 0 then
    raise exception 'Actual counted cash is required and cannot be negative';
  end if;

  select coalesce(sum(total_amount), 0) into cash_sales
  from public.sales
  where store_id = session_row.store_id
    and payment_method = 'CASH'
    and status = 'POSTED'
    and created_by = session_row.opened_by
    and posted_at >= session_row.opened_at
    and posted_at <= now();

  select coalesce(sum(amount), 0) into cash_receipts
  from public.customer_receipts
  where store_id = session_row.store_id
    and payment_method = 'CASH'
    and status = 'POSTED'
    and created_by = session_row.opened_by
    and posted_at >= session_row.opened_at
    and posted_at <= now();

  select coalesce(sum(amount), 0) into cash_payments
  from public.supplier_payments
  where store_id = session_row.store_id
    and payment_method = 'CASH'
    and status = 'POSTED'
    and created_by = session_row.opened_by
    and posted_at >= session_row.opened_at
    and posted_at <= now();

  select coalesce(sum(sr.total_amount), 0) into cash_refunds
  from public.sales_returns sr
  join public.sales s on s.id = sr.original_sale_id
  where sr.store_id = session_row.store_id
    and s.payment_method = 'CASH'
    and sr.status = 'POSTED'
    and sr.created_by = session_row.opened_by
    and sr.posted_at >= session_row.opened_at
    and sr.posted_at <= now();

  computed_expected := session_row.opening_cash + cash_sales + cash_receipts - cash_payments - cash_refunds;
  computed_variance := p_declared_closing_cash - computed_expected;

  if computed_variance <> 0 and (p_variance_reason is null or length(trim(p_variance_reason)) = 0) then
    raise exception 'A reason is required when actual cash does not match expected cash (difference: %)', computed_variance;
  end if;

  update public.cash_sessions
  set status = 'CLOSED',
      closed_at = now(),
      closed_by = auth.uid(),
      declared_closing_cash = p_declared_closing_cash,
      expected_cash = computed_expected,
      variance = computed_variance,
      variance_reason = nullif(trim(coalesce(p_variance_reason, '')), '')
  where id = p_session_id
  returning * into session_row;

  return session_row;
end;
$$;

revoke all on function public.close_cash_session(uuid, numeric, text) from public;

grant execute on function public.close_cash_session(uuid, numeric, text) to authenticated;

-- ============================================================
-- SEED: one real terminal per existing store
--
-- Not fake/placeholder data — a genuinely usable "Counter 01" terminal for
-- every store that exists today, so the existing hardcoded "Terminal 01"
-- label in the POS UI (components/pos/pos-workspace.tsx) has a real row to
-- become the first store-scoped, multi-terminal-ready terminal record for.
-- Safe to run repeatedly (idempotent via ON CONFLICT on the unique
-- (store_id, terminal_code) constraint).
-- ============================================================

insert into public.pos_terminals (organization_id, store_id, terminal_code, terminal_name)
select organization_id, id, 'T1', 'Counter 01'
from public.stores
on conflict (store_id, terminal_code) do nothing
;
