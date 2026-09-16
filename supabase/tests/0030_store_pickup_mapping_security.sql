-- KANTIRA Business OS — disposable local verification for migration 0030
-- (set_store_pickup_mapping: the sole write path for store_shipping_config).
--
-- Same nature/rationale as supabase/tests/0022_customer_safe_product_boundary.sql
-- — a real, database-backed proof, not a TypeScript mock, of the RPC's
-- authorization/org-scoping/uniqueness/provider-hardcoding behavior. NOT
-- part of `npm test` (this repo's test runner has no Postgres dependency);
-- run manually against a disposable local Supabase instance. Everything
-- runs inside one transaction and rolls back at the end.
--
-- HOW TO RUN (local Docker required, migrations 0001-0030 already applied):
--   docker exec -i supabase_db_KantiraBusinessOS psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/0030_store_pickup_mapping_security.sql

begin;

-- ============================================================
-- Disposable fixtures: two orgs, two OWNER-role staff, one SALES-role
-- staff, one store per org.
-- ============================================================

insert into public.organizations (id, name)
values
  ('99999999-9999-9999-9999-999999999a01', 'K-PICKUP-TEST-ORG'),
  ('99999999-9999-9999-9999-999999999a09', 'K-PICKUP-TEST-ORG-2');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('99999999-9999-9999-9999-999999999a02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-pickup-test@example.invalid', crypt('x', gen_salt('bf')), now(), '{}', '{}'),
  ('99999999-9999-9999-9999-999999999a03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sales-pickup-test@example.invalid', crypt('x', gen_salt('bf')), now(), '{}', '{}'),
  ('99999999-9999-9999-9999-999999999a08', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other-owner-pickup-test@example.invalid', crypt('x', gen_salt('bf')), now(), '{}', '{}');

insert into public.profiles (id, organization_id, email, role)
values
  ('99999999-9999-9999-9999-999999999a02', '99999999-9999-9999-9999-999999999a01', 'owner-pickup-test@example.invalid', 'OWNER'),
  ('99999999-9999-9999-9999-999999999a03', '99999999-9999-9999-9999-999999999a01', 'sales-pickup-test@example.invalid', 'SALES'),
  ('99999999-9999-9999-9999-999999999a08', '99999999-9999-9999-9999-999999999a09', 'other-owner-pickup-test@example.invalid', 'OWNER');

insert into public.stores (id, organization_id, store_code, store_name)
values
  ('99999999-9999-9999-9999-999999999a10', '99999999-9999-9999-9999-999999999a01', 'MAIN', 'Main Store'),
  ('99999999-9999-9999-9999-999999999a19', '99999999-9999-9999-9999-999999999a09', 'OTHER', 'Other Org Store');

-- ============================================================
-- 1. Unauthenticated (no JWT claim set) is rejected
-- ============================================================
do $$
begin
  begin
    perform set_config('request.jwt.claims', '', true);
    perform public.set_store_pickup_mapping(
      '99999999-9999-9999-9999-999999999a10', 'loc-1', 'Main Warehouse'
    );
    raise exception 'TEST FAILED: unauthenticated call should have raised';
  exception
    when others then
      if sqlerrm !~* 'not authenticated' then
        raise exception 'TEST FAILED: unexpected error for unauthenticated call: %', sqlerrm;
      end if;
  end;
end $$;

-- ============================================================
-- 2. Authorized OWNER can map their own store
-- ============================================================
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '99999999-9999-9999-9999-999999999a02')::text, true);

select public.set_store_pickup_mapping(
  '99999999-9999-9999-9999-999999999a10', 'loc-1', 'Main Warehouse'
);

do $$
declare
  v_row record;
begin
  select * into v_row from public.store_shipping_config
    where store_id = '99999999-9999-9999-9999-999999999a10';
  if v_row.id is null then
    raise exception 'TEST FAILED: expected mapping row to exist';
  end if;
  if v_row.provider <> 'SHIPROCKET' then
    raise exception 'TEST FAILED: provider was not hardcoded to SHIPROCKET, got %', v_row.provider;
  end if;
  if v_row.provider_location_id <> 'loc-1' or v_row.provider_location_name <> 'Main Warehouse' then
    raise exception 'TEST FAILED: unexpected mapping values';
  end if;
  if v_row.active is not true then
    raise exception 'TEST FAILED: expected active = true';
  end if;
end $$;

-- ============================================================
-- 3. A non OWNER/ADMIN role (SALES) is rejected
-- ============================================================
select set_config('request.jwt.claims', json_build_object('sub', '99999999-9999-9999-9999-999999999a03')::text, true);

do $$
begin
  begin
    perform public.set_store_pickup_mapping(
      '99999999-9999-9999-9999-999999999a10', 'loc-2', 'Attempted By Sales'
    );
    raise exception 'TEST FAILED: SALES role should have been rejected';
  exception
    when others then
      if sqlerrm !~* 'not permitted' then
        raise exception 'TEST FAILED: unexpected error for SALES role: %', sqlerrm;
      end if;
  end;
end $$;

-- ============================================================
-- 4. Cross-organization store is rejected (OWNER of org 2 targeting a
--    store in org 1)
-- ============================================================
select set_config('request.jwt.claims', json_build_object('sub', '99999999-9999-9999-9999-999999999a08')::text, true);

do $$
begin
  begin
    perform public.set_store_pickup_mapping(
      '99999999-9999-9999-9999-999999999a10', 'loc-3', 'Cross Org Attempt'
    );
    raise exception 'TEST FAILED: cross-organization store should have been rejected';
  exception
    when others then
      if sqlerrm !~* 'not found' then
        raise exception 'TEST FAILED: unexpected error for cross-org store: %', sqlerrm;
      end if;
  end;
end $$;

-- Confirm the cross-org attempt left no row behind on org 2's store either.
do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.store_shipping_config
    where store_id = '99999999-9999-9999-9999-999999999a19';
  if v_count <> 0 then
    raise exception 'TEST FAILED: cross-org attempt should not have created any row';
  end if;
end $$;

-- ============================================================
-- 5. Empty / invalid pickup location identifiers are rejected
-- ============================================================
select set_config('request.jwt.claims', json_build_object('sub', '99999999-9999-9999-9999-999999999a02')::text, true);

do $$
begin
  begin
    perform public.set_store_pickup_mapping('99999999-9999-9999-9999-999999999a10', '', 'Empty Id');
    raise exception 'TEST FAILED: empty provider_location_id should have been rejected';
  exception
    when others then
      if sqlerrm !~* 'pickup location' then
        raise exception 'TEST FAILED: unexpected error for empty location id: %', sqlerrm;
      end if;
  end;
end $$;

do $$
begin
  begin
    perform public.set_store_pickup_mapping('99999999-9999-9999-9999-999999999a10', 'loc-4', '   ');
    raise exception 'TEST FAILED: whitespace-only provider_location_name should have been rejected';
  exception
    when others then
      if sqlerrm !~* 'name' then
        raise exception 'TEST FAILED: unexpected error for blank location name: %', sqlerrm;
      end if;
  end;
end $$;

-- ============================================================
-- 6. A second call for the same store UPDATES the existing row rather
--    than creating a conflicting/duplicate one (one mapping per store).
-- ============================================================
select public.set_store_pickup_mapping(
  '99999999-9999-9999-9999-999999999a10', 'loc-5', 'Updated Warehouse'
);

do $$
declare
  v_count int;
  v_row record;
begin
  select count(*) into v_count from public.store_shipping_config
    where store_id = '99999999-9999-9999-9999-999999999a10';
  if v_count <> 1 then
    raise exception 'TEST FAILED: expected exactly one row per store, found %', v_count;
  end if;

  select * into v_row from public.store_shipping_config
    where store_id = '99999999-9999-9999-9999-999999999a10';
  if v_row.provider_location_id <> 'loc-5' or v_row.provider_location_name <> 'Updated Warehouse' then
    raise exception 'TEST FAILED: second call did not update the existing row as expected';
  end if;
end $$;

-- ============================================================
-- 7. Existing SELECT RLS remains intact: SALES (org 1) still cannot read
--    the mapping; the org-1 OWNER still can.
-- ============================================================
select set_config('request.jwt.claims', json_build_object('sub', '99999999-9999-9999-9999-999999999a03')::text, true);

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.store_shipping_config
    where store_id = '99999999-9999-9999-9999-999999999a10';
  if v_count <> 0 then
    raise exception 'TEST FAILED: SALES role should not be able to SELECT store_shipping_config (RLS regression)';
  end if;
end $$;

select set_config('request.jwt.claims', json_build_object('sub', '99999999-9999-9999-9999-999999999a02')::text, true);

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.store_shipping_config
    where store_id = '99999999-9999-9999-9999-999999999a10';
  if v_count <> 1 then
    raise exception 'TEST FAILED: org-1 OWNER should still be able to SELECT the mapping (RLS regression)';
  end if;
end $$;

-- ============================================================
-- 8. No provider-credential columns exist on this table at all — nothing
--    for this RPC or its callers to ever leak to a client.
-- ============================================================
do $$
declare
  v_count int;
begin
  select count(*) into v_count
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'store_shipping_config'
      and column_name ~* 'email|password|token|secret|credential';
  if v_count <> 0 then
    raise exception 'TEST FAILED: store_shipping_config unexpectedly has a credential-shaped column';
  end if;
end $$;

reset role;
rollback;

select 'ALL PHASE 6A-1 PICKUP MAPPING SECURITY TESTS PASSED' as result;
