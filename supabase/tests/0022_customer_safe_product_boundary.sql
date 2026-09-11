-- KANTIRA Business OS — disposable local verification for migration 0022
-- (customer-safe product data boundary: items.cost_price / created_by,
-- product_media.created_by).
--
-- WHAT THIS IS: a real, database-backed proof that the grant/RLS/RPC
-- boundary migration 0022 creates actually behaves as claimed — not a
-- TypeScript mock. It directly reproduces, as a repeatable script, the
-- verification actually run during this change (disposable local Supabase
-- instance, `supabase db reset` to replay 0001-0022, `set local role` +
-- `set local request.jwt.claims` to impersonate each session exactly the
-- way PostgREST does per-request, plus a live curl against the real
-- PostgREST Data API — the curl pass isn't reproduced here since it needs
-- a running REST server and a signed JWT; the psql-level checks below
-- exercise the identical grant+RLS+SECURITY DEFINER evaluation PostgREST
-- itself relies on).
--
-- WHAT THIS IS NOT: part of `npm test`. This repo's test runner
-- (`node --import tsx --test`) has no Postgres/Docker dependency today —
-- every existing test mocks its Supabase client — and this script needs a
-- live local Supabase instance, so it stays a separate, manually-run
-- artifact rather than something wired into CI.
--
-- HOW TO RUN (local Docker required):
--   npx supabase db reset
--   docker exec -i supabase_db_KantiraBusinessOS psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/0022_customer_safe_product_boundary.sql
--
-- The whole thing runs inside one transaction and rolls back at the end —
-- fixtures never persist, and the script is safe to re-run any number of
-- times. A failed assertion raises an exception, so a non-zero psql exit
-- means a real regression, not a flaky test.

begin;

-- ============================================================
-- Disposable fixtures
-- ============================================================

insert into public.organizations (id, name, is_public_storefront)
values ('99999999-9999-9999-9999-999999999901', 'K-SEC-TEST-ORG', true);

insert into public.organizations (id, name, is_public_storefront)
values ('99999999-9999-9999-9999-999999999909', 'K-SEC-TEST-ORG-2', false);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('99999999-9999-9999-9999-999999999902', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'staff-sec-test@example.invalid', crypt('x', gen_salt('bf')), now(), '{}', '{}'),
  ('99999999-9999-9999-9999-999999999903', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cust-sec-test@example.invalid', crypt('x', gen_salt('bf')), now(), '{}', '{}'),
  ('99999999-9999-9999-9999-999999999908', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other-staff-sec-test@example.invalid', crypt('x', gen_salt('bf')), now(), '{}', '{}');

-- SALES: deliberately not OWNER/ADMIN/STOCK — proves cost_price access is
-- "any staff role", matching the items list page's existing behavior, not
-- narrowed to a role subset.
insert into public.profiles (id, organization_id, email, role)
values ('99999999-9999-9999-9999-999999999902', '99999999-9999-9999-9999-999999999901', 'staff-sec-test@example.invalid', 'SALES');

insert into public.profiles (id, organization_id, email, role)
values ('99999999-9999-9999-9999-999999999908', '99999999-9999-9999-9999-999999999909', 'other-staff-sec-test@example.invalid', 'OWNER');

insert into public.customers (id, organization_id, customer_code, name, auth_user_id, created_by)
values ('99999999-9999-9999-9999-999999999904', '99999999-9999-9999-9999-999999999901', 'SEC-CUST-01', 'Sec Test Customer', '99999999-9999-9999-9999-999999999903', '99999999-9999-9999-9999-999999999902');

insert into public.units_of_measurement (id, organization_id, code, name)
values ('99999999-9999-9999-9999-999999999905', '99999999-9999-9999-9999-999999999901', 'PCS', 'Pieces');

insert into public.units_of_measurement (id, organization_id, code, name)
values ('99999999-9999-9999-9999-999999999910', '99999999-9999-9999-9999-999999999909', 'PCS', 'Pieces');

insert into public.items (id, organization_id, uom_id, sku, name, cost_price, selling_price, is_active, created_by)
values ('99999999-9999-9999-9999-999999999906', '99999999-9999-9999-9999-999999999901', '99999999-9999-9999-9999-999999999905', 'SEC-TEST-SKU', 'Sec Test Item', 123.45, 199.00, true, '99999999-9999-9999-9999-999999999902');

insert into public.items (id, organization_id, uom_id, sku, name, cost_price, selling_price, is_active, created_by)
values ('99999999-9999-9999-9999-999999999911', '99999999-9999-9999-9999-999999999909', '99999999-9999-9999-9999-999999999910', 'OTHER-ORG-SKU', 'Other Org Item', 777.77, 999.00, true, '99999999-9999-9999-9999-999999999908');

insert into public.product_media (id, organization_id, item_id, storage_path, media_type, is_primary, created_by)
values ('99999999-9999-9999-9999-999999999907', '99999999-9999-9999-9999-999999999901', '99999999-9999-9999-9999-999999999906', 'test/path.jpg', 'IMAGE', true, '99999999-9999-9999-9999-999999999902');

-- ============================================================
-- 1/2. Customer session: cannot obtain cost_price or created_by
-- ============================================================

set local role authenticated;
set local request.jwt.claims to '{"sub":"99999999-9999-9999-9999-999999999903","role":"authenticated"}';

do $$
begin
  begin
    perform cost_price from public.items where id = '99999999-9999-9999-9999-999999999906';
    raise exception 'FAIL: customer was able to select items.cost_price directly';
  exception when insufficient_privilege then
    null; -- expected
  end;
end $$;

do $$
begin
  begin
    perform created_by from public.product_media where id = '99999999-9999-9999-9999-999999999907';
    raise exception 'FAIL: customer was able to select product_media.created_by directly';
  exception when insufficient_privilege then
    null; -- expected
  end;
end $$;

do $$
begin
  if (select count(*) from public.items_catalog_for_staff()) <> 0 then
    raise exception 'FAIL: customer received rows from the staff-only items_catalog_for_staff() RPC';
  end if;
end $$;

-- ============================================================
-- 3/4. Customer session: customer-safe items/media fields still work
-- ============================================================

do $$
declare v_selling_price numeric;
begin
  select selling_price into v_selling_price from public.items where id = '99999999-9999-9999-9999-999999999906';
  if v_selling_price is distinct from 199.00 then
    raise exception 'FAIL: customer could not read items.selling_price (a safe column)';
  end if;
end $$;

do $$
declare v_path text;
begin
  select storage_path into v_path from public.product_media where id = '99999999-9999-9999-9999-999999999907';
  if v_path is distinct from 'test/path.jpg' then
    raise exception 'FAIL: customer could not read product_media.storage_path (a safe column)';
  end if;
end $$;

reset role;
reset request.jwt.claims;

-- ============================================================
-- 5. Internal staff session: retains cost_price via the RPC, own org only
-- ============================================================

set local role authenticated;
set local request.jwt.claims to '{"sub":"99999999-9999-9999-9999-999999999902","role":"authenticated"}';

do $$
declare v_cost numeric;
begin
  select cost_price into v_cost from public.items_catalog_for_staff() where id = '99999999-9999-9999-9999-999999999906';
  if v_cost is distinct from 123.45 then
    raise exception 'FAIL: staff (SALES role) did not get cost_price back from items_catalog_for_staff()';
  end if;
end $$;

-- ============================================================
-- 6. Organization isolation: the RPC never crosses into another org
-- ============================================================

do $$
begin
  if (select count(*) from public.items_catalog_for_staff() where id = '99999999-9999-9999-9999-999999999911') <> 0 then
    raise exception 'FAIL: items_catalog_for_staff() leaked another organization''s item';
  end if;
end $$;

reset role;
reset request.jwt.claims;

-- ============================================================
-- 7. Anonymous public storefront: unchanged (no cost_price, safe columns OK)
-- ============================================================

set local role anon;

do $$
begin
  begin
    perform cost_price from public.items where id = '99999999-9999-9999-9999-999999999906';
    raise exception 'FAIL: anon was able to select items.cost_price directly';
  exception when insufficient_privilege then
    null; -- expected, unchanged since 0018
  end;
end $$;

do $$
declare v_selling_price numeric;
begin
  select selling_price into v_selling_price from public.items where id = '99999999-9999-9999-9999-999999999906';
  if v_selling_price is distinct from 199.00 then
    raise exception 'FAIL: anon could not read a public-storefront item''s selling_price (unchanged since 0010/0018)';
  end if;
end $$;

reset role;

select 'ALL ASSERTIONS PASSED' as result;

rollback;
