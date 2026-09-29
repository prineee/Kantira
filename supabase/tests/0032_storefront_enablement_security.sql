-- KANTIRA Business OS — disposable local verification for migration 0032
-- (set_storefront_enabled, items.is_published, publish authorization,
-- public visibility RLS, customer write-path re-validation).
--
-- Same nature as supabase/tests/0030_*.sql / 0031_*.sql: a real,
-- database-backed proof, NOT part of `npm test`. Run manually against a
-- disposable local database with migrations 0001-0032 applied. Everything
-- runs inside one transaction and rolls back at the end.
--
-- HOW TO RUN (local Docker Supabase):
--   docker exec -i supabase_db_KantiraBusinessOS psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/0032_storefront_enablement_security.sql
--
-- NOTE: requires that no pre-existing organization in the target database
-- has is_public_storefront = true (the fixtures below flip it and assert
-- the "only one public storefront" rule). The test fails fast otherwise.

begin;

do $$
begin
  if exists (select 1 from public.organizations where is_public_storefront) then
    raise exception 'PRECONDITION FAILED: an existing organization already has is_public_storefront = true; run against a clean disposable database';
  end if;
end $$;

-- ============================================================
-- Fixtures: org A (becomes the storefront), org B (other tenant)
-- ============================================================

insert into public.organizations (id, name, is_public_storefront)
values
  ('32323232-0000-0000-0000-00000000a001', 'K-6B15B-ORG-A', false),
  ('32323232-0000-0000-0000-00000000b001', 'K-6B15B-ORG-B', false);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
select u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email,
       crypt('x', gen_salt('bf')), now(), '{}', '{}'
from (values
  ('32323232-0000-0000-0000-00000000a011', 'owner-a@6b15b.invalid'),
  ('32323232-0000-0000-0000-00000000a012', 'admin-a@6b15b.invalid'),
  ('32323232-0000-0000-0000-00000000a013', 'sales-a@6b15b.invalid'),
  ('32323232-0000-0000-0000-00000000a014', 'stock-a@6b15b.invalid'),
  ('32323232-0000-0000-0000-00000000a015', 'accountant-a@6b15b.invalid'),
  ('32323232-0000-0000-0000-00000000a016', 'franchise-a@6b15b.invalid'),
  ('32323232-0000-0000-0000-00000000a017', 'store-manager-a@6b15b.invalid'),
  ('32323232-0000-0000-0000-00000000b011', 'owner-b@6b15b.invalid'),
  ('32323232-0000-0000-0000-00000000c011', 'customer-a@6b15b.invalid')
) as u(id, email);

insert into public.profiles (id, organization_id, email, role)
values
  ('32323232-0000-0000-0000-00000000a011', '32323232-0000-0000-0000-00000000a001', 'owner-a@6b15b.invalid', 'OWNER'),
  ('32323232-0000-0000-0000-00000000a012', '32323232-0000-0000-0000-00000000a001', 'admin-a@6b15b.invalid', 'ADMIN'),
  ('32323232-0000-0000-0000-00000000a013', '32323232-0000-0000-0000-00000000a001', 'sales-a@6b15b.invalid', 'SALES'),
  ('32323232-0000-0000-0000-00000000a014', '32323232-0000-0000-0000-00000000a001', 'stock-a@6b15b.invalid', 'STOCK'),
  ('32323232-0000-0000-0000-00000000a015', '32323232-0000-0000-0000-00000000a001', 'accountant-a@6b15b.invalid', 'ACCOUNTANT'),
  ('32323232-0000-0000-0000-00000000a016', '32323232-0000-0000-0000-00000000a001', 'franchise-a@6b15b.invalid', 'FRANCHISE'),
  ('32323232-0000-0000-0000-00000000a017', '32323232-0000-0000-0000-00000000a001', 'store-manager-a@6b15b.invalid', 'STORE_MANAGER'),
  ('32323232-0000-0000-0000-00000000b011', '32323232-0000-0000-0000-00000000b001', 'owner-b@6b15b.invalid', 'OWNER');

insert into public.customers (id, organization_id, customer_code, name, auth_user_id, created_by)
values ('32323232-0000-0000-0000-00000000c001', '32323232-0000-0000-0000-00000000a001', 'K6B15B-CUST', 'Storefront Customer',
        '32323232-0000-0000-0000-00000000c011', '32323232-0000-0000-0000-00000000a011');

insert into public.units_of_measurement (id, organization_id, code, name)
values
  ('32323232-0000-0000-0000-00000000a021', '32323232-0000-0000-0000-00000000a001', 'PCS', 'Pieces'),
  ('32323232-0000-0000-0000-00000000b021', '32323232-0000-0000-0000-00000000b001', 'PCS', 'Pieces');

-- Visibility matrix (org A) + one cross-org item (org B), inserted as the
-- migration owner (publish guard only restricts request roles).
insert into public.items (id, organization_id, uom_id, sku, name, cost_price, selling_price, is_active, is_published, created_by)
values
  ('32323232-0000-0000-0000-00000000a031', '32323232-0000-0000-0000-00000000a001', '32323232-0000-0000-0000-00000000a021', 'AP', 'Active Published',     100, 150, true,  true,  '32323232-0000-0000-0000-00000000a011'),
  ('32323232-0000-0000-0000-00000000a032', '32323232-0000-0000-0000-00000000a001', '32323232-0000-0000-0000-00000000a021', 'AU', 'Active Unpublished',   100, 150, true,  false, '32323232-0000-0000-0000-00000000a011'),
  ('32323232-0000-0000-0000-00000000a033', '32323232-0000-0000-0000-00000000a001', '32323232-0000-0000-0000-00000000a021', 'IP', 'Inactive Published',   100, 150, false, true,  '32323232-0000-0000-0000-00000000a011'),
  ('32323232-0000-0000-0000-00000000a034', '32323232-0000-0000-0000-00000000a001', '32323232-0000-0000-0000-00000000a021', 'IU', 'Inactive Unpublished', 100, 150, false, false, '32323232-0000-0000-0000-00000000a011'),
  ('32323232-0000-0000-0000-00000000b031', '32323232-0000-0000-0000-00000000b001', '32323232-0000-0000-0000-00000000b021', 'BP', 'Org B Active Published', 100, 150, true, true, '32323232-0000-0000-0000-00000000b011');

-- An item created WITHOUT specifying is_published must default to hidden.
insert into public.items (id, organization_id, uom_id, sku, name, created_by)
values ('32323232-0000-0000-0000-00000000a035', '32323232-0000-0000-0000-00000000a001', '32323232-0000-0000-0000-00000000a021', 'DEF', 'Defaulted', '32323232-0000-0000-0000-00000000a011');

do $$
begin
  if (select is_published from public.items where id = '32323232-0000-0000-0000-00000000a035') is distinct from false then
    raise exception 'TEST FAILED: is_published must default to false';
  end if;
end $$;

insert into public.product_media (id, organization_id, item_id, storage_path, is_primary, created_by)
values
  ('32323232-0000-0000-0000-00000000a041', '32323232-0000-0000-0000-00000000a001', '32323232-0000-0000-0000-00000000a031', '32323232-0000-0000-0000-00000000a001/32323232-0000-0000-0000-00000000a031/p.jpg', true, '32323232-0000-0000-0000-00000000a011'),
  ('32323232-0000-0000-0000-00000000a042', '32323232-0000-0000-0000-00000000a001', '32323232-0000-0000-0000-00000000a032', '32323232-0000-0000-0000-00000000a001/32323232-0000-0000-0000-00000000a032/u.jpg', true, '32323232-0000-0000-0000-00000000a011');

-- Shared assertion helpers (pg_temp: dropped with the session).
create function pg_temp.expect_denied(p_sql text, p_label text, p_pattern text default '.')
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm !~* p_pattern then
      raise exception 'TEST FAILED (%): unexpected error: %', p_label, sqlerrm;
    end if;
    return;
  end;
  raise exception 'TEST FAILED (%): statement should have been rejected', p_label;
end $$;

create function pg_temp.as_user(p_uid text) returns void language sql as $$
  select set_config('request.jwt.claims',
    case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', 'authenticated')::text end, true);
$$;

grant execute on function pg_temp.expect_denied(text, text, text) to anon, authenticated;
grant execute on function pg_temp.as_user(text) to anon, authenticated;

-- ============================================================
-- STOREFRONT OFF: nothing is public
-- ============================================================
set local role anon;
select pg_temp.as_user(null);

do $$
begin
  if public.primary_storefront_org_id() is not null then
    raise exception 'TEST FAILED: storefront must be off before OWNER enables it';
  end if;
  if (select count(*) from public.items where organization_id = '32323232-0000-0000-0000-00000000a001') <> 0 then
    raise exception 'TEST FAILED: anon saw items while the storefront is off';
  end if;
end $$;

-- ============================================================
-- 9. anonymous cannot call set_storefront_enabled
-- ============================================================
select pg_temp.expect_denied('select public.set_storefront_enabled(true)', 'anon enable', 'permission denied|not authenticated');

-- ============================================================
-- 3-7. Unauthorized staff roles rejected (ADMIN policy: rejected —
-- storefront is organization-level configuration, OWNER-only)
-- ============================================================
set local role authenticated;

do $$
declare
  r record;
begin
  for r in select * from (values
    ('32323232-0000-0000-0000-00000000a012', 'ADMIN'),
    ('32323232-0000-0000-0000-00000000a013', 'SALES'),
    ('32323232-0000-0000-0000-00000000a014', 'STOCK'),
    ('32323232-0000-0000-0000-00000000a015', 'ACCOUNTANT'),
    ('32323232-0000-0000-0000-00000000a016', 'FRANCHISE'),
    ('32323232-0000-0000-0000-00000000a017', 'STORE_MANAGER')
  ) as t(uid, role)
  loop
    perform pg_temp.as_user(r.uid);
    perform pg_temp.expect_denied('select public.set_storefront_enabled(true)', r.role || ' enable', 'only the organization owner');
  end loop;
end $$;

-- ============================================================
-- 10. customer-authenticated user rejected
-- ============================================================
select pg_temp.as_user('32323232-0000-0000-0000-00000000c011');
select pg_temp.expect_denied('select public.set_storefront_enabled(true)', 'customer enable', 'not authenticated as a business os employee');

-- Authenticated JWT with no profile/customer at all
select pg_temp.as_user('32323232-0000-0000-0000-00000000ffff');
select pg_temp.expect_denied('select public.set_storefront_enabled(true)', 'unknown uid enable', 'not authenticated as a business os employee');

-- Authenticated role but no JWT subject
select pg_temp.as_user(null);
select pg_temp.expect_denied('select public.set_storefront_enabled(true)', 'no-sub enable', 'not authenticated');

-- ============================================================
-- 11 & 12. No bypass: direct UPDATE of is_public_storefront is refused
-- even for the OWNER (column privilege), and there is no org parameter.
-- ============================================================
select pg_temp.as_user('32323232-0000-0000-0000-00000000a011');
select pg_temp.expect_denied(
  $q$update public.organizations set is_public_storefront = true where id = '32323232-0000-0000-0000-00000000a001'$q$,
  'owner direct update', 'permission denied');

do $$
begin
  if exists (select 1 from pg_proc where proname = 'set_storefront_enabled' and pronargs <> 1) then
    raise exception 'TEST FAILED: set_storefront_enabled must take only p_enabled (no organization parameter)';
  end if;
end $$;

-- Owner can still update the columns the app is allowed to (regression).
update public.organizations set legal_name = 'K 6B15B Legal' where id = '32323232-0000-0000-0000-00000000a001';

-- ============================================================
-- 1. OWNER enables own organization
-- ============================================================
do $$
begin
  if public.set_storefront_enabled(true) is distinct from true then
    raise exception 'TEST FAILED: owner enable did not return true';
  end if;
  -- Idempotent repeat: no error, no second audit row.
  perform public.set_storefront_enabled(true);
end $$;

reset role;

do $$
begin
  if not (select is_public_storefront from public.organizations where id = '32323232-0000-0000-0000-00000000a001') then
    raise exception 'TEST FAILED: org A not enabled';
  end if;
  if (select is_public_storefront from public.organizations where id = '32323232-0000-0000-0000-00000000b001') then
    raise exception 'TEST FAILED: org B changed by org A owner';
  end if;
  if public.primary_storefront_org_id() is distinct from '32323232-0000-0000-0000-00000000a001'::uuid then
    raise exception 'TEST FAILED: primary_storefront_org_id() is not org A';
  end if;
  if (select count(*) from public.audit_log
      where table_name = 'organizations' and record_id = '32323232-0000-0000-0000-00000000a001'
        and changed_by = '32323232-0000-0000-0000-00000000a011'
        and new_data ->> 'is_public_storefront' = 'true'
        and old_data ->> 'is_public_storefront' = 'false') <> 1 then
    raise exception 'TEST FAILED: expected exactly one audit row for the enable';
  end if;
end $$;

-- ============================================================
-- 8. Cross-org: org B OWNER cannot make org B a second storefront,
-- and cannot affect org A in any way.
-- ============================================================
set local role authenticated;
select pg_temp.as_user('32323232-0000-0000-0000-00000000b011');
select pg_temp.expect_denied('select public.set_storefront_enabled(true)', 'org B second storefront', 'another organization');
select pg_temp.expect_denied(
  $q$update public.organizations set is_public_storefront = false where id = '32323232-0000-0000-0000-00000000a001'$q$,
  'org B owner direct update of org A', 'permission denied');
-- Disabling org B (already off) is a no-op and must not touch org A.
select public.set_storefront_enabled(false);

reset role;
do $$
begin
  if not (select is_public_storefront from public.organizations where id = '32323232-0000-0000-0000-00000000a001') then
    raise exception 'TEST FAILED: org B owner affected org A storefront';
  end if;
end $$;

-- ============================================================
-- PRODUCT VISIBILITY MATRIX (storefront ON)
-- ============================================================
set local role anon;
select pg_temp.as_user(null);

do $$
declare
  v_ids uuid[];
begin
  select array_agg(id order by sku) into v_ids from public.items;
  if v_ids is distinct from array['32323232-0000-0000-0000-00000000a031'::uuid] then
    raise exception 'TEST FAILED: anon visible items = %, expected only Active Published of org A', v_ids;
  end if;

  -- media: only the published item's media is visible
  if (select count(*) from public.product_media) <> 1
     or not exists (select 1 from public.product_media where id = '32323232-0000-0000-0000-00000000a041') then
    raise exception 'TEST FAILED: anon media visibility wrong';
  end if;

  -- explicit is_published filter works for anon (column grant)
  if (select count(*) from public.items where is_published = true) <> 1 then
    raise exception 'TEST FAILED: anon cannot filter on is_published';
  end if;
end $$;

-- storage policy mirrors the same rule
reset role;
insert into storage.buckets (id, name, public) values ('product-images', 'product-images', false) on conflict (id) do nothing;
insert into storage.objects (bucket_id, name) values
  ('product-images', '32323232-0000-0000-0000-00000000a001/32323232-0000-0000-0000-00000000a031/p.jpg'),
  ('product-images', '32323232-0000-0000-0000-00000000a001/32323232-0000-0000-0000-00000000a032/u.jpg'),
  ('product-images', '32323232-0000-0000-0000-00000000b001/32323232-0000-0000-0000-00000000b031/b.jpg');
set local role anon;
do $$
begin
  if (select count(*) from storage.objects where bucket_id = 'product-images' and name like '32323232-%') <> 1
     or not exists (select 1 from storage.objects where name like '%00000000a031/p.jpg') then
    raise exception 'TEST FAILED: storage object visibility does not match published rule';
  end if;
end $$;

-- authenticated customer sees the same (no more, no less)
set local role authenticated;
select pg_temp.as_user('32323232-0000-0000-0000-00000000c011');
do $$
begin
  if (select count(*) from public.items) <> 1
     or not exists (select 1 from public.items where id = '32323232-0000-0000-0000-00000000a031') then
    raise exception 'TEST FAILED: customer visible items wrong';
  end if;
end $$;

-- ============================================================
-- Customer write paths re-validate is_published
-- ============================================================
select pg_temp.expect_denied(
  $q$select * from public.add_to_cart_item('32323232-0000-0000-0000-00000000a032', 1)$q$,
  'cart unpublished', 'not available');
select pg_temp.expect_denied(
  $q$select * from public.add_to_cart_item('32323232-0000-0000-0000-00000000a033', 1)$q$,
  'cart inactive published', 'not available');
select pg_temp.expect_denied(
  $q$select * from public.add_to_cart_item('32323232-0000-0000-0000-00000000b031', 1)$q$,
  'cart cross-org', 'not available');
select * from public.add_to_cart_item('32323232-0000-0000-0000-00000000a031', 2);

-- ============================================================
-- Customer cannot publish / modify price / modify media / enable storefront
-- ============================================================
do $$
declare v_count int;
begin
  update public.items set is_published = true where id = '32323232-0000-0000-0000-00000000a032';
  get diagnostics v_count = row_count;
  if v_count <> 0 then raise exception 'TEST FAILED: customer published an item'; end if;
  update public.items set selling_price = 1 where id = '32323232-0000-0000-0000-00000000a031';
  get diagnostics v_count = row_count;
  if v_count <> 0 then raise exception 'TEST FAILED: customer changed a price'; end if;
  delete from public.product_media where id = '32323232-0000-0000-0000-00000000a041';
  get diagnostics v_count = row_count;
  if v_count <> 0 then raise exception 'TEST FAILED: customer deleted product media'; end if;
end $$;

-- ============================================================
-- PUBLISH AUTHORIZATION (trigger guard)
-- ============================================================
-- STOCK can still edit ordinary item fields...
select pg_temp.as_user('32323232-0000-0000-0000-00000000a014');
update public.items set reorder_level = 5 where id = '32323232-0000-0000-0000-00000000a032';
-- ...including re-saving the SAME is_published value (edit form save)...
update public.items set is_published = false, reorder_level = 6 where id = '32323232-0000-0000-0000-00000000a032';
-- ...but cannot change publication state, nor create an item pre-published.
select pg_temp.expect_denied(
  $q$update public.items set is_published = true where id = '32323232-0000-0000-0000-00000000a032'$q$,
  'STOCK publish', 'only an owner or admin');
select pg_temp.expect_denied(
  $q$insert into public.items (organization_id, uom_id, sku, name, is_published) values ('32323232-0000-0000-0000-00000000a001', '32323232-0000-0000-0000-00000000a021', 'STK-PUB', 'x', true)$q$,
  'STOCK insert published', 'only an owner or admin');
-- STOCK can still create an (unpublished) item — existing behaviour.
insert into public.items (organization_id, uom_id, sku, name) values ('32323232-0000-0000-0000-00000000a001', '32323232-0000-0000-0000-00000000a021', 'STK-NEW', 'Stock created');

-- SALES has no item write rights at all (unchanged RLS): 0 rows.
select pg_temp.as_user('32323232-0000-0000-0000-00000000a013');
do $$
declare v_count int;
begin
  update public.items set is_published = true where id = '32323232-0000-0000-0000-00000000a032';
  get diagnostics v_count = row_count;
  if v_count <> 0 then raise exception 'TEST FAILED: SALES published an item'; end if;
end $$;

-- Org B OWNER cannot publish/unpublish org A items (RLS: 0 rows).
select pg_temp.as_user('32323232-0000-0000-0000-00000000b011');
do $$
declare v_count int;
begin
  update public.items set is_published = true where id = '32323232-0000-0000-0000-00000000a032';
  get diagnostics v_count = row_count;
  if v_count <> 0 then raise exception 'TEST FAILED: cross-org owner published an item'; end if;
end $$;

-- ADMIN can publish; OWNER can hide.
select pg_temp.as_user('32323232-0000-0000-0000-00000000a012');
update public.items set is_published = true where id = '32323232-0000-0000-0000-00000000a032';
select pg_temp.as_user('32323232-0000-0000-0000-00000000a011');
update public.items set is_published = false where id = '32323232-0000-0000-0000-00000000a031';

-- Staff catalogue RPC exposes is_published to own org only.
do $$
begin
  if (select count(*) from public.items_catalog_for_staff() where organization_id <> '32323232-0000-0000-0000-00000000a001') <> 0 then
    raise exception 'TEST FAILED: items_catalog_for_staff leaked another org';
  end if;
  if (select is_published from public.items_catalog_for_staff() where id = '32323232-0000-0000-0000-00000000a032') is distinct from true then
    raise exception 'TEST FAILED: items_catalog_for_staff is_published not reflected';
  end if;
end $$;

set local role anon;
select pg_temp.as_user(null);
do $$
begin
  if (select array_agg(id) from public.items) is distinct from array['32323232-0000-0000-0000-00000000a032'::uuid] then
    raise exception 'TEST FAILED: publish/hide did not change public visibility as expected';
  end if;
end $$;

-- ============================================================
-- 2. OWNER disables own organization -> everything private again
-- ============================================================
set local role authenticated;
select pg_temp.as_user('32323232-0000-0000-0000-00000000a011');
do $$
begin
  if public.set_storefront_enabled(false) is distinct from false then
    raise exception 'TEST FAILED: owner disable did not return false';
  end if;
end $$;

set local role anon;
select pg_temp.as_user(null);
do $$
begin
  if public.primary_storefront_org_id() is not null then
    raise exception 'TEST FAILED: storefront still resolvable after disable';
  end if;
  if (select count(*) from public.items) <> 0 or (select count(*) from public.product_media) <> 0 then
    raise exception 'TEST FAILED: private organization items/media still visible';
  end if;
end $$;

reset role;
do $$
begin
  if (select count(*) from public.audit_log
      where table_name = 'organizations' and record_id = '32323232-0000-0000-0000-00000000a001') <> 2 then
    raise exception 'TEST FAILED: expected exactly two storefront audit rows (enable, disable)';
  end if;
  if exists (select 1 from pg_proc p where p.proname = 'set_storefront_enabled'
             and has_function_privilege('anon', p.oid, 'execute')) then
    raise exception 'TEST FAILED: anon holds EXECUTE on set_storefront_enabled';
  end if;
end $$;

select 'ALL PHASE 6B-15B STOREFRONT ENABLEMENT SECURITY TESTS PASSED' as result;

rollback;
