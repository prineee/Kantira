-- KANTIRA Business OS — Priority 5A: public catalog org-check via helper
-- function instead of an inline subquery
--
-- Fixes a second incompleteness in 0010, found during live smoke testing
-- immediately after 0011: items_select_public (and the product_categories/
-- units_of_measurement equivalents) contain `exists (select 1 from
-- public.organizations o where ...)`. An RLS policy's own USING clause
-- runs with the querying role's privileges, not elevated — so this
-- subquery itself needs `anon` to be able to read `organizations`, which
-- it never was and should not be (organizations has no anon-facing policy
-- at all, by design — even exposing id/is_public_storefront to anon is
-- more surface than necessary).
--
-- Fix: a SECURITY DEFINER helper, same posture as 0006's
-- store_belongs_to_org/customer_belongs_to_org/etc — the ONLY table this
-- reads directly, bypassing RLS by virtue of being SECURITY DEFINER owned
-- by the table owner (identical mechanism to how post_sale() bypasses
-- sales_update's WITH CHECK to reach POSTED). anon never gets any grant or
-- policy on organizations itself; it only gets EXECUTE on this one
-- narrow, boolean-returning function.
--
-- Purely additive/corrective: 0001-0009, 0011 are not touched. This
-- replaces only the 3 brand-new public policies 0010 added (drop + create,
-- same pattern 0006 used to redefine sales_insert/sales_update) — no
-- employee-facing policy from 0001-0009 is touched.

create or replace function public.is_org_public_storefront(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_public_storefront from public.organizations where id = p_org_id),
    false
  );
$$;

revoke all on function public.is_org_public_storefront(uuid) from public;

grant execute on function public.is_org_public_storefront(uuid) to anon, authenticated;

drop policy if exists items_select_public on public.items;

create policy items_select_public on public.items
  for select
  to anon, authenticated
  using (
    is_active = true
    and public.is_org_public_storefront(organization_id)
  );

drop policy if exists product_categories_select_public on public.product_categories;

create policy product_categories_select_public on public.product_categories
  for select
  to anon, authenticated
  using (
    is_active = true
    and public.is_org_public_storefront(organization_id)
  );

drop policy if exists units_of_measurement_select_public on public.units_of_measurement;

create policy units_of_measurement_select_public on public.units_of_measurement
  for select
  to anon, authenticated
  using (
    is_active = true
    and public.is_org_public_storefront(organization_id)
  )
;
