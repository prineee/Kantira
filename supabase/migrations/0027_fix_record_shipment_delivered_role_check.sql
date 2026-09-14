-- Fix record_shipment_delivered() (0026): its staff-override permission
-- check used `v_role <> any (array['OWNER','ADMIN'])`, which in Postgres
-- means "v_role differs from at least one element of the array" — true for
-- OWNER (it differs from ADMIN) and for ADMIN (it differs from OWNER) too,
-- so the check raised "Not permitted" for every role unconditionally,
-- including OWNER/ADMIN. The correct "not in this list" test is
-- `<> all (...)` (equivalently `not (v_role = any (...))`), matching the
-- positive `= any (...)` form already used correctly everywhere else in
-- this schema (e.g. advance_online_order_status, create_shipment_pending).
-- Caught by manually exercising the new staff /orders UI end to end
-- locally — no existing test covers this function.
--
-- Every other line is byte-for-byte identical to 0026's definition.

create or replace function public.record_shipment_delivered(p_provider text, p_provider_shipment_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_service_role boolean := coalesce(auth.role(), 'anon') = 'service_role';
  v_org_id uuid;
  v_role public.user_role;
  v_shipment record;
begin
  select * into v_shipment from public.shipments
  where provider = p_provider and provider_shipment_id = p_provider_shipment_id
  for update;

  if v_shipment.id is null then
    raise exception 'Unknown shipment' using errcode = '42501';
  end if;

  if not v_is_service_role then
    v_org_id := public.current_org_id();
    v_role := public.current_role();

    if v_org_id is null or v_shipment.organization_id <> v_org_id then
      raise exception 'Shipment not found' using errcode = '42501';
    end if;

    if v_role <> all (array['OWNER'::public.user_role, 'ADMIN'::public.user_role]) then
      raise exception 'Not permitted to mark this shipment delivered' using errcode = '42501';
    end if;
  end if;

  if v_shipment.status <> 'CREATED' then
    raise exception 'Only a CREATED shipment can be marked delivered (current status: %)', v_shipment.status;
  end if;

  update public.shipments
    set status = 'DELIVERED', delivered_at = now(), updated_at = now()
    where id = v_shipment.id;

  update public.online_orders
    set status = 'DELIVERED'
    where id = v_shipment.online_order_id and status = 'SHIPPED';
end;
$$;

revoke all on function public.record_shipment_delivered(text, text) from public;
grant execute on function public.record_shipment_delivered(text, text) to authenticated, service_role;
