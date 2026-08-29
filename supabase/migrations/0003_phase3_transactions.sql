-- KANTIRA Business OS — Phase 3: Transactional Business Core
-- Purchases, sales, purchase/sales returns, customer receipts, supplier
-- payments — all posting atomically into the existing Phase 2 double-entry
-- journal and immutable stock ledger. Purely additive: no ALTER TYPE on any
-- Phase 1/2 enum, no modification to 0001/0002 objects.
--
-- Read supabase/migrations/0001_phase1_foundation.sql, 0002_phase2_business_core.sql,
-- and docs/architecture/PHASE_3_MASTER_BLUEPRINT.md before touching this file.

-- ============================================================
-- ENUMS
-- ============================================================

create type public.transaction_status as enum (
  'DRAFT',
  'POSTED',
  'CANCELLED'
);

create type public.payment_method as enum (
  'CASH',
  'BANK',
  'UPI',
  'CARD',
  'CREDIT',
  'OTHER'
);

create type public.document_sequence_type as enum (
  'PURCHASE',
  'SALE',
  'PURCHASE_RETURN',
  'SALE_RETURN',
  'RECEIPT',
  'PAYMENT'
);

-- Deliberately minimal — Phase 2's chart_of_accounts.control_type already
-- covers CUSTOMER/SUPPLIER/CASH/BANK. This only adds what Phase 2 never
-- needed: the accounts a purchase/sale journal entry posts against that
-- aren't a control account for a subsidiary ledger.
create type public.ledger_account_role as enum (
  'INVENTORY',
  'SALES_REVENUE'
);

-- ============================================================
-- DOCUMENT NUMBERING
-- ============================================================

create table public.document_sequences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org_id() references public.organizations (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,
  sequence_type public.document_sequence_type not null,
  prefix text not null default '',
  current_value bigint not null default 0,
  updated_at timestamptz not null default now(),
  unique (organization_id, store_id, sequence_type)
);

create index document_sequences_organization_id_idx on public.document_sequences (organization_id);

-- Safe under concurrency: the UPDATE takes a row lock on this one counter
-- row, so concurrent callers for the same (store, type) serialize on it and
-- always receive distinct values. Never SELECT MAX(...)+1.
create or replace function public.next_document_number(
  p_store_id uuid,
  p_sequence_type public.document_sequence_type
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_org_id uuid := public.current_org_id();
  store_code_val text;
  next_val bigint;
begin
  if caller_org_id is null then
    raise exception 'Not authenticated or no organization';
  end if;

  select store_code into store_code_val
  from public.stores
  where id = p_store_id and organization_id = caller_org_id;

  if store_code_val is null then
    raise exception 'Store not found in organization';
  end if;

  insert into public.document_sequences (organization_id, store_id, sequence_type)
  values (caller_org_id, p_store_id, p_sequence_type)
  on conflict (organization_id, store_id, sequence_type) do nothing;

  update public.document_sequences
    set current_value = current_value + 1,
        updated_at = now()
    where organization_id = caller_org_id
      and store_id = p_store_id
      and sequence_type = p_sequence_type
    returning current_value into next_val;

  return store_code_val || '-' || p_sequence_type::text || '-' || lpad(next_val::text, 6, '0');
end;
$$;

revoke all on function public.next_document_number(uuid, public.document_sequence_type) from public;

grant execute on function public.next_document_number(uuid, public.document_sequence_type) to authenticated;

-- ============================================================
-- ACCOUNT ROLE MAPPING
--
-- Closes the one gap found in Phase 2: chart_of_accounts.control_type
-- identifies counterparty control accounts (customer/supplier/cash/bank)
-- but has no concept of "the" Inventory or "the" Sales Revenue account.
-- Additive table + new enum, not an ALTER TYPE on Phase 2's
-- control_account_type.
-- ============================================================

create table public.account_role_map (
  organization_id uuid not null default public.current_org_id() references public.organizations (id) on delete cascade,
  role public.ledger_account_role not null,
  account_id uuid not null references public.chart_of_accounts (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, role)
);

create trigger account_role_map_set_updated_at
  before update on public.account_role_map
  for each row execute function public.set_updated_at();

-- Raises rather than silently picking a wrong account: an org must
-- configure exactly one mapping per role before it can post anything.
create or replace function public.get_role_account(p_role public.ledger_account_role)
returns uuid
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  result_id uuid;
begin
  select account_id into result_id
  from public.account_role_map
  where organization_id = public.current_org_id() and role = p_role;

  if result_id is null then
    raise exception 'No % account configured for this organization (see account_role_map)', p_role;
  end if;

  return result_id;
end;
$$;

-- Same "raise, don't guess" posture for Phase 2's control_type column.
create or replace function public.get_control_account(p_control_type public.control_account_type)
returns uuid
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  result_id uuid;
  match_count int;
begin
  select id, count(*) over ()
    into result_id, match_count
    from public.chart_of_accounts
    where organization_id = public.current_org_id()
      and control_type = p_control_type
      and is_active = true
    limit 1;

  if result_id is null then
    raise exception 'No active % control account configured for this organization', p_control_type;
  end if;

  if match_count > 1 then
    raise exception 'Multiple active % control accounts found; exactly one is required', p_control_type;
  end if;

  return result_id;
end;
$$;

create or replace function public.control_type_for_payment_method(p_method public.payment_method)
returns public.control_account_type
language sql
immutable
as $$
  select case p_method
    when 'CASH' then 'CASH'::public.control_account_type
    when 'BANK' then 'BANK'::public.control_account_type
    when 'UPI' then 'BANK'::public.control_account_type
    when 'CARD' then 'BANK'::public.control_account_type
    else null
  end;
$$;

-- ============================================================
-- STOCK AVAILABILITY (concurrency-safe, no stored balance)
--
-- Takes a transaction-scoped advisory lock keyed by (store, item) before
-- summing stock_movements, so two concurrent outgoing postings for the same
-- store+item genuinely serialize instead of both reading a stale sum.
-- Called once per line, immediately before that line's OUT movement, from
-- post_sale() and post_purchase_return().
-- ============================================================

create or replace function public.assert_stock_available(
  p_store_id uuid,
  p_item_id uuid,
  p_quantity_needed numeric
)
returns void
language plpgsql
as $$
declare
  available numeric(14, 3);
begin
  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text || ':' || p_item_id::text, 0));

  select coalesce(sum(case when direction = 'IN' then quantity else -quantity end), 0)
    into available
    from public.stock_movements
    where store_id = p_store_id and item_id = p_item_id;

  if available < p_quantity_needed then
    raise exception 'Insufficient stock for item % at store %: available %, requested %',
      p_item_id, p_store_id, available, p_quantity_needed;
  end if;
end;
$$;

-- ============================================================
-- LINE HELPERS: auto line numbering + header total maintenance
-- ============================================================

create or replace function public.assign_line_no()
returns trigger
language plpgsql
as $$
declare
  parent_id_col text := TG_ARGV[0];
  next_no integer;
begin
  execute format(
    'select coalesce(max(line_no), 0) + 1 from public.%I where %I = $1',
    TG_TABLE_NAME, parent_id_col
  )
  into next_no
  using (to_jsonb(new) ->> parent_id_col)::uuid;

  new.line_no := next_no;
  return new;
end;
$$;

-- Header total_amount always derives from subtotal/discount/tax on the
-- header row itself — one formula, one place.
create or replace function public.recalc_document_total_only()
returns trigger
language plpgsql
as $$
begin
  new.total_amount := new.subtotal - new.discount_amount + new.tax_amount;
  return new;
end;
$$;

-- Header subtotal always derives from a live sum of its lines. SECURITY
-- DEFINER so this internal bookkeeping write can't be blocked by the
-- header's own DRAFT-only RLS UPDATE policy in an edge case.
create or replace function public.recalc_document_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_table text := TG_ARGV[0];
  fk_column text := TG_ARGV[1];
  parent_id uuid;
  new_subtotal numeric(14, 2);
begin
  parent_id := (coalesce(to_jsonb(new), to_jsonb(old)) ->> fk_column)::uuid;

  execute format(
    'select coalesce(sum(line_total), 0) from public.%I where %I = $1',
    TG_TABLE_NAME, fk_column
  )
  into new_subtotal
  using parent_id;

  execute format(
    'update public.%I set subtotal = $1, updated_at = now() where id = $2',
    parent_table
  )
  using new_subtotal, parent_id;

  return null;
end;
$$;

-- ============================================================
-- TABLE: purchases
-- ============================================================

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org_id() references public.organizations (id) on delete restrict,
  store_id uuid not null references public.stores (id) on delete restrict,
  supplier_id uuid not null references public.suppliers (id) on delete restrict,
  document_number text not null,
  document_date date not null default current_date,
  reference_number text,
  status public.transaction_status not null default 'DRAFT',
  notes text,
  subtotal numeric(14, 2) not null default 0,
  discount_amount numeric(14, 2) not null default 0 check (discount_amount >= 0),
  tax_amount numeric(14, 2) not null default 0 check (tax_amount >= 0),
  total_amount numeric(14, 2) not null default 0,
  journal_entry_id uuid references public.journal_entries (id) on delete restrict,
  created_by uuid not null default auth.uid() references public.profiles (id),
  posted_at timestamptz,
  posted_by uuid references public.profiles (id),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id),
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, store_id, document_number)
);

create index purchases_organization_id_idx on public.purchases (organization_id);

create index purchases_store_id_idx on public.purchases (store_id);

create index purchases_supplier_id_idx on public.purchases (supplier_id);

create index purchases_status_idx on public.purchases (status);

create index purchases_document_date_idx on public.purchases (document_date);

create trigger purchases_recalc_total
  before insert or update on public.purchases
  for each row execute function public.recalc_document_total_only();

create trigger purchases_set_updated_at
  before update on public.purchases
  for each row execute function public.set_updated_at();

-- ============================================================
-- TABLE: purchase_lines
-- ============================================================

create table public.purchase_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases (id) on delete cascade,
  line_no integer not null,
  item_id uuid not null references public.items (id) on delete restrict,
  uom_id uuid not null references public.units_of_measurement (id) on delete restrict,
  quantity numeric(14, 3) not null check (quantity > 0),
  purchase_rate numeric(14, 4) not null check (purchase_rate >= 0),
  discount_amount numeric(14, 2) not null default 0 check (discount_amount >= 0),
  tax_amount numeric(14, 2) not null default 0 check (tax_amount >= 0),
  line_total numeric(14, 2) generated always as (
    round(quantity * purchase_rate - discount_amount + tax_amount, 2)
  ) stored,
  created_at timestamptz not null default now(),
  unique (purchase_id, line_no)
);

create index purchase_lines_purchase_id_idx on public.purchase_lines (purchase_id);

create index purchase_lines_item_id_idx on public.purchase_lines (item_id);

create trigger purchase_lines_assign_line_no
  before insert on public.purchase_lines
  for each row execute function public.assign_line_no('purchase_id');

create trigger purchase_lines_recalc_totals
  after insert or update or delete on public.purchase_lines
  for each row execute function public.recalc_document_totals('purchases', 'purchase_id');

-- ============================================================
-- TABLE: sales
-- ============================================================

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org_id() references public.organizations (id) on delete restrict,
  store_id uuid not null references public.stores (id) on delete restrict,
  customer_id uuid references public.customers (id) on delete restrict,
  customer_name text,
  invoice_number text not null,
  invoice_date date not null default current_date,
  status public.transaction_status not null default 'DRAFT',
  payment_method public.payment_method not null default 'CASH',
  notes text,
  subtotal numeric(14, 2) not null default 0,
  discount_amount numeric(14, 2) not null default 0 check (discount_amount >= 0),
  tax_amount numeric(14, 2) not null default 0 check (tax_amount >= 0),
  total_amount numeric(14, 2) not null default 0,
  amount_paid numeric(14, 2) not null default 0 check (amount_paid >= 0),
  journal_entry_id uuid references public.journal_entries (id) on delete restrict,
  created_by uuid not null default auth.uid() references public.profiles (id),
  posted_at timestamptz,
  posted_by uuid references public.profiles (id),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id),
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, store_id, invoice_number),
  check (customer_id is not null or customer_name is not null)
);

create index sales_organization_id_idx on public.sales (organization_id);

create index sales_store_id_idx on public.sales (store_id);

create index sales_customer_id_idx on public.sales (customer_id);

create index sales_status_idx on public.sales (status);

create index sales_invoice_date_idx on public.sales (invoice_date);

create trigger sales_recalc_total
  before insert or update on public.sales
  for each row execute function public.recalc_document_total_only();

create trigger sales_set_updated_at
  before update on public.sales
  for each row execute function public.set_updated_at();

-- ============================================================
-- TABLE: sale_lines
-- ============================================================

create table public.sale_lines (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete cascade,
  line_no integer not null,
  item_id uuid not null references public.items (id) on delete restrict,
  uom_id uuid not null references public.units_of_measurement (id) on delete restrict,
  quantity numeric(14, 3) not null check (quantity > 0),
  selling_rate numeric(14, 4) not null check (selling_rate >= 0),
  discount_amount numeric(14, 2) not null default 0 check (discount_amount >= 0),
  tax_amount numeric(14, 2) not null default 0 check (tax_amount >= 0),
  line_total numeric(14, 2) generated always as (
    round(quantity * selling_rate - discount_amount + tax_amount, 2)
  ) stored,
  created_at timestamptz not null default now(),
  unique (sale_id, line_no)
);

create index sale_lines_sale_id_idx on public.sale_lines (sale_id);

create index sale_lines_item_id_idx on public.sale_lines (item_id);

create trigger sale_lines_assign_line_no
  before insert on public.sale_lines
  for each row execute function public.assign_line_no('sale_id');

create trigger sale_lines_recalc_totals
  after insert or update or delete on public.sale_lines
  for each row execute function public.recalc_document_totals('sales', 'sale_id');

-- ============================================================
-- TABLE: purchase_returns / purchase_return_lines
-- ============================================================

create table public.purchase_returns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org_id() references public.organizations (id) on delete restrict,
  store_id uuid not null references public.stores (id) on delete restrict,
  supplier_id uuid not null references public.suppliers (id) on delete restrict,
  original_purchase_id uuid not null references public.purchases (id) on delete restrict,
  return_number text not null,
  return_date date not null default current_date,
  status public.transaction_status not null default 'DRAFT',
  notes text,
  subtotal numeric(14, 2) not null default 0,
  discount_amount numeric(14, 2) not null default 0 check (discount_amount >= 0),
  tax_amount numeric(14, 2) not null default 0 check (tax_amount >= 0),
  total_amount numeric(14, 2) not null default 0,
  journal_entry_id uuid references public.journal_entries (id) on delete restrict,
  created_by uuid not null default auth.uid() references public.profiles (id),
  posted_at timestamptz,
  posted_by uuid references public.profiles (id),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id),
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, store_id, return_number)
);

create index purchase_returns_organization_id_idx on public.purchase_returns (organization_id);

create index purchase_returns_store_id_idx on public.purchase_returns (store_id);

create index purchase_returns_original_purchase_id_idx on public.purchase_returns (original_purchase_id);

create index purchase_returns_status_idx on public.purchase_returns (status);

create trigger purchase_returns_recalc_total
  before insert or update on public.purchase_returns
  for each row execute function public.recalc_document_total_only();

create trigger purchase_returns_set_updated_at
  before update on public.purchase_returns
  for each row execute function public.set_updated_at();

create table public.purchase_return_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_return_id uuid not null references public.purchase_returns (id) on delete cascade,
  original_purchase_line_id uuid not null references public.purchase_lines (id) on delete restrict,
  line_no integer not null,
  item_id uuid not null references public.items (id) on delete restrict,
  uom_id uuid not null references public.units_of_measurement (id) on delete restrict,
  quantity numeric(14, 3) not null check (quantity > 0),
  purchase_rate numeric(14, 4) not null check (purchase_rate >= 0),
  discount_amount numeric(14, 2) not null default 0 check (discount_amount >= 0),
  tax_amount numeric(14, 2) not null default 0 check (tax_amount >= 0),
  line_total numeric(14, 2) generated always as (
    round(quantity * purchase_rate - discount_amount + tax_amount, 2)
  ) stored,
  created_at timestamptz not null default now(),
  unique (purchase_return_id, line_no)
);

create index purchase_return_lines_purchase_return_id_idx on public.purchase_return_lines (purchase_return_id);

create index purchase_return_lines_original_line_idx on public.purchase_return_lines (original_purchase_line_id);

create trigger purchase_return_lines_assign_line_no
  before insert on public.purchase_return_lines
  for each row execute function public.assign_line_no('purchase_return_id');

create trigger purchase_return_lines_recalc_totals
  after insert or update or delete on public.purchase_return_lines
  for each row execute function public.recalc_document_totals('purchase_returns', 'purchase_return_id');

-- ============================================================
-- TABLE: sales_returns / sales_return_lines
-- ============================================================

create table public.sales_returns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org_id() references public.organizations (id) on delete restrict,
  store_id uuid not null references public.stores (id) on delete restrict,
  customer_id uuid references public.customers (id) on delete restrict,
  original_sale_id uuid not null references public.sales (id) on delete restrict,
  return_number text not null,
  return_date date not null default current_date,
  status public.transaction_status not null default 'DRAFT',
  notes text,
  subtotal numeric(14, 2) not null default 0,
  discount_amount numeric(14, 2) not null default 0 check (discount_amount >= 0),
  tax_amount numeric(14, 2) not null default 0 check (tax_amount >= 0),
  total_amount numeric(14, 2) not null default 0,
  journal_entry_id uuid references public.journal_entries (id) on delete restrict,
  created_by uuid not null default auth.uid() references public.profiles (id),
  posted_at timestamptz,
  posted_by uuid references public.profiles (id),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id),
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, store_id, return_number)
);

create index sales_returns_organization_id_idx on public.sales_returns (organization_id);

create index sales_returns_store_id_idx on public.sales_returns (store_id);

create index sales_returns_original_sale_id_idx on public.sales_returns (original_sale_id);

create index sales_returns_status_idx on public.sales_returns (status);

create trigger sales_returns_recalc_total
  before insert or update on public.sales_returns
  for each row execute function public.recalc_document_total_only();

create trigger sales_returns_set_updated_at
  before update on public.sales_returns
  for each row execute function public.set_updated_at();

create table public.sales_return_lines (
  id uuid primary key default gen_random_uuid(),
  sales_return_id uuid not null references public.sales_returns (id) on delete cascade,
  original_sale_line_id uuid not null references public.sale_lines (id) on delete restrict,
  line_no integer not null,
  item_id uuid not null references public.items (id) on delete restrict,
  uom_id uuid not null references public.units_of_measurement (id) on delete restrict,
  quantity numeric(14, 3) not null check (quantity > 0),
  selling_rate numeric(14, 4) not null check (selling_rate >= 0),
  discount_amount numeric(14, 2) not null default 0 check (discount_amount >= 0),
  tax_amount numeric(14, 2) not null default 0 check (tax_amount >= 0),
  line_total numeric(14, 2) generated always as (
    round(quantity * selling_rate - discount_amount + tax_amount, 2)
  ) stored,
  created_at timestamptz not null default now(),
  unique (sales_return_id, line_no)
);

create index sales_return_lines_sales_return_id_idx on public.sales_return_lines (sales_return_id);

create index sales_return_lines_original_line_idx on public.sales_return_lines (original_sale_line_id);

create trigger sales_return_lines_assign_line_no
  before insert on public.sales_return_lines
  for each row execute function public.assign_line_no('sales_return_id');

create trigger sales_return_lines_recalc_totals
  after insert or update or delete on public.sales_return_lines
  for each row execute function public.recalc_document_totals('sales_returns', 'sales_return_id');

-- ============================================================
-- TABLE: customer_receipts
-- ============================================================

create table public.customer_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org_id() references public.organizations (id) on delete restrict,
  store_id uuid not null references public.stores (id) on delete restrict,
  customer_id uuid not null references public.customers (id) on delete restrict,
  receipt_number text not null,
  receipt_date date not null default current_date,
  payment_method public.payment_method not null default 'CASH',
  amount numeric(14, 2) not null check (amount > 0),
  reference_number text,
  notes text,
  status public.transaction_status not null default 'POSTED',
  journal_entry_id uuid references public.journal_entries (id) on delete restrict,
  created_by uuid not null default auth.uid() references public.profiles (id),
  posted_at timestamptz not null default now(),
  posted_by uuid not null default auth.uid() references public.profiles (id),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id),
  cancellation_reason text,
  created_at timestamptz not null default now(),
  unique (organization_id, store_id, receipt_number)
);

create index customer_receipts_organization_id_idx on public.customer_receipts (organization_id);

create index customer_receipts_store_id_idx on public.customer_receipts (store_id);

create index customer_receipts_customer_id_idx on public.customer_receipts (customer_id);

-- ============================================================
-- TABLE: supplier_payments
-- ============================================================

create table public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org_id() references public.organizations (id) on delete restrict,
  store_id uuid not null references public.stores (id) on delete restrict,
  supplier_id uuid not null references public.suppliers (id) on delete restrict,
  payment_number text not null,
  payment_date date not null default current_date,
  payment_method public.payment_method not null default 'CASH',
  amount numeric(14, 2) not null check (amount > 0),
  reference_number text,
  notes text,
  status public.transaction_status not null default 'POSTED',
  journal_entry_id uuid references public.journal_entries (id) on delete restrict,
  created_by uuid not null default auth.uid() references public.profiles (id),
  posted_at timestamptz not null default now(),
  posted_by uuid not null default auth.uid() references public.profiles (id),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id),
  cancellation_reason text,
  created_at timestamptz not null default now(),
  unique (organization_id, store_id, payment_number)
);

create index supplier_payments_organization_id_idx on public.supplier_payments (organization_id);

create index supplier_payments_store_id_idx on public.supplier_payments (store_id);

create index supplier_payments_supplier_id_idx on public.supplier_payments (supplier_id);

-- ============================================================
-- RPC: post_purchase
-- ============================================================

create or replace function public.post_purchase(p_purchase_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_org_id uuid := public.current_org_id();
  caller_role public.user_role := public.current_role();
  purchase_row public.purchases;
  computed_subtotal numeric(14, 2);
  computed_total numeric(14, 2);
  new_journal_id uuid;
  inventory_account_id uuid;
  payable_account_id uuid;
  line_rec record;
begin
  if caller_org_id is null then
    raise exception 'Not authenticated or no organization';
  end if;

  select * into purchase_row from public.purchases where id = p_purchase_id for update;
  if not found or purchase_row.organization_id <> caller_org_id then
    raise exception 'Purchase not found';
  end if;

  if purchase_row.status <> 'DRAFT' then
    raise exception 'Only DRAFT purchases can be posted (current status: %)', purchase_row.status;
  end if;

  if caller_role not in ('OWNER', 'ADMIN') then
    if caller_role <> 'STOCK' or not public.has_store_access(purchase_row.store_id) then
      raise exception 'Insufficient privileges to post purchases for this store';
    end if;
  end if;

  if not exists (select 1 from public.purchase_lines where purchase_id = p_purchase_id) then
    raise exception 'Cannot post a purchase with no line items';
  end if;

  if exists (
    select 1
    from public.purchase_lines pl
    join public.items i on i.id = pl.item_id
    where pl.purchase_id = p_purchase_id and i.organization_id <> caller_org_id
  ) then
    raise exception 'Purchase contains an item from a different organization';
  end if;

  select coalesce(sum(line_total), 0) into computed_subtotal
  from public.purchase_lines where purchase_id = p_purchase_id;

  computed_total := computed_subtotal - purchase_row.discount_amount + purchase_row.tax_amount;

  if computed_total < 0 then
    raise exception 'Computed purchase total cannot be negative';
  end if;

  inventory_account_id := public.get_role_account('INVENTORY');
  payable_account_id := public.get_control_account('SUPPLIER');

  insert into public.journal_entries (
    organization_id, store_id, entry_date, reference, description, source_type, source_id
  ) values (
    caller_org_id, purchase_row.store_id, purchase_row.document_date, purchase_row.document_number,
    'Purchase ' || purchase_row.document_number, 'PURCHASE', p_purchase_id
  ) returning id into new_journal_id;

  insert into public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
  values (new_journal_id, inventory_account_id, computed_total, 0, 'Inventory received: ' || purchase_row.document_number);

  insert into public.journal_entry_lines (journal_entry_id, account_id, supplier_id, debit, credit, description)
  values (new_journal_id, payable_account_id, purchase_row.supplier_id, 0, computed_total, 'Payable: ' || purchase_row.document_number);

  for line_rec in
    select * from public.purchase_lines where purchase_id = p_purchase_id order by line_no
  loop
    insert into public.stock_movements (
      organization_id, store_id, item_id, movement_type, direction, quantity,
      reference, transaction_date, notes, created_by
    ) values (
      caller_org_id, purchase_row.store_id, line_rec.item_id, 'PURCHASE', 'IN', line_rec.quantity,
      purchase_row.document_number, purchase_row.document_date,
      'Purchase ' || purchase_row.document_number, auth.uid()
    );
  end loop;

  update public.purchases
    set status = 'POSTED',
        subtotal = computed_subtotal,
        total_amount = computed_total,
        journal_entry_id = new_journal_id,
        posted_at = now(),
        posted_by = auth.uid()
    where id = p_purchase_id;

  return new_journal_id;
end;
$$;

revoke all on function public.post_purchase(uuid) from public;

grant execute on function public.post_purchase(uuid) to authenticated;

-- ============================================================
-- RPC: post_sale
-- ============================================================

create or replace function public.post_sale(p_sale_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_org_id uuid := public.current_org_id();
  caller_role public.user_role := public.current_role();
  sale_row public.sales;
  computed_subtotal numeric(14, 2);
  computed_total numeric(14, 2);
  new_journal_id uuid;
  revenue_account_id uuid;
  debit_account_id uuid;
  debit_control_type public.control_account_type;
  line_rec record;
begin
  if caller_org_id is null then
    raise exception 'Not authenticated or no organization';
  end if;

  select * into sale_row from public.sales where id = p_sale_id for update;
  if not found or sale_row.organization_id <> caller_org_id then
    raise exception 'Sale not found';
  end if;

  if sale_row.status <> 'DRAFT' then
    raise exception 'Only DRAFT sales can be posted (current status: %)', sale_row.status;
  end if;

  if caller_role not in ('OWNER', 'ADMIN') then
    if caller_role <> 'SALES' or not public.has_store_access(sale_row.store_id) then
      raise exception 'Insufficient privileges to post sales for this store';
    end if;
  end if;

  if not exists (select 1 from public.sale_lines where sale_id = p_sale_id) then
    raise exception 'Cannot post a sale with no line items';
  end if;

  if exists (
    select 1
    from public.sale_lines sl
    join public.items i on i.id = sl.item_id
    where sl.sale_id = p_sale_id and i.organization_id <> caller_org_id
  ) then
    raise exception 'Sale contains an item from a different organization';
  end if;

  if sale_row.customer_id is not null
    and not exists (select 1 from public.customers where id = sale_row.customer_id and organization_id = caller_org_id)
  then
    raise exception 'Customer not found in organization';
  end if;

  select coalesce(sum(line_total), 0) into computed_subtotal
  from public.sale_lines where sale_id = p_sale_id;

  computed_total := computed_subtotal - sale_row.discount_amount + sale_row.tax_amount;

  if computed_total < 0 then
    raise exception 'Computed sale total cannot be negative';
  end if;

  if sale_row.payment_method = 'CREDIT' then
    if sale_row.customer_id is null then
      raise exception 'Credit sales require a registered customer';
    end if;
    if sale_row.amount_paid <> 0 then
      raise exception 'Credit sales cannot have an amount paid';
    end if;
    debit_account_id := public.get_control_account('CUSTOMER');
  else
    debit_control_type := public.control_type_for_payment_method(sale_row.payment_method);
    if debit_control_type is null then
      raise exception 'Unsupported payment method for posting: %', sale_row.payment_method;
    end if;
    debit_account_id := public.get_control_account(debit_control_type);
  end if;

  revenue_account_id := public.get_role_account('SALES_REVENUE');

  insert into public.journal_entries (
    organization_id, store_id, entry_date, reference, description, source_type, source_id
  ) values (
    caller_org_id, sale_row.store_id, sale_row.invoice_date, sale_row.invoice_number,
    'Sale ' || sale_row.invoice_number, 'SALE', p_sale_id
  ) returning id into new_journal_id;

  if sale_row.payment_method = 'CREDIT' then
    insert into public.journal_entry_lines (journal_entry_id, account_id, customer_id, debit, credit, description)
    values (new_journal_id, debit_account_id, sale_row.customer_id, computed_total, 0, 'Receivable: ' || sale_row.invoice_number);
  else
    insert into public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
    values (new_journal_id, debit_account_id, computed_total, 0, 'Payment received: ' || sale_row.invoice_number);
  end if;

  insert into public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
  values (new_journal_id, revenue_account_id, 0, computed_total, 'Revenue: ' || sale_row.invoice_number);

  for line_rec in
    select * from public.sale_lines where sale_id = p_sale_id order by line_no
  loop
    perform public.assert_stock_available(sale_row.store_id, line_rec.item_id, line_rec.quantity);

    insert into public.stock_movements (
      organization_id, store_id, item_id, movement_type, direction, quantity,
      reference, transaction_date, notes, created_by
    ) values (
      caller_org_id, sale_row.store_id, line_rec.item_id, 'SALE', 'OUT', line_rec.quantity,
      sale_row.invoice_number, sale_row.invoice_date,
      'Sale ' || sale_row.invoice_number, auth.uid()
    );
  end loop;

  update public.sales
    set status = 'POSTED',
        subtotal = computed_subtotal,
        total_amount = computed_total,
        journal_entry_id = new_journal_id,
        posted_at = now(),
        posted_by = auth.uid()
    where id = p_sale_id;

  return new_journal_id;
end;
$$;

revoke all on function public.post_sale(uuid) from public;

grant execute on function public.post_sale(uuid) to authenticated;

-- ============================================================
-- RPC: post_purchase_return
-- ============================================================

create or replace function public.post_purchase_return(p_purchase_return_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_org_id uuid := public.current_org_id();
  caller_role public.user_role := public.current_role();
  return_row public.purchase_returns;
  computed_subtotal numeric(14, 2);
  computed_total numeric(14, 2);
  new_journal_id uuid;
  inventory_account_id uuid;
  payable_account_id uuid;
  line_rec record;
  already_returned numeric(14, 3);
  original_qty numeric(14, 3);
begin
  if caller_org_id is null then
    raise exception 'Not authenticated or no organization';
  end if;

  select * into return_row from public.purchase_returns where id = p_purchase_return_id for update;
  if not found or return_row.organization_id <> caller_org_id then
    raise exception 'Purchase return not found';
  end if;

  if return_row.status <> 'DRAFT' then
    raise exception 'Only DRAFT purchase returns can be posted (current status: %)', return_row.status;
  end if;

  if caller_role not in ('OWNER', 'ADMIN') then
    if caller_role <> 'STOCK' or not public.has_store_access(return_row.store_id) then
      raise exception 'Insufficient privileges to post purchase returns for this store';
    end if;
  end if;

  if not exists (select 1 from public.purchase_return_lines where purchase_return_id = p_purchase_return_id) then
    raise exception 'Cannot post a purchase return with no line items';
  end if;

  for line_rec in
    select * from public.purchase_return_lines where purchase_return_id = p_purchase_return_id order by line_no
  loop
    select pl.quantity into original_qty
    from public.purchase_lines pl
    where pl.id = line_rec.original_purchase_line_id and pl.purchase_id = return_row.original_purchase_id;

    if original_qty is null then
      raise exception 'Return line does not reference a line item on the original purchase';
    end if;

    select coalesce(sum(prl.quantity), 0) into already_returned
    from public.purchase_return_lines prl
    join public.purchase_returns pr on pr.id = prl.purchase_return_id
    where prl.original_purchase_line_id = line_rec.original_purchase_line_id
      and pr.status = 'POSTED';

    if already_returned + line_rec.quantity > original_qty then
      raise exception 'Return quantity for line % exceeds remaining returnable quantity (original %, already returned %, requested %)',
        line_rec.line_no, original_qty, already_returned, line_rec.quantity;
    end if;

    perform public.assert_stock_available(return_row.store_id, line_rec.item_id, line_rec.quantity);
  end loop;

  select coalesce(sum(line_total), 0) into computed_subtotal
  from public.purchase_return_lines where purchase_return_id = p_purchase_return_id;

  computed_total := computed_subtotal - return_row.discount_amount + return_row.tax_amount;

  if computed_total < 0 then
    raise exception 'Computed purchase return total cannot be negative';
  end if;

  inventory_account_id := public.get_role_account('INVENTORY');
  payable_account_id := public.get_control_account('SUPPLIER');

  insert into public.journal_entries (
    organization_id, store_id, entry_date, reference, description, source_type, source_id
  ) values (
    caller_org_id, return_row.store_id, return_row.return_date, return_row.return_number,
    'Purchase return ' || return_row.return_number, 'ADJUSTMENT', p_purchase_return_id
  ) returning id into new_journal_id;

  insert into public.journal_entry_lines (journal_entry_id, account_id, supplier_id, debit, credit, description)
  values (new_journal_id, payable_account_id, return_row.supplier_id, computed_total, 0, 'Payable reversed: ' || return_row.return_number);

  insert into public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
  values (new_journal_id, inventory_account_id, 0, computed_total, 'Inventory returned: ' || return_row.return_number);

  for line_rec in
    select * from public.purchase_return_lines where purchase_return_id = p_purchase_return_id order by line_no
  loop
    insert into public.stock_movements (
      organization_id, store_id, item_id, movement_type, direction, quantity,
      reference, transaction_date, notes, created_by
    ) values (
      caller_org_id, return_row.store_id, line_rec.item_id, 'PURCHASE_RETURN', 'OUT', line_rec.quantity,
      return_row.return_number, return_row.return_date,
      'Purchase return ' || return_row.return_number, auth.uid()
    );
  end loop;

  update public.purchase_returns
    set status = 'POSTED',
        subtotal = computed_subtotal,
        total_amount = computed_total,
        journal_entry_id = new_journal_id,
        posted_at = now(),
        posted_by = auth.uid()
    where id = p_purchase_return_id;

  return new_journal_id;
end;
$$;

revoke all on function public.post_purchase_return(uuid) from public;

grant execute on function public.post_purchase_return(uuid) to authenticated;

-- ============================================================
-- RPC: post_sales_return
-- ============================================================

create or replace function public.post_sales_return(p_sales_return_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_org_id uuid := public.current_org_id();
  caller_role public.user_role := public.current_role();
  return_row public.sales_returns;
  original_sale_row public.sales;
  computed_subtotal numeric(14, 2);
  computed_total numeric(14, 2);
  new_journal_id uuid;
  revenue_account_id uuid;
  credit_account_id uuid;
  credit_control_type public.control_account_type;
  line_rec record;
  already_returned numeric(14, 3);
  original_qty numeric(14, 3);
begin
  if caller_org_id is null then
    raise exception 'Not authenticated or no organization';
  end if;

  select * into return_row from public.sales_returns where id = p_sales_return_id for update;
  if not found or return_row.organization_id <> caller_org_id then
    raise exception 'Sales return not found';
  end if;

  if return_row.status <> 'DRAFT' then
    raise exception 'Only DRAFT sales returns can be posted (current status: %)', return_row.status;
  end if;

  if caller_role not in ('OWNER', 'ADMIN') then
    if caller_role <> 'SALES' or not public.has_store_access(return_row.store_id) then
      raise exception 'Insufficient privileges to post sales returns for this store';
    end if;
  end if;

  if not exists (select 1 from public.sales_return_lines where sales_return_id = p_sales_return_id) then
    raise exception 'Cannot post a sales return with no line items';
  end if;

  select * into original_sale_row from public.sales where id = return_row.original_sale_id;
  if original_sale_row is null or original_sale_row.status <> 'POSTED' then
    raise exception 'Original sale is not a posted sale';
  end if;

  for line_rec in
    select * from public.sales_return_lines where sales_return_id = p_sales_return_id order by line_no
  loop
    select sl.quantity into original_qty
    from public.sale_lines sl
    where sl.id = line_rec.original_sale_line_id and sl.sale_id = return_row.original_sale_id;

    if original_qty is null then
      raise exception 'Return line does not reference a line item on the original sale';
    end if;

    select coalesce(sum(srl.quantity), 0) into already_returned
    from public.sales_return_lines srl
    join public.sales_returns sr on sr.id = srl.sales_return_id
    where srl.original_sale_line_id = line_rec.original_sale_line_id
      and sr.status = 'POSTED';

    if already_returned + line_rec.quantity > original_qty then
      raise exception 'Return quantity for line % exceeds remaining returnable quantity (original %, already returned %, requested %)',
        line_rec.line_no, original_qty, already_returned, line_rec.quantity;
    end if;
  end loop;

  select coalesce(sum(line_total), 0) into computed_subtotal
  from public.sales_return_lines where sales_return_id = p_sales_return_id;

  computed_total := computed_subtotal - return_row.discount_amount + return_row.tax_amount;

  if computed_total < 0 then
    raise exception 'Computed sales return total cannot be negative';
  end if;

  revenue_account_id := public.get_role_account('SALES_REVENUE');

  if original_sale_row.payment_method = 'CREDIT' then
    credit_account_id := public.get_control_account('CUSTOMER');
  else
    credit_control_type := public.control_type_for_payment_method(original_sale_row.payment_method);
    if credit_control_type is null then
      raise exception 'Unsupported payment method on original sale for return posting: %', original_sale_row.payment_method;
    end if;
    credit_account_id := public.get_control_account(credit_control_type);
  end if;

  insert into public.journal_entries (
    organization_id, store_id, entry_date, reference, description, source_type, source_id
  ) values (
    caller_org_id, return_row.store_id, return_row.return_date, return_row.return_number,
    'Sales return ' || return_row.return_number, 'ADJUSTMENT', p_sales_return_id
  ) returning id into new_journal_id;

  insert into public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
  values (new_journal_id, revenue_account_id, computed_total, 0, 'Revenue reversed: ' || return_row.return_number);

  if original_sale_row.payment_method = 'CREDIT' then
    insert into public.journal_entry_lines (journal_entry_id, account_id, customer_id, debit, credit, description)
    values (new_journal_id, credit_account_id, original_sale_row.customer_id, 0, computed_total, 'Receivable reversed: ' || return_row.return_number);
  else
    insert into public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
    values (new_journal_id, credit_account_id, 0, computed_total, 'Refund issued: ' || return_row.return_number);
  end if;

  for line_rec in
    select * from public.sales_return_lines where sales_return_id = p_sales_return_id order by line_no
  loop
    insert into public.stock_movements (
      organization_id, store_id, item_id, movement_type, direction, quantity,
      reference, transaction_date, notes, created_by
    ) values (
      caller_org_id, return_row.store_id, line_rec.item_id, 'SALE_RETURN', 'IN', line_rec.quantity,
      return_row.return_number, return_row.return_date,
      'Sales return ' || return_row.return_number, auth.uid()
    );
  end loop;

  update public.sales_returns
    set status = 'POSTED',
        subtotal = computed_subtotal,
        total_amount = computed_total,
        journal_entry_id = new_journal_id,
        posted_at = now(),
        posted_by = auth.uid()
    where id = p_sales_return_id;

  return new_journal_id;
end;
$$;

revoke all on function public.post_sales_return(uuid) from public;

grant execute on function public.post_sales_return(uuid) to authenticated;

-- ============================================================
-- RPC: create_customer_receipt / cancel_customer_receipt
-- ============================================================

create or replace function public.create_customer_receipt(
  p_customer_id uuid,
  p_store_id uuid,
  p_amount numeric,
  p_payment_method public.payment_method default 'CASH',
  p_reference_number text default null,
  p_notes text default null,
  p_receipt_date date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_org_id uuid := public.current_org_id();
  caller_role public.user_role := public.current_role();
  new_receipt_id uuid;
  new_journal_id uuid;
  receipt_no text;
  ar_account_id uuid;
  debit_control_type public.control_account_type;
  debit_account_id uuid;
begin
  if caller_org_id is null then
    raise exception 'Not authenticated or no organization';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Receipt amount must be greater than zero';
  end if;

  if p_payment_method in ('CREDIT', 'OTHER') then
    raise exception 'Unsupported payment method for a receipt: %', p_payment_method;
  end if;

  if not exists (select 1 from public.customers where id = p_customer_id and organization_id = caller_org_id) then
    raise exception 'Customer not found in organization';
  end if;

  if not exists (select 1 from public.stores where id = p_store_id and organization_id = caller_org_id) then
    raise exception 'Store not found in organization';
  end if;

  if caller_role not in ('OWNER', 'ADMIN') then
    if caller_role not in ('SALES', 'ACCOUNTANT') or not public.has_store_access(p_store_id) then
      raise exception 'Insufficient privileges to record receipts for this store';
    end if;
  end if;

  debit_control_type := public.control_type_for_payment_method(p_payment_method);
  debit_account_id := public.get_control_account(debit_control_type);
  ar_account_id := public.get_control_account('CUSTOMER');

  receipt_no := public.next_document_number(p_store_id, 'RECEIPT');

  insert into public.journal_entries (
    organization_id, store_id, entry_date, reference, description, source_type
  ) values (
    caller_org_id, p_store_id, p_receipt_date, receipt_no, 'Customer receipt ' || receipt_no, 'RECEIPT'
  ) returning id into new_journal_id;

  insert into public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
  values (new_journal_id, debit_account_id, p_amount, 0, 'Receipt ' || receipt_no);

  insert into public.journal_entry_lines (journal_entry_id, account_id, customer_id, debit, credit, description)
  values (new_journal_id, ar_account_id, p_customer_id, 0, p_amount, 'Receipt ' || receipt_no);

  insert into public.customer_receipts (
    organization_id, store_id, customer_id, receipt_number, receipt_date, payment_method,
    amount, reference_number, notes, journal_entry_id
  ) values (
    caller_org_id, p_store_id, p_customer_id, receipt_no, p_receipt_date, p_payment_method,
    p_amount, p_reference_number, p_notes, new_journal_id
  ) returning id into new_receipt_id;

  update public.journal_entries set source_id = new_receipt_id where id = new_journal_id;

  return new_receipt_id;
end;
$$;

revoke all on function public.create_customer_receipt(
  uuid, uuid, numeric, public.payment_method, text, text, date
) from public;

grant execute on function public.create_customer_receipt(
  uuid, uuid, numeric, public.payment_method, text, text, date
) to authenticated;

create or replace function public.cancel_customer_receipt(p_receipt_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_org_id uuid := public.current_org_id();
  caller_role public.user_role := public.current_role();
  receipt_row public.customer_receipts;
  reversal_journal_id uuid;
  orig_line record;
begin
  if caller_org_id is null then
    raise exception 'Not authenticated or no organization';
  end if;

  select * into receipt_row from public.customer_receipts where id = p_receipt_id for update;
  if not found or receipt_row.organization_id <> caller_org_id then
    raise exception 'Receipt not found';
  end if;

  if receipt_row.status <> 'POSTED' then
    raise exception 'Only POSTED receipts can be cancelled (current status: %)', receipt_row.status;
  end if;

  if caller_role not in ('OWNER', 'ADMIN', 'ACCOUNTANT') then
    raise exception 'Insufficient privileges to cancel receipts';
  end if;

  insert into public.journal_entries (
    organization_id, store_id, entry_date, reference, description, source_type, source_id
  ) values (
    caller_org_id, receipt_row.store_id, current_date, receipt_row.receipt_number,
    'Cancellation of receipt ' || receipt_row.receipt_number, 'RECEIPT', receipt_row.id
  ) returning id into reversal_journal_id;

  for orig_line in
    select * from public.journal_entry_lines where journal_entry_id = receipt_row.journal_entry_id
  loop
    insert into public.journal_entry_lines (
      journal_entry_id, account_id, customer_id, supplier_id, debit, credit, description
    ) values (
      reversal_journal_id, orig_line.account_id, orig_line.customer_id, orig_line.supplier_id,
      orig_line.credit, orig_line.debit, 'Reversal: ' || coalesce(orig_line.description, '')
    );
  end loop;

  update public.customer_receipts
    set status = 'CANCELLED', cancelled_at = now(), cancelled_by = auth.uid(), cancellation_reason = p_reason
    where id = p_receipt_id;

  return reversal_journal_id;
end;
$$;

revoke all on function public.cancel_customer_receipt(uuid, text) from public;

grant execute on function public.cancel_customer_receipt(uuid, text) to authenticated;

-- ============================================================
-- RPC: create_supplier_payment / cancel_supplier_payment
-- ============================================================

create or replace function public.create_supplier_payment(
  p_supplier_id uuid,
  p_store_id uuid,
  p_amount numeric,
  p_payment_method public.payment_method default 'CASH',
  p_reference_number text default null,
  p_notes text default null,
  p_payment_date date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_org_id uuid := public.current_org_id();
  caller_role public.user_role := public.current_role();
  new_payment_id uuid;
  new_journal_id uuid;
  payment_no text;
  ap_account_id uuid;
  credit_control_type public.control_account_type;
  credit_account_id uuid;
begin
  if caller_org_id is null then
    raise exception 'Not authenticated or no organization';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  if p_payment_method in ('CREDIT', 'OTHER') then
    raise exception 'Unsupported payment method for a payment: %', p_payment_method;
  end if;

  if not exists (select 1 from public.suppliers where id = p_supplier_id and organization_id = caller_org_id) then
    raise exception 'Supplier not found in organization';
  end if;

  if not exists (select 1 from public.stores where id = p_store_id and organization_id = caller_org_id) then
    raise exception 'Store not found in organization';
  end if;

  if caller_role not in ('OWNER', 'ADMIN') then
    if caller_role not in ('STOCK', 'ACCOUNTANT') or not public.has_store_access(p_store_id) then
      raise exception 'Insufficient privileges to record payments for this store';
    end if;
  end if;

  credit_control_type := public.control_type_for_payment_method(p_payment_method);
  credit_account_id := public.get_control_account(credit_control_type);
  ap_account_id := public.get_control_account('SUPPLIER');

  payment_no := public.next_document_number(p_store_id, 'PAYMENT');

  insert into public.journal_entries (
    organization_id, store_id, entry_date, reference, description, source_type
  ) values (
    caller_org_id, p_store_id, p_payment_date, payment_no, 'Supplier payment ' || payment_no, 'PAYMENT'
  ) returning id into new_journal_id;

  insert into public.journal_entry_lines (journal_entry_id, account_id, supplier_id, debit, credit, description)
  values (new_journal_id, ap_account_id, p_supplier_id, p_amount, 0, 'Payment ' || payment_no);

  insert into public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
  values (new_journal_id, credit_account_id, 0, p_amount, 'Payment ' || payment_no);

  insert into public.supplier_payments (
    organization_id, store_id, supplier_id, payment_number, payment_date, payment_method,
    amount, reference_number, notes, journal_entry_id
  ) values (
    caller_org_id, p_store_id, p_supplier_id, payment_no, p_payment_date, p_payment_method,
    p_amount, p_reference_number, p_notes, new_journal_id
  ) returning id into new_payment_id;

  update public.journal_entries set source_id = new_payment_id where id = new_journal_id;

  return new_payment_id;
end;
$$;

revoke all on function public.create_supplier_payment(
  uuid, uuid, numeric, public.payment_method, text, text, date
) from public;

grant execute on function public.create_supplier_payment(
  uuid, uuid, numeric, public.payment_method, text, text, date
) to authenticated;

create or replace function public.cancel_supplier_payment(p_payment_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_org_id uuid := public.current_org_id();
  caller_role public.user_role := public.current_role();
  payment_row public.supplier_payments;
  reversal_journal_id uuid;
  orig_line record;
begin
  if caller_org_id is null then
    raise exception 'Not authenticated or no organization';
  end if;

  select * into payment_row from public.supplier_payments where id = p_payment_id for update;
  if not found or payment_row.organization_id <> caller_org_id then
    raise exception 'Payment not found';
  end if;

  if payment_row.status <> 'POSTED' then
    raise exception 'Only POSTED payments can be cancelled (current status: %)', payment_row.status;
  end if;

  if caller_role not in ('OWNER', 'ADMIN', 'ACCOUNTANT') then
    raise exception 'Insufficient privileges to cancel payments';
  end if;

  insert into public.journal_entries (
    organization_id, store_id, entry_date, reference, description, source_type, source_id
  ) values (
    caller_org_id, payment_row.store_id, current_date, payment_row.payment_number,
    'Cancellation of payment ' || payment_row.payment_number, 'PAYMENT', payment_row.id
  ) returning id into reversal_journal_id;

  for orig_line in
    select * from public.journal_entry_lines where journal_entry_id = payment_row.journal_entry_id
  loop
    insert into public.journal_entry_lines (
      journal_entry_id, account_id, customer_id, supplier_id, debit, credit, description
    ) values (
      reversal_journal_id, orig_line.account_id, orig_line.customer_id, orig_line.supplier_id,
      orig_line.credit, orig_line.debit, 'Reversal: ' || coalesce(orig_line.description, '')
    );
  end loop;

  update public.supplier_payments
    set status = 'CANCELLED', cancelled_at = now(), cancelled_by = auth.uid(), cancellation_reason = p_reason
    where id = p_payment_id;

  return reversal_journal_id;
end;
$$;

revoke all on function public.cancel_supplier_payment(uuid, text) from public;

grant execute on function public.cancel_supplier_payment(uuid, text) to authenticated;

-- ============================================================
-- AUDIT TRAIL
--
-- Reuses Phase 2's record_audit_log() unmodified. Headers only, same
-- reasoning as Phase 2's journal_entry_lines exemption: line tables are
-- insert-only and have no organization_id column of their own.
-- ============================================================

create trigger purchases_audit
  after insert or update or delete on public.purchases
  for each row execute function public.record_audit_log();

create trigger sales_audit
  after insert or update or delete on public.sales
  for each row execute function public.record_audit_log();

create trigger purchase_returns_audit
  after insert or update or delete on public.purchase_returns
  for each row execute function public.record_audit_log();

create trigger sales_returns_audit
  after insert or update or delete on public.sales_returns
  for each row execute function public.record_audit_log();

create trigger customer_receipts_audit
  after insert or update or delete on public.customer_receipts
  for each row execute function public.record_audit_log();

create trigger supplier_payments_audit
  after insert or update or delete on public.supplier_payments
  for each row execute function public.record_audit_log();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.document_sequences enable row level security;

alter table public.account_role_map enable row level security;

alter table public.purchases enable row level security;

alter table public.purchase_lines enable row level security;

alter table public.sales enable row level security;

alter table public.sale_lines enable row level security;

alter table public.purchase_returns enable row level security;

alter table public.purchase_return_lines enable row level security;

alter table public.sales_returns enable row level security;

alter table public.sales_return_lines enable row level security;

alter table public.customer_receipts enable row level security;

alter table public.supplier_payments enable row level security;

-- ---------- document_sequences ----------
-- Internal plumbing: visible to admins for troubleshooting, writable only
-- through next_document_number() (SECURITY DEFINER, bypasses RLS as owner).

create policy document_sequences_select on public.document_sequences
  for select
  to authenticated
  using (
    organization_id = public.current_org_id()
    and public.current_role() in ('OWNER', 'ADMIN')
  );

-- ---------- account_role_map ----------

create policy account_role_map_select on public.account_role_map
  for select
  to authenticated
  using (
    organization_id = public.current_org_id()
    and public.current_role() in ('OWNER', 'ADMIN', 'ACCOUNTANT')
  );

create policy account_role_map_insert on public.account_role_map
  for insert
  to authenticated
  with check (
    organization_id = public.current_org_id()
    and public.current_role() in ('OWNER', 'ADMIN', 'ACCOUNTANT')
  );

create policy account_role_map_update on public.account_role_map
  for update
  to authenticated
  using (
    organization_id = public.current_org_id()
    and public.current_role() in ('OWNER', 'ADMIN', 'ACCOUNTANT')
  )
  with check (organization_id = public.current_org_id());

-- ---------- purchases ----------

create policy purchases_select on public.purchases
  for select
  to authenticated
  using (
    organization_id = public.current_org_id()
    and (
      public.current_role() in ('OWNER', 'ADMIN', 'ACCOUNTANT')
      or public.has_store_access(store_id)
    )
  );

create policy purchases_insert on public.purchases
  for insert
  to authenticated
  with check (
    organization_id = public.current_org_id()
    and status = 'DRAFT'
    and created_by = auth.uid()
    and (
      public.current_role() in ('OWNER', 'ADMIN')
      or (public.current_role() = 'STOCK' and public.has_store_access(store_id))
    )
  );

create policy purchases_update on public.purchases
  for update
  to authenticated
  using (
    status = 'DRAFT'
    and organization_id = public.current_org_id()
    and (
      public.current_role() in ('OWNER', 'ADMIN')
      or (public.current_role() = 'STOCK' and public.has_store_access(store_id))
    )
  )
  with check (
    status in ('DRAFT', 'CANCELLED')
    and organization_id = public.current_org_id()
  );

-- No delete policy: cancel a DRAFT via UPDATE, reverse a POSTED one via a return.

-- ---------- purchase_lines ----------

create policy purchase_lines_select on public.purchase_lines
  for select
  to authenticated
  using (
    exists (
      select 1 from public.purchases p
      where p.id = purchase_lines.purchase_id
        and p.organization_id = public.current_org_id()
        and (
          public.current_role() in ('OWNER', 'ADMIN', 'ACCOUNTANT')
          or public.has_store_access(p.store_id)
        )
    )
  );

create policy purchase_lines_write on public.purchase_lines
  for all
  to authenticated
  using (
    exists (
      select 1 from public.purchases p
      where p.id = purchase_lines.purchase_id
        and p.status = 'DRAFT'
        and p.organization_id = public.current_org_id()
        and (
          public.current_role() in ('OWNER', 'ADMIN')
          or (public.current_role() = 'STOCK' and public.has_store_access(p.store_id))
        )
    )
  )
  with check (
    exists (
      select 1 from public.purchases p
      where p.id = purchase_lines.purchase_id
        and p.status = 'DRAFT'
        and p.organization_id = public.current_org_id()
        and (
          public.current_role() in ('OWNER', 'ADMIN')
          or (public.current_role() = 'STOCK' and public.has_store_access(p.store_id))
        )
    )
  );

-- ---------- sales ----------

create policy sales_select on public.sales
  for select
  to authenticated
  using (
    organization_id = public.current_org_id()
    and (
      public.current_role() in ('OWNER', 'ADMIN', 'ACCOUNTANT')
      or public.has_store_access(store_id)
    )
  );

create policy sales_insert on public.sales
  for insert
  to authenticated
  with check (
    organization_id = public.current_org_id()
    and status = 'DRAFT'
    and created_by = auth.uid()
    and (
      public.current_role() in ('OWNER', 'ADMIN')
      or (public.current_role() = 'SALES' and public.has_store_access(store_id))
    )
  );

create policy sales_update on public.sales
  for update
  to authenticated
  using (
    status = 'DRAFT'
    and organization_id = public.current_org_id()
    and (
      public.current_role() in ('OWNER', 'ADMIN')
      or (public.current_role() = 'SALES' and public.has_store_access(store_id))
    )
  )
  with check (
    status in ('DRAFT', 'CANCELLED')
    and organization_id = public.current_org_id()
  );

-- ---------- sale_lines ----------

create policy sale_lines_select on public.sale_lines
  for select
  to authenticated
  using (
    exists (
      select 1 from public.sales s
      where s.id = sale_lines.sale_id
        and s.organization_id = public.current_org_id()
        and (
          public.current_role() in ('OWNER', 'ADMIN', 'ACCOUNTANT')
          or public.has_store_access(s.store_id)
        )
    )
  );

create policy sale_lines_write on public.sale_lines
  for all
  to authenticated
  using (
    exists (
      select 1 from public.sales s
      where s.id = sale_lines.sale_id
        and s.status = 'DRAFT'
        and s.organization_id = public.current_org_id()
        and (
          public.current_role() in ('OWNER', 'ADMIN')
          or (public.current_role() = 'SALES' and public.has_store_access(s.store_id))
        )
    )
  )
  with check (
    exists (
      select 1 from public.sales s
      where s.id = sale_lines.sale_id
        and s.status = 'DRAFT'
        and s.organization_id = public.current_org_id()
        and (
          public.current_role() in ('OWNER', 'ADMIN')
          or (public.current_role() = 'SALES' and public.has_store_access(s.store_id))
        )
    )
  );

-- ---------- purchase_returns ----------

create policy purchase_returns_select on public.purchase_returns
  for select
  to authenticated
  using (
    organization_id = public.current_org_id()
    and (
      public.current_role() in ('OWNER', 'ADMIN', 'ACCOUNTANT')
      or public.has_store_access(store_id)
    )
  );

create policy purchase_returns_insert on public.purchase_returns
  for insert
  to authenticated
  with check (
    organization_id = public.current_org_id()
    and status = 'DRAFT'
    and created_by = auth.uid()
    and (
      public.current_role() in ('OWNER', 'ADMIN')
      or (public.current_role() = 'STOCK' and public.has_store_access(store_id))
    )
  );

create policy purchase_returns_update on public.purchase_returns
  for update
  to authenticated
  using (
    status = 'DRAFT'
    and organization_id = public.current_org_id()
    and (
      public.current_role() in ('OWNER', 'ADMIN')
      or (public.current_role() = 'STOCK' and public.has_store_access(store_id))
    )
  )
  with check (
    status in ('DRAFT', 'CANCELLED')
    and organization_id = public.current_org_id()
  );

-- ---------- purchase_return_lines ----------

create policy purchase_return_lines_select on public.purchase_return_lines
  for select
  to authenticated
  using (
    exists (
      select 1 from public.purchase_returns pr
      where pr.id = purchase_return_lines.purchase_return_id
        and pr.organization_id = public.current_org_id()
        and (
          public.current_role() in ('OWNER', 'ADMIN', 'ACCOUNTANT')
          or public.has_store_access(pr.store_id)
        )
    )
  );

create policy purchase_return_lines_write on public.purchase_return_lines
  for all
  to authenticated
  using (
    exists (
      select 1 from public.purchase_returns pr
      where pr.id = purchase_return_lines.purchase_return_id
        and pr.status = 'DRAFT'
        and pr.organization_id = public.current_org_id()
        and (
          public.current_role() in ('OWNER', 'ADMIN')
          or (public.current_role() = 'STOCK' and public.has_store_access(pr.store_id))
        )
    )
  )
  with check (
    exists (
      select 1 from public.purchase_returns pr
      where pr.id = purchase_return_lines.purchase_return_id
        and pr.status = 'DRAFT'
        and pr.organization_id = public.current_org_id()
        and (
          public.current_role() in ('OWNER', 'ADMIN')
          or (public.current_role() = 'STOCK' and public.has_store_access(pr.store_id))
        )
    )
  );

-- ---------- sales_returns ----------

create policy sales_returns_select on public.sales_returns
  for select
  to authenticated
  using (
    organization_id = public.current_org_id()
    and (
      public.current_role() in ('OWNER', 'ADMIN', 'ACCOUNTANT')
      or public.has_store_access(store_id)
    )
  );

create policy sales_returns_insert on public.sales_returns
  for insert
  to authenticated
  with check (
    organization_id = public.current_org_id()
    and status = 'DRAFT'
    and created_by = auth.uid()
    and (
      public.current_role() in ('OWNER', 'ADMIN')
      or (public.current_role() = 'SALES' and public.has_store_access(store_id))
    )
  );

create policy sales_returns_update on public.sales_returns
  for update
  to authenticated
  using (
    status = 'DRAFT'
    and organization_id = public.current_org_id()
    and (
      public.current_role() in ('OWNER', 'ADMIN')
      or (public.current_role() = 'SALES' and public.has_store_access(store_id))
    )
  )
  with check (
    status in ('DRAFT', 'CANCELLED')
    and organization_id = public.current_org_id()
  );

-- ---------- sales_return_lines ----------

create policy sales_return_lines_select on public.sales_return_lines
  for select
  to authenticated
  using (
    exists (
      select 1 from public.sales_returns sr
      where sr.id = sales_return_lines.sales_return_id
        and sr.organization_id = public.current_org_id()
        and (
          public.current_role() in ('OWNER', 'ADMIN', 'ACCOUNTANT')
          or public.has_store_access(sr.store_id)
        )
    )
  );

create policy sales_return_lines_write on public.sales_return_lines
  for all
  to authenticated
  using (
    exists (
      select 1 from public.sales_returns sr
      where sr.id = sales_return_lines.sales_return_id
        and sr.status = 'DRAFT'
        and sr.organization_id = public.current_org_id()
        and (
          public.current_role() in ('OWNER', 'ADMIN')
          or (public.current_role() = 'SALES' and public.has_store_access(sr.store_id))
        )
    )
  )
  with check (
    exists (
      select 1 from public.sales_returns sr
      where sr.id = sales_return_lines.sales_return_id
        and sr.status = 'DRAFT'
        and sr.organization_id = public.current_org_id()
        and (
          public.current_role() in ('OWNER', 'ADMIN')
          or (public.current_role() = 'SALES' and public.has_store_access(sr.store_id))
        )
    )
  );

-- ---------- customer_receipts ----------
-- No insert/update policy: created only by create_customer_receipt(),
-- cancelled only by cancel_customer_receipt() (both SECURITY DEFINER).

create policy customer_receipts_select on public.customer_receipts
  for select
  to authenticated
  using (
    organization_id = public.current_org_id()
    and (
      public.current_role() in ('OWNER', 'ADMIN', 'ACCOUNTANT')
      or (public.current_role() = 'SALES' and public.has_store_access(store_id))
    )
  );

-- ---------- supplier_payments ----------

create policy supplier_payments_select on public.supplier_payments
  for select
  to authenticated
  using (
    organization_id = public.current_org_id()
    and (
      public.current_role() in ('OWNER', 'ADMIN', 'ACCOUNTANT')
      or (public.current_role() = 'STOCK' and public.has_store_access(store_id))
    )
  );

