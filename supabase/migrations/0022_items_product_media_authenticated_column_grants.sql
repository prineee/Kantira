-- KANTIRA Business OS — Phase 3B security correction: customer-safe
-- product data boundary (authenticated-role column exposure)
--
-- FINDING (Phase 3B review): 0017_reconcile_required_base_table_grants.sql
-- grants `GRANT SELECT, INSERT, UPDATE, DELETE ON public.items TO
-- authenticated;` with no column narrowing, and 0015 grants `GRANT ALL ON
-- TABLE public.product_media TO authenticated;`. Both are the exact
-- table-level-grant-defeats-column-revoke pattern 0018/0021 already fixed
-- for `anon` — except those two fixes only ever touched `anon`.
-- `authenticated` was never narrowed. `items_select_public` (0010) and
-- product_media_select_public (0015) both grant `to anon, authenticated`.
-- Since a logged-in customer (an auth.users row with no `profiles` row —
-- see 0009) is the same Postgres `authenticated` role as internal staff,
-- and RLS already lets that customer read public-storefront items/media
-- rows, the unrestricted authenticated column grant means any
-- authenticated customer can currently select items.cost_price /
-- items.created_by / product_media.created_by for those rows. This is a
-- live confidentiality gap, not a hypothetical one.
--
-- CONSTRAINT: `authenticated` is shared by customers and internal staff —
-- there is no separate Postgres role to grant differently between them. A
-- blanket column-level revoke of cost_price (mirroring 0018 exactly) would
-- also remove internal staff's own direct reads of items.cost_price
-- (verified by inspection: app/items/page.tsx, app/items/[id]/edit/page.tsx,
-- and app/purchases/new/page.tsx all select items.cost_price directly, and
-- the items list page shows it to any authenticated staff role, not just
-- OWNER/ADMIN/STOCK — there is no view-level role gate on that page, only
-- on write actions). No internal code reads items.created_by or
-- product_media.created_by at all (verified by inspection), so those two
-- columns need no restoration path for anyone.
--
-- FIX, in two parts:
--
-- 1. product_media: identical shape to 0021's anon fix, now also for
--    authenticated. No internal code reads created_by from this table, so
--    a straight column-level-only re-grant (the same safe column list 0021
--    already uses for anon) closes the gap with no internal regression.
--
-- 2. items: the safe-column-only re-grant alone would also remove internal
--    staff's legitimate cost_price reads, so it is paired with a new
--    SECURITY DEFINER function, public.items_catalog_for_staff().
--
--    A `security_invoker = true` view masking cost_price via a CASE
--    expression was tried first and rejected: empirically verified
--    (disposable local fixtures, `set role authenticated` + a customer
--    JWT claim) that Postgres checks column privileges against every
--    column a view body *references*, even inside a CASE that would
--    ultimately hide the value — `select ... case when ... then cost_price
--    end ... from items` fails with "permission denied for table items"
--    for a role with no column grant on cost_price, before the CASE ever
--    evaluates. Masking the value is not the same as being permitted to
--    reference the column, so a security_invoker view cannot do this
--    without granting authenticated a raw column privilege on cost_price
--    that would just reopen the same hole (that grant is on the base
--    table, so a customer could read the column directly and skip the
--    view entirely). A plain (non-security_invoker) view was also
--    rejected: it would run as the view owner and bypass items' RLS
--    entirely, leaking every organization's items to any authenticated
--    caller — confirmed by how 0016 already documents this exact
--    owner-mode-vs-security_invoker distinction for available_to_sell.
--
--    A SECURITY DEFINER function has neither problem: it runs as its
--    owner (so referencing cost_price never hits a column-grant check
--    for the caller), and it replicates items_select's own row-scoping
--    explicitly in its WHERE clause (organization_id = current_org_id())
--    instead of relying on RLS, exactly like current_org_id()/
--    current_role()/has_store_access() already do (0001) and exactly the
--    pattern this correction's own brief calls for when a SECURITY
--    DEFINER RPC is genuinely necessary: fixed search_path, auth.uid()
--    verified indirectly through current_org_id() (which reads the
--    caller's own profiles row, itself gated by auth.uid()), explicit
--    EXECUTE grant to authenticated only, and it returns exactly the
--    columns the three internal call sites need — nothing broader.
--    current_org_id() returns NULL for a customer (no profiles row), and
--    `organization_id = NULL` is never true, so a customer gets zero rows
--    from this function — it fails closed with no separate role check
--    needed. No role-list restriction is applied beyond "is staff of this
--    org": the items list page already shows cost_price to any
--    authenticated staff role, not a role-restricted subset, so this
--    matches today's behavior rather than narrowing it.
--
--    created_by is intentionally omitted — no code reads it and there is
--    no reason to add a new read path for it. weight_kg is included in
--    the safe-column grant (not the function — customers don't need this
--    function) because app/checkout/actions.ts already reads
--    items.weight_kg as an authenticated customer (Phase 5B-8 shipping
--    quote) — narrowing the grant without including it would be a
--    functional regression for that already-shipped feature, not just a
--    security narrowing.
--
--    The three internal call sites that read cost_price
--    (app/items/page.tsx, app/items/[id]/edit/page.tsx,
--    app/purchases/new/page.tsx) are switched from `.from("items")` to
--    `.rpc("items_catalog_for_staff")` in this same change (application
--    code, not part of this migration), with any further filtering/
--    sorting done in JS rather than assumed to chain through PostgREST.
--    Every other items read in the app already uses a column list fully
--    contained in the new safe-column grant (verified by inspection) and
--    is unaffected.
--
-- Nothing else changes: no RLS policy, no anon grant, no other table, and
-- no existing migration (0001-0021) is modified.

-- ============================================================
-- 1. product_media: close the authenticated column-exposure gap
-- ============================================================

revoke select on public.product_media from authenticated;

grant select (
  id,
  organization_id,
  item_id,
  storage_path,
  media_type,
  sort_order,
  is_primary,
  alt_text,
  created_at,
  updated_at
) on public.product_media to authenticated;

-- ============================================================
-- 2. items: close the authenticated column-exposure gap, then restore
--    staff cost_price access through a masked, security_invoker view
-- ============================================================

revoke select on public.items from authenticated;

grant select (
  id,
  organization_id,
  category_id,
  uom_id,
  sku,
  barcode,
  name,
  description,
  hsn_code,
  selling_price,
  tax_rate_percent,
  reorder_level,
  weight_kg,
  track_inventory,
  is_active,
  created_at,
  updated_at
) on public.items to authenticated;

create or replace function public.items_catalog_for_staff()
returns table (
  id uuid,
  organization_id uuid,
  category_id uuid,
  uom_id uuid,
  sku text,
  barcode text,
  name text,
  description text,
  hsn_code text,
  cost_price numeric,
  selling_price numeric,
  tax_rate_percent numeric,
  reorder_level numeric,
  weight_kg numeric,
  track_inventory boolean,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select
    i.id,
    i.organization_id,
    i.category_id,
    i.uom_id,
    i.sku,
    i.barcode,
    i.name,
    i.description,
    i.hsn_code,
    i.cost_price,
    i.selling_price,
    i.tax_rate_percent,
    i.reorder_level,
    i.weight_kg,
    i.track_inventory,
    i.is_active,
    i.created_at,
    i.updated_at
  from public.items i
  where i.organization_id = public.current_org_id();
$$;

-- Same posture as current_org_id()/current_role()/has_store_access() (0001):
-- revoke from public first, grant execute to authenticated only. Never
-- granted to anon — a public/anonymous caller has no current_org_id() to
-- match, so it could never return a row anyway, but this keeps the
-- function's exposure explicit rather than incidental.
revoke all on function public.items_catalog_for_staff() from public;
grant execute on function public.items_catalog_for_staff() to authenticated;
