-- KANTIRA Business OS — Phase 6A-1: authorized write path for
-- store_shipping_config (Shiprocket pickup-location mapping).
--
-- BACKGROUND: store_shipping_config (0015) has had a SELECT-only RLS
-- policy (store_shipping_config_select_staff, OWNER/ADMIN) and only a
-- SELECT grant to `authenticated` since it was created — there has never
-- been any INSERT/UPDATE path through the application. The only way to
-- populate it has been a direct service-role database write, which is not
-- an acceptable production operational pattern. This migration adds
-- exactly one SECURITY DEFINER RPC as the sole write path, following the
-- same pattern as set_shipment_package_data (0029): no broad grant, no RLS
-- change, authorization and org-scoping re-verified inside the function
-- itself.
--
-- WHAT THIS MIGRATION DOES NOT DO: no change to the existing SELECT
-- policy, no table-level INSERT/UPDATE grant, no change to any other
-- table, no change to Shiprocket API client behavior, checkout, inventory,
-- accounting, or authentication.

-- ============================================================
-- RPC: set_store_pickup_mapping — the ONLY way store_shipping_config rows
-- are ever written. Same authorization shape as the existing SELECT policy
-- (OWNER/ADMIN only — pickup-location mapping is store configuration, not
-- a per-shipment operational action, so this is deliberately narrower than
-- the STOCK-with-store-access shape used by shipment RPCs).
--
-- `provider` is hardcoded 'SHIPROCKET' inside the function body — it is
-- NOT a parameter, so it can never be client-controlled (KANTIRA supports
-- exactly one shipping provider today; the CHECK constraint on the column
-- itself already enforces this too, as defense in depth).
--
-- One mapping per store is enforced by upserting on the table's existing
-- unique index (store_shipping_config_org_store_key, on
-- (organization_id, store_id), added in 0015) — a second call for the same
-- store updates the existing row rather than creating a conflicting one.
-- ============================================================

create or replace function public.set_store_pickup_mapping(
  p_store_id uuid,
  p_provider_location_id text,
  p_provider_location_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_role public.user_role := public.current_role();
  v_store record;
begin
  if v_org_id is null then
    raise exception 'Not authenticated as a Business OS employee';
  end if;

  if not (v_role = any (array['OWNER'::public.user_role, 'ADMIN'::public.user_role])) then
    raise exception 'Not permitted to manage Shiprocket pickup mapping';
  end if;

  select * into v_store from public.stores where id = p_store_id;

  if v_store.id is null or v_store.organization_id <> v_org_id then
    raise exception 'Store not found in this organization';
  end if;

  if p_provider_location_id is null or btrim(p_provider_location_id) = '' then
    raise exception 'A Shiprocket pickup location must be selected';
  end if;

  if p_provider_location_name is null or btrim(p_provider_location_name) = '' then
    raise exception 'The selected pickup location has no name';
  end if;

  insert into public.store_shipping_config (
    organization_id,
    store_id,
    provider,
    provider_location_id,
    provider_location_name,
    active
  )
  values (
    v_org_id,
    p_store_id,
    'SHIPROCKET',
    btrim(p_provider_location_id),
    btrim(p_provider_location_name),
    true
  )
  on conflict on constraint store_shipping_config_org_store_key
  do update set
    provider_location_id = excluded.provider_location_id,
    provider_location_name = excluded.provider_location_name,
    active = true,
    updated_at = now();
end;
$$;

revoke all on function public.set_store_pickup_mapping(uuid, text, text) from public;
grant execute on function public.set_store_pickup_mapping(uuid, text, text) to authenticated;
