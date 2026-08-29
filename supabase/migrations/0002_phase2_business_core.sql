-- KANTIRA Business OS — Phase 2: Business Master Data + Accounting/Inventory Core
-- Adds: product/customer/supplier master data, a proper double-entry accounting
-- ledger, an immutable stock movement ledger, and a generic audit trail.
--
-- Builds on Phase 1 (0001_phase1_foundation.sql): organizations, profiles,
-- stores, employee_store_access, user_role, store_type, current_org_id(),
-- current_role(), has_store_access(), set_updated_at(). None of that is
-- modified here.

-- ============================================================
-- ENUMS
-- ============================================================

create type public.account_type as enum (
  'ASSET',
  'LIABILITY',
  'EQUITY',
  'INCOME',
  'EXPENSE'
);

create type public.balance_side as enum (
  'DEBIT',
  'CREDIT'
);

-- Marks an account as the control account for a subsidiary ledger, so
-- journal_entry_lines posted against it are expected to carry a matching
-- customer_id/supplier_id. Not enforced by a CHECK constraint in Phase 2 —
-- documented convention only, revisit if misuse shows up in practice.
create type public.control_account_type as enum (
  'NONE',
  'CUSTOMER',
  'SUPPLIER',
  'CASH',
  'BANK'
);

create type public.journal_source_type as enum (
  'OPENING',
  'SALE',
  'PURCHASE',
  'PAYMENT',
  'RECEIPT',
  'EXPENSE',
  'INCOME',
  'ADJUSTMENT',
  'TRANSFER',
  'MANUAL'
);

create type public.stock_movement_type as enum (
  'OPENING',
  'PURCHASE',
  'SALE',
  'SALE_RETURN',
  'PURCHASE_RETURN',
  'TRANSFER_OUT',
  'TRANSFER_IN',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
  'DAMAGE',
  'OTHER'
);

create type public.stock_direction as enum (
  'IN',
  'OUT'
);

create type public.audit_action as enum (
  'INSERT',
  'UPDATE',
  'DELETE'
);

-- ============================================================
-- TABLE: product_categories
-- ============================================================

create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org_id() references public.organizations (id) on delete restrict,
  parent_category_id uuid references public.product_categories (id) on delete set null,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create index product_categories_organization_id_idx on public.product_categories (organization_id);

create index product_categories_parent_category_id_idx on public.product_categories (parent_category_id);

create trigger product_categories_set_updated_at
  before update on public.product_categories
  for each row execute function public.set_updated_at();

-- ============================================================
-- TABLE: units_of_measurement
-- ============================================================

create table public.units_of_measurement (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org_id() references public.organizations (id) on delete restrict,
  code text not null,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create index units_of_measurement_organization_id_idx on public.units_of_measurement (organization_id);

create trigger units_of_measurement_set_updated_at
  before update on public.units_of_measurement
  for each row execute function public.set_updated_at();

-- ============================================================
-- TABLE: items (products)
-- ============================================================

create table public.items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org_id() references public.organizations (id) on delete restrict,
  category_id uuid references public.product_categories (id) on delete set null,
  uom_id uuid not null references public.units_of_measurement (id) on delete restrict,
  sku text not null,
  barcode text,
  name text not null,
  description text,
  hsn_code text,
  cost_price numeric(14, 2) not null default 0 check (cost_price >= 0),
  selling_price numeric(14, 2) not null default 0 check (selling_price >= 0),
  tax_rate_percent numeric(5, 2) not null default 0 check (tax_rate_percent >= 0),
  reorder_level numeric(14, 3) not null default 0 check (reorder_level >= 0),
  track_inventory boolean not null default true,
  is_active boolean not null default true,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, sku)
);

create unique index items_organization_id_barcode_key
  on public.items (organization_id, barcode)
  where barcode is not null;

create index items_organization_id_idx on public.items (organization_id);

create index items_category_id_idx on public.items (category_id);

create index items_uom_id_idx on public.items (uom_id);

create trigger items_set_updated_at
  before update on public.items
  for each row execute function public.set_updated_at();

-- ============================================================
-- TABLE: customers
-- ============================================================

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org_id() references public.organizations (id) on delete restrict,
  customer_code text not null,
  name text not null,
  phone text,
  email text,
  gstin text,
  billing_address text,
  is_active boolean not null default true,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, customer_code)
);

create index customers_organization_id_idx on public.customers (organization_id);

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

-- ============================================================
-- TABLE: suppliers
-- ============================================================

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org_id() references public.organizations (id) on delete restrict,
  supplier_code text not null,
  name text not null,
  phone text,
  email text,
  gstin text,
  billing_address text,
  is_active boolean not null default true,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, supplier_code)
);

create index suppliers_organization_id_idx on public.suppliers (organization_id);

create trigger suppliers_set_updated_at
  before update on public.suppliers
  for each row execute function public.set_updated_at();

-- ============================================================
-- TABLE: chart_of_accounts
-- ============================================================

create table public.chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org_id() references public.organizations (id) on delete restrict,
  parent_account_id uuid references public.chart_of_accounts (id) on delete set null,
  account_code text not null,
  account_name text not null,
  account_type public.account_type not null,
  normal_balance public.balance_side not null,
  control_type public.control_account_type not null default 'NONE',
  is_active boolean not null default true,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, account_code),
  check (
    (account_type in ('ASSET', 'EXPENSE') and normal_balance = 'DEBIT')
    or (account_type in ('LIABILITY', 'EQUITY', 'INCOME') and normal_balance = 'CREDIT')
  )
);

create index chart_of_accounts_organization_id_idx on public.chart_of_accounts (organization_id);

create index chart_of_accounts_parent_account_id_idx on public.chart_of_accounts (parent_account_id);

create trigger chart_of_accounts_set_updated_at
  before update on public.chart_of_accounts
  for each row execute function public.set_updated_at();

-- ============================================================
-- TABLE: journal_entries (the accounting journal — one row per transaction)
-- ============================================================

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org_id() references public.organizations (id) on delete restrict,
  store_id uuid references public.stores (id) on delete restrict,
  entry_date date not null default current_date,
  reference text,
  description text,
  source_type public.journal_source_type not null default 'MANUAL',
  source_id uuid,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index journal_entries_organization_id_idx on public.journal_entries (organization_id);

create index journal_entries_store_id_idx on public.journal_entries (store_id);

create index journal_entries_entry_date_idx on public.journal_entries (entry_date);

create index journal_entries_source_idx on public.journal_entries (source_type, source_id);

create trigger journal_entries_set_updated_at
  before update on public.journal_entries
  for each row execute function public.set_updated_at();

-- ============================================================
-- TABLE: journal_entry_lines (the individual debit/credit postings)
-- ============================================================

create table public.journal_entry_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references public.journal_entries (id) on delete cascade,
  account_id uuid not null references public.chart_of_accounts (id) on delete restrict,
  customer_id uuid references public.customers (id) on delete restrict,
  supplier_id uuid references public.suppliers (id) on delete restrict,
  debit numeric(14, 2) not null default 0 check (debit >= 0),
  credit numeric(14, 2) not null default 0 check (credit >= 0),
  description text,
  created_at timestamptz not null default now(),
  check (not (debit > 0 and credit > 0)),
  check (debit > 0 or credit > 0),
  check (not (customer_id is not null and supplier_id is not null))
);

create index journal_entry_lines_journal_entry_id_idx on public.journal_entry_lines (journal_entry_id);

create index journal_entry_lines_account_id_idx on public.journal_entry_lines (account_id);

create index journal_entry_lines_customer_id_idx on public.journal_entry_lines (customer_id);

create index journal_entry_lines_supplier_id_idx on public.journal_entry_lines (supplier_id);

-- Defense in depth: even though the only write path is create_journal_entry()
-- below (which checks the total before returning), this deferred constraint
-- trigger re-validates at commit time that every journal entry's lines sum to
-- debit = credit, the same "trust the database, not the caller" posture as
-- Phase 1's profiles_guard_privilege_columns trigger.
create or replace function public.validate_journal_entry_balance()
returns trigger
language plpgsql
as $$
declare
  target_entry_id uuid;
  total_debit numeric(14, 2);
  total_credit numeric(14, 2);
begin
  target_entry_id := coalesce(new.journal_entry_id, old.journal_entry_id);

  select coalesce(sum(debit), 0), coalesce(sum(credit), 0)
    into total_debit, total_credit
    from public.journal_entry_lines
    where journal_entry_id = target_entry_id;

  if total_debit <> total_credit then
    raise exception 'Journal entry % is not balanced: debit % <> credit %',
      target_entry_id, total_debit, total_credit;
  end if;

  return null;
end;
$$;

create constraint trigger journal_entry_lines_balance_check
  after insert or update or delete on public.journal_entry_lines
  deferrable initially deferred
  for each row execute function public.validate_journal_entry_balance();

-- ============================================================
-- RPC: create_journal_entry
--
-- The only way journal_entries/journal_entry_lines rows get created — there
-- is no direct INSERT policy on either table (same pattern as Phase 1's
-- create_organization_with_owner). Callers pass the full set of lines as
-- jsonb; the function posts the header and every line inside one atomic
-- transaction and re-checks the debit/credit total explicitly before
-- returning, in addition to the deferred trigger above.
--
-- Line shape: { "account_id": uuid, "debit": number, "credit": number,
--               "customer_id"?: uuid, "supplier_id"?: uuid, "description"?: text }
-- ============================================================

create or replace function public.create_journal_entry(
  p_entry_date date,
  p_description text,
  p_lines jsonb,
  p_store_id uuid default null,
  p_reference text default null,
  p_source_type public.journal_source_type default 'MANUAL',
  p_source_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_entry_id uuid;
  caller_org_id uuid := public.current_org_id();
  caller_role public.user_role := public.current_role();
  line jsonb;
  total_debit numeric(14, 2) := 0;
  total_credit numeric(14, 2) := 0;
begin
  if caller_org_id is null then
    raise exception 'Not authenticated or no organization';
  end if;

  if caller_role not in ('OWNER', 'ADMIN', 'ACCOUNTANT') then
    raise exception 'Insufficient privileges to post journal entries';
  end if;

  if p_lines is null or jsonb_array_length(p_lines) < 2 then
    raise exception 'A journal entry requires at least two lines';
  end if;

  if p_store_id is not null and not exists (
    select 1 from public.stores where id = p_store_id and organization_id = caller_org_id
  ) then
    raise exception 'Store not found in organization';
  end if;

  insert into public.journal_entries (
    organization_id, store_id, entry_date, reference, description, source_type, source_id
  )
  values (
    caller_org_id, p_store_id, p_entry_date, p_reference, p_description, p_source_type, p_source_id
  )
  returning id into new_entry_id;

  for line in select * from jsonb_array_elements(p_lines)
  loop
    insert into public.journal_entry_lines (
      journal_entry_id, account_id, customer_id, supplier_id, debit, credit, description
    )
    values (
      new_entry_id,
      (line ->> 'account_id')::uuid,
      nullif(line ->> 'customer_id', '')::uuid,
      nullif(line ->> 'supplier_id', '')::uuid,
      coalesce((line ->> 'debit')::numeric, 0),
      coalesce((line ->> 'credit')::numeric, 0),
      line ->> 'description'
    );

    total_debit := total_debit + coalesce((line ->> 'debit')::numeric, 0);
    total_credit := total_credit + coalesce((line ->> 'credit')::numeric, 0);
  end loop;

  if total_debit <> total_credit then
    raise exception 'Journal entry lines are not balanced: debit % <> credit %', total_debit, total_credit;
  end if;

  return new_entry_id;
end;
$$;

revoke all on function public.create_journal_entry(
  date, text, jsonb, uuid, text, public.journal_source_type, uuid
) from public;

grant execute on function public.create_journal_entry(
  date, text, jsonb, uuid, text, public.journal_source_type, uuid
) to authenticated;

-- ============================================================
-- TABLE: stock_movements
--
-- Immutable append-only ledger. Stock on hand is never stored directly —
-- it is always derived by summing movements (see stock_balances view
-- below). No UPDATE or DELETE policy exists for this table anywhere in
-- this migration; a correction is made by posting an offsetting movement,
-- never by editing history.
-- ============================================================

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org_id() references public.organizations (id) on delete restrict,
  store_id uuid not null references public.stores (id) on delete restrict,
  item_id uuid not null references public.items (id) on delete restrict,
  movement_type public.stock_movement_type not null,
  direction public.stock_direction not null,
  quantity numeric(14, 3) not null check (quantity > 0),
  reference text,
  transfer_group_id uuid,
  transaction_date date not null default current_date,
  notes text,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  check (
    case movement_type
      when 'OPENING' then direction = 'IN'
      when 'PURCHASE' then direction = 'IN'
      when 'SALE_RETURN' then direction = 'IN'
      when 'TRANSFER_IN' then direction = 'IN'
      when 'ADJUSTMENT_IN' then direction = 'IN'
      when 'SALE' then direction = 'OUT'
      when 'PURCHASE_RETURN' then direction = 'OUT'
      when 'TRANSFER_OUT' then direction = 'OUT'
      when 'ADJUSTMENT_OUT' then direction = 'OUT'
      when 'DAMAGE' then direction = 'OUT'
      else true
    end
  )
);

create index stock_movements_organization_id_idx on public.stock_movements (organization_id);

create index stock_movements_store_item_idx on public.stock_movements (store_id, item_id);

create index stock_movements_item_id_idx on public.stock_movements (item_id);

create index stock_movements_transfer_group_id_idx on public.stock_movements (transfer_group_id);

create index stock_movements_transaction_date_idx on public.stock_movements (transaction_date);

-- ============================================================
-- VIEW: stock_balances
--
-- "Store stock" is deliberately not a table. It is always this derived
-- aggregate over stock_movements, so it can never drift from the ledger.
-- security_invoker makes it apply the querying user's own RLS on
-- stock_movements rather than the view owner's.
-- ============================================================

create view public.stock_balances
with (security_invoker = true) as
select
  sm.organization_id,
  sm.store_id,
  sm.item_id,
  sum(case when sm.direction = 'IN' then sm.quantity else -sm.quantity end) as quantity_on_hand
from public.stock_movements sm
group by sm.organization_id, sm.store_id, sm.item_id;

grant select on public.stock_balances to authenticated;

-- ============================================================
-- RPC: create_stock_transfer
--
-- The only way TRANSFER_OUT/TRANSFER_IN rows get created (the RLS insert
-- policy below explicitly excludes those two movement types). Inserts both
-- legs atomically under one transfer_group_id so a transfer between two
-- stores is always traceable as a single business operation, never a
-- half-recorded one.
-- ============================================================

create or replace function public.create_stock_transfer(
  p_from_store_id uuid,
  p_to_store_id uuid,
  p_item_id uuid,
  p_quantity numeric,
  p_reference text default null,
  p_transaction_date date default current_date,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_org_id uuid := public.current_org_id();
  caller_role public.user_role := public.current_role();
  group_id uuid := gen_random_uuid();
begin
  if caller_org_id is null then
    raise exception 'Not authenticated or no organization';
  end if;

  if p_from_store_id = p_to_store_id then
    raise exception 'Source and destination stores must be different';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Transfer quantity must be greater than zero';
  end if;

  if not exists (
    select 1 from public.stores where id = p_from_store_id and organization_id = caller_org_id
  ) then
    raise exception 'Source store not found in organization';
  end if;

  if not exists (
    select 1 from public.stores where id = p_to_store_id and organization_id = caller_org_id
  ) then
    raise exception 'Destination store not found in organization';
  end if;

  if caller_role not in ('OWNER', 'ADMIN') then
    if caller_role <> 'STOCK'
      or not public.has_store_access(p_from_store_id)
      or not public.has_store_access(p_to_store_id) then
      raise exception 'Insufficient privileges to transfer stock between these stores';
    end if;
  end if;

  insert into public.stock_movements (
    organization_id, store_id, item_id, movement_type, direction, quantity,
    reference, transfer_group_id, transaction_date, notes, created_by
  ) values (
    caller_org_id, p_from_store_id, p_item_id, 'TRANSFER_OUT', 'OUT', p_quantity,
    p_reference, group_id, p_transaction_date, p_notes, auth.uid()
  );

  insert into public.stock_movements (
    organization_id, store_id, item_id, movement_type, direction, quantity,
    reference, transfer_group_id, transaction_date, notes, created_by
  ) values (
    caller_org_id, p_to_store_id, p_item_id, 'TRANSFER_IN', 'IN', p_quantity,
    p_reference, group_id, p_transaction_date, p_notes, auth.uid()
  );

  return group_id;
end;
$$;

revoke all on function public.create_stock_transfer(
  uuid, uuid, uuid, numeric, text, date, text
) from public;

grant execute on function public.create_stock_transfer(
  uuid, uuid, uuid, numeric, text, date, text
) to authenticated;

-- ============================================================
-- TABLE: audit_log
--
-- Generic change history for the tables where "who changed what, when"
-- matters most: master data plus the ledger headers. journal_entry_lines
-- and stock_movements' own rows are already an immutable ledger (insert
-- only, no update/delete policy), so their INSERT is what audit_log's
-- stock_movements/journal_entries rows capture; there is intentionally no
-- separate audit trigger on journal_entry_lines itself in Phase 2.
-- ============================================================

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  table_name text not null,
  record_id uuid not null,
  action public.audit_action not null,
  changed_by uuid references public.profiles (id),
  changed_at timestamptz not null default now(),
  old_data jsonb,
  new_data jsonb
);

create index audit_log_organization_id_idx on public.audit_log (organization_id);

create index audit_log_table_record_idx on public.audit_log (table_name, record_id);

create index audit_log_changed_at_idx on public.audit_log (changed_at);

-- SECURITY DEFINER so it can always write to audit_log regardless of the
-- calling user's own RLS grants on that table (same "table owner is exempt
-- from RLS" reasoning Phase 1 uses for current_org_id() etc).
create or replace function public.record_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_org_id uuid;
begin
  row_org_id := case when tg_op = 'DELETE' then old.organization_id else new.organization_id end;

  insert into public.audit_log (organization_id, table_name, record_id, action, changed_by, old_data, new_data)
  values (
    row_org_id,
    tg_table_name,
    case when tg_op = 'DELETE' then old.id else new.id end,
    tg_op::public.audit_action,
    auth.uid(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  return null;
end;
$$;

create trigger items_audit
  after insert or update or delete on public.items
  for each row execute function public.record_audit_log();

create trigger customers_audit
  after insert or update or delete on public.customers
  for each row execute function public.record_audit_log();

create trigger suppliers_audit
  after insert or update or delete on public.suppliers
  for each row execute function public.record_audit_log();

create trigger chart_of_accounts_audit
  after insert or update or delete on public.chart_of_accounts
  for each row execute function public.record_audit_log();

create trigger journal_entries_audit
  after insert or update or delete on public.journal_entries
  for each row execute function public.record_audit_log();

create trigger stock_movements_audit
  after insert or update or delete on public.stock_movements
  for each row execute function public.record_audit_log();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.product_categories enable row level security;

alter table public.units_of_measurement enable row level security;

alter table public.items enable row level security;

alter table public.customers enable row level security;

alter table public.suppliers enable row level security;

alter table public.chart_of_accounts enable row level security;

alter table public.journal_entries enable row level security;

alter table public.journal_entry_lines enable row level security;

alter table public.stock_movements enable row level security;

alter table public.audit_log enable row level security;

-- ---------- product_categories ----------

create policy product_categories_select on public.product_categories
  for select
  to authenticated
  using (organization_id = public.current_org_id());

create policy product_categories_insert on public.product_categories
  for insert
  to authenticated
  with check (
    organization_id = public.current_org_id()
    and public.current_role() in ('OWNER', 'ADMIN', 'STOCK')
  );

create policy product_categories_update on public.product_categories
  for update
  to authenticated
  using (
    organization_id = public.current_org_id()
    and public.current_role() in ('OWNER', 'ADMIN', 'STOCK')
  )
  with check (organization_id = public.current_org_id());

-- No delete policy: deactivate via is_active.

-- ---------- units_of_measurement ----------

create policy units_of_measurement_select on public.units_of_measurement
  for select
  to authenticated
  using (organization_id = public.current_org_id());

create policy units_of_measurement_insert on public.units_of_measurement
  for insert
  to authenticated
  with check (
    organization_id = public.current_org_id()
    and public.current_role() in ('OWNER', 'ADMIN', 'STOCK')
  );

create policy units_of_measurement_update on public.units_of_measurement
  for update
  to authenticated
  using (
    organization_id = public.current_org_id()
    and public.current_role() in ('OWNER', 'ADMIN', 'STOCK')
  )
  with check (organization_id = public.current_org_id());

-- No delete policy: deactivate via is_active.

-- ---------- items ----------

create policy items_select on public.items
  for select
  to authenticated
  using (organization_id = public.current_org_id());

create policy items_insert on public.items
  for insert
  to authenticated
  with check (
    organization_id = public.current_org_id()
    and created_by = auth.uid()
    and public.current_role() in ('OWNER', 'ADMIN', 'STOCK')
  );

create policy items_update on public.items
  for update
  to authenticated
  using (
    organization_id = public.current_org_id()
    and public.current_role() in ('OWNER', 'ADMIN', 'STOCK')
  )
  with check (organization_id = public.current_org_id());

-- No delete policy: deactivate via is_active.

-- ---------- customers ----------

create policy customers_select on public.customers
  for select
  to authenticated
  using (organization_id = public.current_org_id());

create policy customers_insert on public.customers
  for insert
  to authenticated
  with check (
    organization_id = public.current_org_id()
    and created_by = auth.uid()
    and public.current_role() in ('OWNER', 'ADMIN', 'SALES', 'ACCOUNTANT')
  );

create policy customers_update on public.customers
  for update
  to authenticated
  using (
    organization_id = public.current_org_id()
    and public.current_role() in ('OWNER', 'ADMIN', 'SALES', 'ACCOUNTANT')
  )
  with check (organization_id = public.current_org_id());

-- No delete policy: deactivate via is_active.

-- ---------- suppliers ----------

create policy suppliers_select on public.suppliers
  for select
  to authenticated
  using (organization_id = public.current_org_id());

create policy suppliers_insert on public.suppliers
  for insert
  to authenticated
  with check (
    organization_id = public.current_org_id()
    and created_by = auth.uid()
    and public.current_role() in ('OWNER', 'ADMIN', 'ACCOUNTANT', 'STOCK')
  );

create policy suppliers_update on public.suppliers
  for update
  to authenticated
  using (
    organization_id = public.current_org_id()
    and public.current_role() in ('OWNER', 'ADMIN', 'ACCOUNTANT', 'STOCK')
  )
  with check (organization_id = public.current_org_id());

-- No delete policy: deactivate via is_active.

-- ---------- chart_of_accounts ----------
-- Financial structure is finance-roles-only, unlike the other master data.

create policy chart_of_accounts_select on public.chart_of_accounts
  for select
  to authenticated
  using (
    organization_id = public.current_org_id()
    and public.current_role() in ('OWNER', 'ADMIN', 'ACCOUNTANT')
  );

create policy chart_of_accounts_insert on public.chart_of_accounts
  for insert
  to authenticated
  with check (
    organization_id = public.current_org_id()
    and created_by = auth.uid()
    and public.current_role() in ('OWNER', 'ADMIN', 'ACCOUNTANT')
  );

create policy chart_of_accounts_update on public.chart_of_accounts
  for update
  to authenticated
  using (
    organization_id = public.current_org_id()
    and public.current_role() in ('OWNER', 'ADMIN', 'ACCOUNTANT')
  )
  with check (organization_id = public.current_org_id());

-- No delete policy: deactivate via is_active.

-- ---------- journal_entries / journal_entry_lines ----------
-- Select-only: all writes happen inside create_journal_entry() (SECURITY
-- DEFINER), the same "no direct insert policy" posture Phase 1 uses for
-- organizations + create_organization_with_owner().

create policy journal_entries_select on public.journal_entries
  for select
  to authenticated
  using (
    organization_id = public.current_org_id()
    and public.current_role() in ('OWNER', 'ADMIN', 'ACCOUNTANT')
  );

create policy journal_entry_lines_select on public.journal_entry_lines
  for select
  to authenticated
  using (
    exists (
      select 1 from public.journal_entries je
      where je.id = journal_entry_lines.journal_entry_id
        and je.organization_id = public.current_org_id()
        and public.current_role() in ('OWNER', 'ADMIN', 'ACCOUNTANT')
    )
  );

-- ---------- stock_movements ----------
-- Select-only for finance roles or anyone with access to the store; insert
-- allowed for single-leg movement types only — TRANSFER_IN/TRANSFER_OUT can
-- only be created via create_stock_transfer(). No update/delete policy
-- anywhere: the ledger is immutable.

create policy stock_movements_select on public.stock_movements
  for select
  to authenticated
  using (
    organization_id = public.current_org_id()
    and (
      public.current_role() in ('OWNER', 'ADMIN', 'ACCOUNTANT')
      or public.has_store_access(store_id)
    )
  );

create policy stock_movements_insert on public.stock_movements
  for insert
  to authenticated
  with check (
    organization_id = public.current_org_id()
    and movement_type not in ('TRANSFER_IN', 'TRANSFER_OUT')
    and created_by = auth.uid()
    and (
      public.current_role() in ('OWNER', 'ADMIN')
      or (public.current_role() = 'STOCK' and public.has_store_access(store_id))
    )
  );

-- ---------- audit_log ----------
-- Read-only from the API; every row is written by record_audit_log()
-- (SECURITY DEFINER), never by direct client insert.

create policy audit_log_select on public.audit_log
  for select
  to authenticated
  using (
    organization_id = public.current_org_id()
    and public.current_role() in ('OWNER', 'ADMIN')
  );

