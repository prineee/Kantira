-- KANTIRA Business OS — Security remediation
-- Closes a confirmed cross-organization reference-integrity gap in the
-- Phase 3 transaction header tables, found during disposable-database
-- validation of the Phase 3 UI (never against the authoritative database).
-- Purely additive: 0001-0005 are not modified.
--
-- DEFECT (confirmed by direct reproduction against a disposable copy):
--   The INSERT and UPDATE WITH CHECK clauses on purchases, sales,
--   purchase_returns, and sales_returns verify organization_id = the
--   caller's own org, status, created_by, and — for the STOCK/SALES
--   working role only — has_store_access(store_id). They never verify
--   that store_id, supplier_id, customer_id, original_purchase_id, or
--   original_sale_id actually belong to the caller's own organization.
--   An OWNER/ADMIN (who bypasses the has_store_access check entirely) or
--   any role acting on a known/leaked UUID could insert a row that is
--   correctly owned by their own organization_id but references another
--   organization's real store/supplier/customer/purchase/sale row.
--   Reproduced directly: an Org B OWNER successfully inserted a
--   purchases row with organization_id = Org B but store_id and
--   supplier_id pointing at real Org A records.
--   This is not a cross-tenant data leak — organization_id-scoped RLS
--   elsewhere (stock_balances, journal visibility, etc.) still isolates
--   each org's own data and financials, and the existing item-ownership
--   check inside post_purchase()/post_sale() already blocks a foreign
--   item_id from ever reaching POSTED. But it lets an org create a
--   DRAFT (and, for store_id/supplier_id specifically, a POSTABLE —
--   see below) row that references another tenant's master data via a
--   known UUID, which is a genuine tenant-boundary integrity violation
--   the database should not allow to begin with.
--
-- FIX: five small SECURITY DEFINER STABLE helper functions, matching the
-- exact shape and posture of Phase 1's has_store_access() (single-purpose,
-- plain EXISTS, table-owner-exempt from the referenced table's own RLS so
-- the check itself isn't filtered by the very RLS it's verifying against)
-- — plus the minimal WITH CHECK addition on each of the 8 existing
-- INSERT/UPDATE policies for the four affected tables. Nothing else
-- changes: no table is altered, no column is added or removed, no role
-- gains or loses any previously-held capability, no RPC signature or body
-- changes, no accounting or inventory logic is touched. purchase_lines/
-- sale_lines/purchase_return_lines/sales_return_lines are intentionally
-- untouched — their item_id ownership is already enforced at posting time
-- by post_purchase()/post_sale(), which this migration does not modify.

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

create or replace function public.store_belongs_to_org(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.stores
    where id = p_store_id and organization_id = public.current_org_id()
  );
$$;

create or replace function public.supplier_belongs_to_org(p_supplier_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.suppliers
    where id = p_supplier_id and organization_id = public.current_org_id()
  );
$$;

create or replace function public.customer_belongs_to_org(p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.customers
    where id = p_customer_id and organization_id = public.current_org_id()
  );
$$;

create or replace function public.purchase_belongs_to_org(p_purchase_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.purchases
    where id = p_purchase_id and organization_id = public.current_org_id()
  );
$$;

create or replace function public.sale_belongs_to_org(p_sale_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.sales
    where id = p_sale_id and organization_id = public.current_org_id()
  );
$$;

revoke all on function public.store_belongs_to_org(uuid) from public;
revoke all on function public.supplier_belongs_to_org(uuid) from public;
revoke all on function public.customer_belongs_to_org(uuid) from public;
revoke all on function public.purchase_belongs_to_org(uuid) from public;
revoke all on function public.sale_belongs_to_org(uuid) from public;

grant execute on function public.store_belongs_to_org(uuid) to authenticated;
grant execute on function public.supplier_belongs_to_org(uuid) to authenticated;
grant execute on function public.customer_belongs_to_org(uuid) to authenticated;
grant execute on function public.purchase_belongs_to_org(uuid) to authenticated;
grant execute on function public.sale_belongs_to_org(uuid) to authenticated;

-- ============================================================
-- PURCHASES — add store/supplier ownership to INSERT + UPDATE
-- ============================================================

drop policy if exists purchases_insert on public.purchases;

create policy purchases_insert on public.purchases
  for insert
  to authenticated
  with check (
    organization_id = public.current_org_id()
    and status = 'DRAFT'
    and created_by = auth.uid()
    and public.store_belongs_to_org(store_id)
    and public.supplier_belongs_to_org(supplier_id)
    and (
      public.current_role() in ('OWNER', 'ADMIN')
      or (public.current_role() = 'STOCK' and public.has_store_access(store_id))
    )
  );

drop policy if exists purchases_update on public.purchases;

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
    and public.store_belongs_to_org(store_id)
    and public.supplier_belongs_to_org(supplier_id)
  );

-- ============================================================
-- SALES — add store/customer ownership to INSERT + UPDATE
-- customer_id is nullable (sales.customer_id or customer_name is
-- required by the existing check constraint) — the ownership check is
-- skipped only when customer_id itself is null, never bypassed otherwise.
-- ============================================================

drop policy if exists sales_insert on public.sales;

create policy sales_insert on public.sales
  for insert
  to authenticated
  with check (
    organization_id = public.current_org_id()
    and status = 'DRAFT'
    and created_by = auth.uid()
    and public.store_belongs_to_org(store_id)
    and (customer_id is null or public.customer_belongs_to_org(customer_id))
    and (
      public.current_role() in ('OWNER', 'ADMIN')
      or (public.current_role() = 'SALES' and public.has_store_access(store_id))
    )
  );

drop policy if exists sales_update on public.sales;

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
    and public.store_belongs_to_org(store_id)
    and (customer_id is null or public.customer_belongs_to_org(customer_id))
  );

-- ============================================================
-- PURCHASE RETURNS — add store/supplier/original-purchase ownership
-- ============================================================

drop policy if exists purchase_returns_insert on public.purchase_returns;

create policy purchase_returns_insert on public.purchase_returns
  for insert
  to authenticated
  with check (
    organization_id = public.current_org_id()
    and status = 'DRAFT'
    and created_by = auth.uid()
    and public.store_belongs_to_org(store_id)
    and public.supplier_belongs_to_org(supplier_id)
    and public.purchase_belongs_to_org(original_purchase_id)
    and (
      public.current_role() in ('OWNER', 'ADMIN')
      or (public.current_role() = 'STOCK' and public.has_store_access(store_id))
    )
  );

drop policy if exists purchase_returns_update on public.purchase_returns;

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
    and public.store_belongs_to_org(store_id)
    and public.supplier_belongs_to_org(supplier_id)
    and public.purchase_belongs_to_org(original_purchase_id)
  );

-- ============================================================
-- SALES RETURNS — add store/customer/original-sale ownership
-- ============================================================

drop policy if exists sales_returns_insert on public.sales_returns;

create policy sales_returns_insert on public.sales_returns
  for insert
  to authenticated
  with check (
    organization_id = public.current_org_id()
    and status = 'DRAFT'
    and created_by = auth.uid()
    and public.store_belongs_to_org(store_id)
    and (customer_id is null or public.customer_belongs_to_org(customer_id))
    and public.sale_belongs_to_org(original_sale_id)
    and (
      public.current_role() in ('OWNER', 'ADMIN')
      or (public.current_role() = 'SALES' and public.has_store_access(store_id))
    )
  );

drop policy if exists sales_returns_update on public.sales_returns;

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
    and public.store_belongs_to_org(store_id)
    and (customer_id is null or public.customer_belongs_to_org(customer_id))
    and public.sale_belongs_to_org(original_sale_id)
  );
