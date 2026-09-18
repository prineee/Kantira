-- KANTIRA Business OS — Phase 6B-12: customer self-registration foundation.
--
-- BACKGROUND (Phase 6B-11 architecture decision, Option C — hybrid):
-- customers.created_by is `not null references public.profiles (id)` (0002)
-- — every customer row today was necessarily entered by a staff member,
-- because created_by is a hard FK into the STAFF identity table, not
-- auth.users. Combined with customers_insert RLS (0002, staff roles only),
-- a first-time shopper with no profiles row cannot create their own
-- customer record today. This is the root blocker identified in
-- docs/architecture/PHASE_5_ARCHITECTURE_DECISIONS.md (gap #1) and
-- confirmed unresolved in the Phase 6B-11 audit.
--
-- WHAT THIS MIGRATION DOES:
--   1. Relaxes customers.created_by to nullable — NULL now means "not
--      entered by staff" (self-registered). The FK to profiles(id) is
--      UNCHANGED: a non-null value must still be a real staff profile;
--      NULL is simply exempt from FK checking (standard Postgres FK
--      semantics), so no fake/placeholder profiles row is ever created.
--      The column's DEFAULT (auth.uid()) is deliberately left untouched —
--      app/customers/actions.ts's existing staff createCustomer() insert
--      never sets created_by explicitly and relies entirely on this
--      default; changing or dropping it would break staff customer
--      creation. Verified by repository search: no application code or
--      migration reads customers.created_by for any report, join, or
--      display (same "verified by inspection, safe to leave nullable"
--      standard already applied to items.created_by/product_media.created_by
--      in 0022).
--   2. Adds create_customer_self() — the sole write path for a
--      self-registered customer row, following the exact SECURITY DEFINER
--      pattern already established by set_store_pickup_mapping (0030),
--      place_cod_order, and claim_customer_identity() (0015) itself:
--      auth.uid() is authoritative, organization_id is derived
--      SERVER-SIDE ONLY via primary_storefront_org_id() (0015) — never
--      accepted from the caller — and every other invariant is
--      re-verified inside the function body.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO:
--   - Does NOT add 'CUSTOMER' to public.user_role (locked Phase 6B-11
--     decision — a customer must never need a profiles row/internal role
--     to shop).
--   - Does NOT create any profiles row, employee_store_access row, or
--     assign any user_role for a self-registered customer.
--   - Does NOT modify claim_customer_identity() — it is preserved exactly
--     as-is and remains the ONLY mechanism that links a new auth identity
--     to a pre-existing, staff-created, unclaimed customer row. This
--     migration only adds the complementary "no claimable row exists"
--     path.
--   - Does NOT change customers_insert/_select/_update RLS. A direct
--     client-side `.from('customers').insert(...)` is still rejected for
--     any non-staff caller exactly as before — create_customer_self() is
--     SECURITY DEFINER and bypasses RLS by table ownership (the same
--     mechanism every other write-path RPC in this codebase relies on),
--     so the function's own internal checks ARE the authorization
--     boundary, not a relaxed policy.
--   - Does NOT accept organization_id, auth_user_id, created_by,
--     customer_code, role, or store_id from the caller under any
--     circumstance.
--
-- ATTRIBUTION CHOICE, explicitly justified (diverges from the
-- resolve_accounting_attribution_profile() precedent in 0025): that
-- function attributes SYSTEM-INITIATED accounting postings (sales/
-- journal_entries/stock_movements) to the org's OWNER profile as a
-- disclosed simplification, because those tables have no other "system
-- actor" concept and no code reads that attribution as a security
-- decision. customers.created_by is different: it records WHO ENTERED
-- THIS CUSTOMER, which is a fact a self-registered customer's own row
-- must not misrepresent by pointing at the OWNER (who did not enter it).
-- NULL is the honest, auditable answer: "no staff member created this
-- row." This also matches this migration's own locked instruction not to
-- attribute self-created customers to any staff identity.
--
-- CUSTOMER_CODE GENERATION: no existing generator applies — the only
-- prior art (next_document_number(), 0003) is store-scoped (customers
-- have no store at identity level, per the Phase 6B-11 decision that
-- store/fulfillment stays a separate operational concern) and
-- customer_code today is free-form staff-typed text with no convention to
-- reuse. Format chosen: 'SELF-' || first 12 hex chars of the new row's own
-- id (a gen_random_uuid()). This requires no counter table, no additional
-- row lock, and cannot collide in practice (UUID collision probability),
-- with the table's own `unique (organization_id, customer_code)`
-- constraint as a hard backstop if it somehow ever did. The 'SELF-' prefix
-- also makes a self-registered row visually distinguishable from a
-- staff-typed customer_code in the existing staff UI, incidentally.

-- ============================================================
-- 1. customers.created_by: NOT NULL -> nullable
-- ============================================================

alter table public.customers alter column created_by drop not null;

-- ============================================================
-- 2. create_customer_self() — the only way a self-registered customer
--    row is ever created.
-- ============================================================

create or replace function public.create_customer_self(
  p_name text,
  p_phone text default null
)
returns table (
  out_customer_id uuid,
  out_created boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org_id uuid;
  v_email text;
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_new_id uuid;
  v_customer_id uuid;
  v_created boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if v_name = '' then
    raise exception 'Name is required' using errcode = '22023';
  end if;

  -- Organization is ALWAYS the public storefront org, server-derived —
  -- p_organization_id is not, and must never become, a parameter of this
  -- function. Mirrors claim_customer_identity()'s own org derivation
  -- exactly.
  v_org_id := public.primary_storefront_org_id();
  if v_org_id is null then
    raise exception 'No public storefront organization is configured' using errcode = '22023';
  end if;

  -- Idempotent short-circuit: a second call for the same identity in the
  -- same org returns the existing row rather than raising or duplicating,
  -- mirroring claim_customer_identity()'s own no-op-if-already-linked
  -- guard. Safe to call this function twice.
  select id into v_customer_id
  from public.customers
  where organization_id = v_org_id and auth_user_id = v_uid;

  if v_customer_id is not null then
    return query select v_customer_id, false;
    return;
  end if;

  -- Authoritative email comes from the authenticated identity itself,
  -- never from a caller-supplied parameter — there is no p_email
  -- parameter on this function at all.
  select email into v_email from auth.users where id = v_uid;

  v_new_id := gen_random_uuid();

  -- Conflict target is the column-list form (organization_id,
  -- auth_user_id), matching the partial unique index
  -- customers_organization_id_auth_user_id_key (0009) exactly — NOT
  -- `ON CONFLICT ON CONSTRAINT`, per the lesson already learned and fixed
  -- in migration 0030 (a plain unique index has no constraint name to
  -- target). DO NOTHING + re-select below handles the case where a
  -- concurrent duplicate call for the same identity won the race.
  insert into public.customers (
    id, organization_id, customer_code, name, phone, email,
    auth_user_id, created_by, is_active
  )
  values (
    v_new_id, v_org_id,
    'SELF-' || upper(substr(replace(v_new_id::text, '-', ''), 1, 12)),
    v_name, v_phone, v_email,
    v_uid, null, true
  )
  on conflict (organization_id, auth_user_id) where auth_user_id is not null do nothing
  returning id into v_customer_id;

  if v_customer_id is null then
    select id into v_customer_id
    from public.customers
    where organization_id = v_org_id and auth_user_id = v_uid;
    v_created := false;
  else
    v_created := true;
  end if;

  return query select v_customer_id, v_created;
end;
$$;

revoke all on function public.create_customer_self(text, text) from public;
grant execute on function public.create_customer_self(text, text) to authenticated;
