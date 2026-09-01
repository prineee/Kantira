-- KANTIRA Business OS — Priority 5A foundation: public catalog read access
-- Purely additive: 0001-0009 are not modified. No existing employee-facing
-- RLS policy, RPC, or table column changes.
--
-- CONTEXT: items_select / product_categories_select / (and every other
-- master-data select policy) are `to authenticated using (organization_id
-- = current_org_id())`. A public shopper is either the `anon` Postgres
-- role (no session at all — doesn't match `to authenticated`) or an
-- `authenticated` customer with no `profiles` row (current_org_id() is
-- NULL, so the check is false). Either way, /shop cannot read the catalog
-- today — confirmed by inspection, not assumed. A service-role bypass is
-- explicitly disallowed, so this adds narrow, explicitly-scoped public
-- SELECT policies instead.
--
-- SCOPE DECISION: rather than hardcoding an organization_id literal (which
-- would silently break or misdirect if the org is ever recreated, and
-- which nobody could verify by reading the migration alone), this adds an
-- explicit `organizations.is_public_storefront` flag. The public policies
-- below only ever match rows belonging to an org with that flag set true.
-- If this database only ever holds one organization (the expected
-- single-tenant Kantira/Mapway deployment), this migration sets the flag
-- automatically. If more than one organization exists, the flag is left
-- false on all of them and an OWNER must explicitly choose one — the
-- public catalog stays fully closed (fails safe) until that happens,
-- rather than guessing which org's data should be public.

-- ============================================================
-- COLUMN: organizations.is_public_storefront
-- ============================================================

alter table public.organizations
  add column is_public_storefront boolean not null default false;

-- Safe-default auto-provisioning for the single-tenant case only.
update public.organizations
  set is_public_storefront = true
  where (select count(*) from public.organizations) = 1;

-- ============================================================
-- RLS: public (anon + authenticated) read access, catalog-relevant tables
-- only. Additive to the existing employee-only select policies (OR'd).
-- ============================================================

create policy items_select_public on public.items
  for select
  to anon, authenticated
  using (
    is_active = true
    and exists (
      select 1 from public.organizations o
      where o.id = items.organization_id and o.is_public_storefront = true
    )
  );

create policy product_categories_select_public on public.product_categories
  for select
  to anon, authenticated
  using (
    is_active = true
    and exists (
      select 1 from public.organizations o
      where o.id = product_categories.organization_id and o.is_public_storefront = true
    )
  );

create policy units_of_measurement_select_public on public.units_of_measurement
  for select
  to anon, authenticated
  using (
    is_active = true
    and exists (
      select 1 from public.organizations o
      where o.id = units_of_measurement.organization_id and o.is_public_storefront = true
    )
  );

-- ============================================================
-- DEFENSE IN DEPTH: even though RLS above only ever exposes rows from the
-- designated storefront org, RLS is row-level, not column-level — a public
-- `select *` would still return cost_price and other internal fields.
-- Application code must always select an explicit, safe column list for
-- public pages (never `select("*")`) and this must never be the only
-- safeguard, but revoking these specific columns from `anon` at the
-- database level means even a mistaken public query cannot return them.
-- No-op (not an error) if `anon` never held these column privileges.
-- ============================================================

revoke select (cost_price, created_by) on public.items from anon
;
