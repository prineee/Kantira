-- KANTIRA Business OS — disposable local verification for migration 0031
-- (create_customer_self: the sole write path for a self-registered
-- customer row) and its interaction with the unmodified
-- claim_customer_identity() (0015).
--
-- Same nature/rationale as supabase/tests/0030_store_pickup_mapping_security.sql
-- — a real, database-backed proof, not a TypeScript mock. NOT part of
-- `npm test` (this repo's test runner has no Postgres dependency); run
-- manually against a disposable local Supabase instance. Everything runs
-- inside one transaction and rolls back at the end.
--
-- HOW TO RUN (local Docker required, migrations 0001-0031 already applied):
--   docker exec -i supabase_db_KantiraBusinessOS psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/0031_customer_self_registration_security.sql

begin;

-- ============================================================
-- Disposable fixtures. This local database may already contain other
-- organizations with is_public_storefront = false (confirmed before
-- writing this test — no other org has it set true), so exactly one
-- fixture org below is flagged true; primary_storefront_org_id() is
-- verified against that org specifically, not assumed.
-- ============================================================

insert into public.organizations (id, name, is_public_storefront)
values
  ('88888888-8888-8888-8888-888888888b01', 'K-CUSTOMER-TEST-STOREFRONT', true),
  ('88888888-8888-8888-8888-888888888b09', 'K-CUSTOMER-TEST-OTHER-ORG', false);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  -- Staff OWNER of the storefront org, used to prove existing staff
  -- customer creation is unaffected by this migration.
  ('88888888-8888-8888-8888-888888888b02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-cust-test@example.invalid', crypt('x', gen_salt('bf')), now(), '{}', '{}'),
  -- A brand-new shopper: no profiles row, no customers row, confirmed
  -- email — the primary self-registration case.
  ('88888888-8888-8888-8888-888888888b03', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'new-shopper-cust-test@example.invalid', crypt('x', gen_salt('bf')), now(), '{}', '{}'),
  -- A second brand-new shopper, used for cross-customer isolation checks.
  ('88888888-8888-8888-8888-888888888b04', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'second-shopper-cust-test@example.invalid', crypt('x', gen_salt('bf')), now(), '{}', '{}'),
  -- An identity with a CONFIRMED email matching a pre-existing,
  -- staff-created, unclaimed customer row — the claim_customer_identity()
  -- case.
  ('88888888-8888-8888-8888-888888888b05', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'walk-in-cust-test@example.invalid', crypt('x', gen_salt('bf')), now(), '{}', '{}');

insert into public.profiles (id, organization_id, email, role)
values
  ('88888888-8888-8888-8888-888888888b02', '88888888-8888-8888-8888-888888888b01', 'owner-cust-test@example.invalid', 'OWNER');

-- Staff-created, unclaimed customer row (a walk-in sale, e.g.) — the
-- pre-existing case claim_customer_identity() exists to solve.
insert into public.customers (id, organization_id, customer_code, name, email, created_by)
values
  ('88888888-8888-8888-8888-888888888b06', '88888888-8888-8888-8888-888888888b01', 'WALKIN-CUST-TEST', 'Walk-in Customer', 'walk-in-cust-test@example.invalid', '88888888-8888-8888-8888-888888888b02');

set local role authenticated;

-- ============================================================
-- 1 & 12. Unauthenticated call fails (no JWT claim set)
-- ============================================================
do $$
begin
  begin
    perform set_config('request.jwt.claims', '', true);
    perform public.create_customer_self('Someone');
    raise exception 'TEST FAILED: unauthenticated call should have raised';
  exception
    when others then
      if sqlerrm !~* 'not authenticated' then
        raise exception 'TEST FAILED: unexpected error for unauthenticated call: %', sqlerrm;
      end if;
  end;
end $$;

-- ============================================================
-- 2. Invalid/empty name is rejected
-- ============================================================
select set_config('request.jwt.claims', json_build_object('sub', '88888888-8888-8888-8888-888888888b03')::text, true);

do $$
begin
  begin
    perform public.create_customer_self('   ');
    raise exception 'TEST FAILED: whitespace-only name should have been rejected';
  exception
    when others then
      if sqlerrm !~* 'name' then
        raise exception 'TEST FAILED: unexpected error for blank name: %', sqlerrm;
      end if;
  end;
end $$;

-- ============================================================
-- 3. Self customer can be created; auth.uid() is used; organization is
--    server-derived to the public storefront org (not the other fixture
--    org, and not caller-suppliable); created_by is NULL (no fake staff
--    profile); customer_code is generated, not caller-supplied.
-- ============================================================
do $$
declare
  v_customer_id uuid;
  v_created boolean;
  v_row record;
begin
  select out_customer_id, out_created into v_customer_id, v_created
  from public.create_customer_self('New Shopper', '9998887777');

  if v_customer_id is null then
    raise exception 'TEST FAILED: expected a customer id to be returned';
  end if;
  if v_created is not true then
    raise exception 'TEST FAILED: expected out_created = true on first call';
  end if;

  select * into v_row from public.customers where id = v_customer_id;

  if v_row.auth_user_id <> '88888888-8888-8888-8888-888888888b03' then
    raise exception 'TEST FAILED: auth_user_id was not the caller''s own auth.uid()';
  end if;
  if v_row.organization_id <> '88888888-8888-8888-8888-888888888b01' then
    raise exception 'TEST FAILED: organization was not the public storefront org, got %', v_row.organization_id;
  end if;
  if v_row.created_by is not null then
    raise exception 'TEST FAILED: created_by should be NULL for a self-registered customer, got %', v_row.created_by;
  end if;
  if v_row.name <> 'New Shopper' or v_row.phone <> '9998887777' then
    raise exception 'TEST FAILED: name/phone were not stored as given';
  end if;
  if v_row.email <> 'new-shopper-cust-test@example.invalid' then
    raise exception 'TEST FAILED: email should be derived from auth.users, got %', v_row.email;
  end if;
  if v_row.customer_code !~ '^SELF-' then
    raise exception 'TEST FAILED: expected a generated SELF- customer_code, got %', v_row.customer_code;
  end if;
end $$;

-- ============================================================
-- 4 & 5. Caller cannot supply an auth_user_id, organization_id, or
--    created_by — the function accepts exactly (p_name, p_phone); a call
--    with a third positional argument fails at the signature level, not
--    inside the function body, because no such overload exists.
-- ============================================================
do $$
begin
  begin
    perform public.create_customer_self('Someone', '123', '88888888-8888-8888-8888-888888888b09');
    raise exception 'TEST FAILED: a 3-argument call should not resolve to any function signature';
  exception
    when undefined_function then
      null; -- expected: no such overload exists
  end;
end $$;

do $$
declare
  v_argnames text[];
begin
  -- proargnames includes OUT parameters too for a RETURNS TABLE function
  -- (out_customer_id, out_created) — only the first two (IN) positions are
  -- caller-suppliable, and neither is organization_id/auth_user_id/
  -- created_by under any name.
  select proargnames into v_argnames
  from pg_proc
  where proname = 'create_customer_self' and pronamespace = 'public'::regnamespace;

  if v_argnames[1:2] <> array['p_name', 'p_phone'] then
    raise exception 'TEST FAILED: unexpected create_customer_self() IN argument list: %', v_argnames[1:2];
  end if;

  if exists (
    select 1 from unnest(v_argnames) a(name)
    where a.name ~* 'organization|auth_user|created_by|role|store'
  ) then
    raise exception 'TEST FAILED: create_customer_self() unexpectedly has a caller-suppliable identity/org/role parameter: %', v_argnames;
  end if;
end $$;

-- ============================================================
-- 6. No BROADER-than-existing INSERT access exists: `anon` (unauthenticated)
--    must never have an INSERT grant on customers — the base per-column
--    table grant to `authenticated` predates this migration (0002, needed
--    for RLS to apply at all — RLS restricts ROWS, not the base
--    privilege) and is unchanged here. The actual restriction a caller
--    faces is customers_insert RLS (staff roles only), proven directly
--    below: a customer identity's own direct table INSERT is still
--    rejected, exactly as before this migration — create_customer_self()
--    is SECURITY DEFINER precisely so this stays true.
-- ============================================================
do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'customers'
    and grantee = 'anon'
    and privilege_type = 'INSERT';
  if v_count <> 0 then
    raise exception 'TEST FAILED: anon unexpectedly has an INSERT grant on customers';
  end if;
end $$;

do $$
begin
  begin
    insert into public.customers (organization_id, customer_code, name)
    values ('88888888-8888-8888-8888-888888888b01', 'DIRECT-INSERT-ATTEMPT', 'Direct Insert');
    raise exception 'TEST FAILED: a direct customer-authenticated INSERT should have been rejected by RLS';
  exception
    when insufficient_privilege then
      null; -- expected: customers_insert RLS still requires a staff role
  end;
end $$;

-- ============================================================
-- 9. Duplicate self-bootstrap is safe: calling create_customer_self()
--    again for the SAME identity returns the same row, out_created=false,
--    and does not create a second row.
-- ============================================================
do $$
declare
  v_customer_id uuid;
  v_created boolean;
  v_count int;
begin
  select out_customer_id, out_created into v_customer_id, v_created
  from public.create_customer_self('New Shopper (again)', '0000000000');

  if v_created is not false then
    raise exception 'TEST FAILED: expected out_created = false on second call for the same identity';
  end if;

  select count(*) into v_count
  from public.customers
  where auth_user_id = '88888888-8888-8888-8888-888888888b03';
  if v_count <> 1 then
    raise exception 'TEST FAILED: expected exactly one customer row for this identity, found %', v_count;
  end if;

  -- The second call must not have overwritten the original row's data.
  if (select name from public.customers where id = v_customer_id) <> 'New Shopper' then
    raise exception 'TEST FAILED: duplicate call should not have modified the existing row';
  end if;
end $$;

-- ============================================================
-- 10 & 11. Customer RLS remains isolated: the self-registered customer
--    can read their own row, cannot see the second (as-yet-uncreated)
--    shopper's row, and — having no profiles row — cannot see any
--    staff-only data (stores).
-- ============================================================
do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.customers
  where auth_user_id = '88888888-8888-8888-8888-888888888b03';
  if v_count <> 1 then
    raise exception 'TEST FAILED: self-registered customer should be able to read their own row';
  end if;

  select count(*) into v_count from public.stores;
  if v_count <> 0 then
    raise exception 'TEST FAILED: a customer identity (no profiles row) should not see any staff-only stores data, saw %', v_count;
  end if;
end $$;

-- Second shopper self-registers, then verify cross-customer isolation.
select set_config('request.jwt.claims', json_build_object('sub', '88888888-8888-8888-8888-888888888b04')::text, true);

select out_customer_id from public.create_customer_self('Second Shopper');

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.customers
  where auth_user_id = '88888888-8888-8888-8888-888888888b03';
  if v_count <> 0 then
    raise exception 'TEST FAILED: second shopper should not be able to see the first shopper''s customer row (RLS isolation failure)';
  end if;

  select count(*) into v_count from public.customers
  where auth_user_id = '88888888-8888-8888-8888-888888888b04';
  if v_count <> 1 then
    raise exception 'TEST FAILED: second shopper should be able to see their own row';
  end if;
end $$;

-- ============================================================
-- 13. claim_customer_identity() remains safe and unmodified: a confirmed
--    email matching an unclaimed staff-created customer links correctly;
--    a second attempt for an already-linked identity is a safe no-op; a
--    non-matching identity gets null.
-- ============================================================
select set_config('request.jwt.claims', json_build_object('sub', '88888888-8888-8888-8888-888888888b05')::text, true);

do $$
declare
  v_claimed_id uuid;
begin
  select public.claim_customer_identity() into v_claimed_id;
  if v_claimed_id <> '88888888-8888-8888-8888-888888888b06' then
    raise exception 'TEST FAILED: expected claim to link the pre-existing walk-in customer row, got %', v_claimed_id;
  end if;

  if (select auth_user_id from public.customers where id = '88888888-8888-8888-8888-888888888b06')
     <> '88888888-8888-8888-8888-888888888b05' then
    raise exception 'TEST FAILED: walk-in customer row was not linked to the claiming identity';
  end if;
end $$;

-- Second claim attempt for the SAME already-linked identity: safe no-op.
do $$
declare
  v_claimed_id uuid;
begin
  select public.claim_customer_identity() into v_claimed_id;
  if v_claimed_id is not null then
    raise exception 'TEST FAILED: re-claiming an already-linked identity should return null, got %', v_claimed_id;
  end if;
end $$;

-- A confirmed identity with no matching unclaimed customer gets null (not
-- an error, and not a fabricated row) — proven here by the second
-- shopper, who has no staff-created row anywhere.
select set_config('request.jwt.claims', json_build_object('sub', '88888888-8888-8888-8888-888888888b04')::text, true);

do $$
declare
  v_claimed_id uuid;
begin
  select public.claim_customer_identity() into v_claimed_id;
  if v_claimed_id is not null then
    raise exception 'TEST FAILED: a non-matching identity should get null from claim_customer_identity(), got %', v_claimed_id;
  end if;
end $$;

-- ============================================================
-- 8. Existing staff customer creation still works, unaffected by the
--    created_by nullability change (default auth.uid() untouched).
-- ============================================================
select set_config('request.jwt.claims', json_build_object('sub', '88888888-8888-8888-8888-888888888b02')::text, true);

insert into public.customers (organization_id, customer_code, name, email)
values ('88888888-8888-8888-8888-888888888b01', 'STAFF-CREATED-CUST-TEST', 'Staff Created Customer', 'staffcreated@example.invalid');

do $$
declare
  v_row record;
begin
  select * into v_row from public.customers where customer_code = 'STAFF-CREATED-CUST-TEST';
  if v_row.id is null then
    raise exception 'TEST FAILED: staff-created customer row was not created';
  end if;
  if v_row.created_by <> '88888888-8888-8888-8888-888888888b02' then
    raise exception 'TEST FAILED: staff-created customer should still record created_by via the untouched default, got %', v_row.created_by;
  end if;
end $$;

-- ============================================================
-- 14. No CUSTOMER role/profile was created anywhere by this whole test:
--    no profiles row exists for either self-registered shopper, and the
--    user_role enum itself still has no CUSTOMER label.
-- ============================================================
do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.profiles
  where id in ('88888888-8888-8888-8888-888888888b03', '88888888-8888-8888-8888-888888888b04');
  if v_count <> 0 then
    raise exception 'TEST FAILED: a self-registered customer must never gain a profiles row';
  end if;

  select count(*) into v_count
  from pg_enum e
  join pg_type t on t.oid = e.enumtypid
  where t.typname = 'user_role' and e.enumlabel = 'CUSTOMER';
  if v_count <> 0 then
    raise exception 'TEST FAILED: public.user_role must never gain a CUSTOMER label';
  end if;
end $$;

reset role;
rollback;

select 'ALL PHASE 6B-12 CUSTOMER SELF-REGISTRATION SECURITY TESTS PASSED' as result;
