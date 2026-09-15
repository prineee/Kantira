-- KANTIRA Business OS — Phase 5A-2 completion: actual packed-shipment
-- package data.
--
-- BACKGROUND (CTO-approved architecture, see the preceding read-only
-- audits): the real Shiprocket order-creation path was found to send
-- fabricated 10x10x10cm dimensions and a computed (not actually weighed)
-- dead weight. The approved fix is NOT to add dimensions to public.items
-- (a product concept) — it is to capture the ACTUAL packed parcel's weight
-- and dimensions on public.shipments (a fulfillment-event concept), staff-
-- confirmed at the exact moment a real physical parcel exists (PACKED ->
-- Create Shipment). This migration adds only that.
--
-- WHAT THIS MIGRATION DOES NOT DO: no change to items, checkout, accounting,
-- inventory, or any existing RPC's *existing* behavior. create_shipment_
-- pending, mark_shipment_attempted, and record_shipment_result are
-- byte-for-byte unchanged (not re-issued in this file at all) — package
-- data capture is a new, narrowly-scoped companion RPC pair instead of an
-- extension to any of those, precisely so none of their already-verified
-- behavior has any chance of regressing.

-- ============================================================
-- 1. shipments: additive package-data columns + all-or-nothing CHECK
-- ============================================================
--
-- Nullable, no default: a shipment row is created (PENDING) before any
-- package data exists (staff has not yet confirmed weight/dimensions at
-- that instant) — mirrors items.weight_kg's own nullable-until-known
-- posture (0019). Application/RPC validation (set_shipment_package_data
-- below, and lib/shipping/package.ts) requires all four before the first
-- real Shiprocket attempt is made — this is a fulfillment-workflow rule,
-- not a storage-layer one, exactly like 0019's own header reasons about
-- weight_kg's CHECK scope.
--
-- Fixed units (cm / kg), no UOM column — same reasoning as weight_kg: a
-- single-country, single-provider integration has no present need for a
-- configurable unit, and Shiprocket's own contract expects exactly these
-- units.
--
-- No upper-bound CHECK is added here: no Shiprocket-documented or KANTIRA
-- business maximum for a single parcel's weight/dimensions exists anywhere
-- in this repository's research to date, and inventing one at the schema
-- level would be exactly the kind of unjustified value the CTO's direction
-- prohibits. A conservative, clearly-documented sanity ceiling against
-- fat-fingered data entry (not a verified limit) lives instead at the
-- application validation layer (lib/shipping/package.ts), where it can be
-- revisited without a migration once a real limit is confirmed.

alter table public.shipments
  add column package_dead_weight_kg numeric(10, 3),
  add column package_length_cm numeric(8, 2),
  add column package_breadth_cm numeric(8, 2),
  add column package_height_cm numeric(8, 2);

alter table public.shipments
  add constraint shipments_package_data_all_or_nothing check (
    (
      package_dead_weight_kg is null
      and package_length_cm is null
      and package_breadth_cm is null
      and package_height_cm is null
    )
    or (
      package_dead_weight_kg > 0
      and package_length_cm > 0
      and package_breadth_cm > 0
      and package_height_cm > 0
    )
  );

-- ============================================================
-- 2. Close the same authenticated-column-exposure gap 0022 already fixed
--    for items/product_media, now for shipments' four new columns.
--
-- 0026 granted `select on public.shipments to authenticated` with no
-- column narrowing — every column, present AND future, is selectable by
-- that broad grant unless explicitly re-narrowed (0022's own documented
-- mechanic: a table-level grant defeats any later column-level revoke).
-- `authenticated` is shared by customers (shipments_select_self, 0026) and
-- staff (shipments_select_staff, 0026) alike, so without this fix a
-- customer with RLS row-access to their own shipment could select
-- package_dead_weight_kg/etc directly via PostgREST even though no
-- customer-facing page ever asks for them (verified: app/account/orders/
-- page.tsx and [id]/page.tsx both already use explicit, narrower column
-- lists that predate this migration and are unaffected by it).
--
-- Every column re-granted below is exactly the column list every existing
-- caller already uses today (app/orders/[id]/page.tsx,
-- app/account/orders/page.tsx, app/account/orders/[id]/page.tsx — verified
-- by inspection) — this re-grant changes no existing behavior for any of
-- them. Staff access to the four new package_* columns is restored below
-- via SECURITY DEFINER functions instead of a raw column grant, the same
-- pattern 0022 used for items.cost_price, because there is no separate
-- Postgres role to grant differently between staff and customers.

revoke select on public.shipments from authenticated;

grant select (
  id,
  organization_id,
  online_order_id,
  fulfillment_store_id,
  provider,
  provider_order_id,
  provider_shipment_id,
  provider_awb,
  courier_id,
  courier_name,
  status,
  last_error,
  created_at,
  updated_at,
  shipped_at,
  delivered_at,
  attempt_count,
  last_attempted_at,
  last_tracking_status
) on public.shipments to authenticated;

-- ============================================================
-- 3. RPC: set_shipment_package_data — the ONLY way package_* columns are
--    ever written. Same authorization shape as mark_shipment_attempted
--    (0028): OWNER/ADMIN, or STOCK with access to the shipment's store.
--    Restricted to a PENDING shipment (the state create_shipment_pending
--    always leaves it in, before any attempt) so package data can be
--    entered/corrected any number of times before submission, but never
--    rewritten after mark_shipment_attempted has moved it to ATTEMPTED —
--    a physical parcel already handed to a courier shouldn't have its
--    recorded weight/dimensions silently changed later.
--
--    Explicit validation (not just the CHECK constraint) so a caller gets
--    a clear, specific error message rather than a generic Postgres
--    constraint-violation string — application code (lib/shipping/
--    package.ts) validates first and should never actually trigger this,
--    but the RPC does not trust that alone (defense in depth, same
--    posture as every other write path in this schema).
-- ============================================================

create or replace function public.set_shipment_package_data(
  p_shipment_id uuid,
  p_package_dead_weight_kg numeric,
  p_package_length_cm numeric,
  p_package_breadth_cm numeric,
  p_package_height_cm numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_role public.user_role := public.current_role();
  v_shipment record;
begin
  if v_org_id is null then
    raise exception 'Not authenticated as a Business OS employee';
  end if;

  select * into v_shipment from public.shipments where id = p_shipment_id for update;

  if v_shipment.id is null or v_shipment.organization_id <> v_org_id then
    raise exception 'Shipment not found in this organization';
  end if;

  if not (
    v_role = any (array['OWNER'::public.user_role, 'ADMIN'::public.user_role])
    or (v_role = 'STOCK'::public.user_role and public.has_store_access(v_shipment.fulfillment_store_id))
  ) then
    raise exception 'Not permitted to set package data for this shipment';
  end if;

  if v_shipment.status <> 'PENDING' then
    raise exception 'Package data can only be set while a shipment is PENDING (current status: %)', v_shipment.status;
  end if;

  if p_package_dead_weight_kg is null or p_package_dead_weight_kg <= 0 then
    raise exception 'Package dead weight must be a positive number';
  end if;
  if p_package_length_cm is null or p_package_length_cm <= 0 then
    raise exception 'Package length must be a positive number';
  end if;
  if p_package_breadth_cm is null or p_package_breadth_cm <= 0 then
    raise exception 'Package breadth must be a positive number';
  end if;
  if p_package_height_cm is null or p_package_height_cm <= 0 then
    raise exception 'Package height must be a positive number';
  end if;

  update public.shipments
    set package_dead_weight_kg = p_package_dead_weight_kg,
        package_length_cm = p_package_length_cm,
        package_breadth_cm = p_package_breadth_cm,
        package_height_cm = p_package_height_cm,
        updated_at = now()
    where id = p_shipment_id;
end;
$$;

revoke all on function public.set_shipment_package_data(uuid, numeric, numeric, numeric, numeric) from public;
grant execute on function public.set_shipment_package_data(uuid, numeric, numeric, numeric, numeric) to authenticated;

-- ============================================================
-- 4. RPC: get_shipment_package_data — the ONLY read path for the four new
--    columns (see §2's column-grant narrowing). Used by createShipment()
--    to (a) detect whether this shipment already has package data (a
--    retry, which must reuse it rather than re-prompting or
--    recalculating — see app/orders/actions.ts) and (b) source the exact
--    values actually sent to Shiprocket, always freshly read from the
--    database rather than trusted from the caller's in-memory arguments.
--    Same authorization shape as set_shipment_package_data. Returns a
--    single row of nulls (not zero rows) when nothing has been captured
--    yet, so the caller can distinguish "not authorized/not found" (RPC
--    raises) from "authorized but empty" (a row of nulls) without an
--    extra round trip.
-- ============================================================

create or replace function public.get_shipment_package_data(p_shipment_id uuid)
returns table (
  package_dead_weight_kg numeric,
  package_length_cm numeric,
  package_breadth_cm numeric,
  package_height_cm numeric
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_role public.user_role := public.current_role();
  v_shipment record;
begin
  if v_org_id is null then
    raise exception 'Not authenticated as a Business OS employee';
  end if;

  select * into v_shipment from public.shipments where id = p_shipment_id;

  if v_shipment.id is null or v_shipment.organization_id <> v_org_id then
    raise exception 'Shipment not found in this organization';
  end if;

  if not (
    v_role = any (array['OWNER'::public.user_role, 'ADMIN'::public.user_role])
    or (v_role = 'STOCK'::public.user_role and public.has_store_access(v_shipment.fulfillment_store_id))
  ) then
    raise exception 'Not permitted to read package data for this shipment';
  end if;

  return query
    select
      v_shipment.package_dead_weight_kg,
      v_shipment.package_length_cm,
      v_shipment.package_breadth_cm,
      v_shipment.package_height_cm;
end;
$$;

revoke all on function public.get_shipment_package_data(uuid) from public;
grant execute on function public.get_shipment_package_data(uuid) to authenticated;
