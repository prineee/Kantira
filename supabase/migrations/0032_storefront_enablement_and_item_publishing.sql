-- KANTIRA Business OS — Phase 6B-15B: storefront enablement & catalogue publishing
--
-- Forward-only migration (this repo has no down-migrations; nothing here
-- claims to be reversible). Purely additive except where noted below.
--
-- WHAT THIS DOES
--
-- 1. items.is_published (new column, NOT NULL DEFAULT false).
--      is_active    = item is operationally active in Business OS (UNCHANGED
--                     meaning, UNCHANGED values for every existing row).
--      is_published = item is visible on the public customer storefront.
--    PRODUCTION-SAFETY DEFAULT: every existing row gets is_published = false,
--    so applying this migration never exposes the existing catalogue (V-Neck
--    Scrub included) — an authorized user must publish each item explicitly.
--    `add column ... default false` writes only the new column; no other
--    column of any existing row is touched.
--
-- 2. Public visibility now requires ALL of:
--      organization is the public storefront (is_org_public_storefront)
--      AND items.is_active = true AND items.is_published = true
--    enforced in RLS (items_select_public, product_media_select_public,
--    storage product_images_select_public) and in every customer-facing
--    SECURITY DEFINER write path that re-validates an item
--    (add_to_cart_item, create_checkout_session, create_online_order) — so
--    an unpublished item can neither be read nor bought by UUID.
--    Those three function bodies are reproduced verbatim from
--    pg_get_functiondef() of the 0001-0031 schema with exactly one added
--    `is_published = true` predicate each; CREATE OR REPLACE keeps their
--    existing ACLs.
--
-- 3. Publish authorization: OWNER/ADMIN only (same tier as the 0030
--    pickup-mapping store configuration), enforced by a BEFORE INSERT/UPDATE
--    trigger. STOCK keeps its existing item-edit rights (items_update is
--    unchanged) but cannot change is_published. Customers/anon never reach
--    items writes at all (items_insert/items_update require a staff role).
--
-- 4. set_storefront_enabled(p_enabled): the ONLY way to change
--    organizations.is_public_storefront from the application.
--    OWNER-only — DOCUMENTED DECISION: organization-level configuration in
--    this schema is OWNER-only (organizations_update_owner, 0001), so the
--    storefront switch follows that model rather than widening it to ADMIN.
--    Organization is derived from current_org_id(); there is no
--    organization_id parameter to spoof. Every effective change is written
--    to audit_log (organizations has no organization_id column, so the
--    generic record_audit_log() trigger cannot be attached to it; the RPC
--    writes the equivalent row explicitly). Enabling is refused if a
--    DIFFERENT organization is already the public storefront, because
--    primary_storefront_org_id() serves exactly one org.
--
-- 5. Hardening: table-level UPDATE on public.organizations is narrowed to
--    UPDATE (name, legal_name, gstin) for `authenticated` and removed from
--    `anon`, so is_public_storefront can no longer be flipped by a direct
--    Data API update (which would bypass the audit row above).
--    organizations_update_owner (RLS) is unchanged; no app code updates
--    organizations directly (verified: only selects exist).
--
-- 6. Column grants: SELECT (is_published) added for anon/authenticated
--    (non-sensitive), keeping the explicit column-list posture of 0018/0022,
--    so the storefront can filter on it explicitly as defense in depth.
--
-- 7. items_catalog_for_staff() gains an is_published output column. A
--    RETURNS TABLE signature cannot change via CREATE OR REPLACE, so it is
--    dropped and recreated with the identical body/security posture as 0022
--    plus the one column, and its 0022 grants are re-applied.
--
-- NOT CHANGED: is_active semantics/values, is_public_storefront values of
-- any organization (the storefront stays OFF until an OWNER enables it),
-- primary_storefront_org_id(), is_org_public_storefront(), staff RLS,
-- storage bucket, stock/checkout logic beyond the added predicate.

-- ============================================================
-- 1. items.is_published
-- ============================================================

alter table public.items
  add column if not exists is_published boolean not null default false;

grant select (is_published) on public.items to anon, authenticated;

-- ============================================================
-- 2. Publish authorization guard (OWNER/ADMIN)
--
-- Deliberately NOT security definer: current_user must be the caller's
-- role. Request roles (anon/authenticated) must be an OWNER/ADMIN staff
-- member to change is_published; privileged maintenance contexts
-- (postgres/service_role, or a SECURITY DEFINER function running as the
-- table owner) are unaffected, same as every other RLS boundary here.
-- ============================================================

create or replace function public.enforce_item_publish_authorization()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_changed boolean;
begin
  if tg_op = 'INSERT' then
    v_changed := new.is_published;
  else
    v_changed := new.is_published is distinct from old.is_published;
  end if;

  if not v_changed then
    return new;
  end if;

  if current_user in ('anon', 'authenticated')
     and coalesce(public.current_role()::text, '') not in ('OWNER', 'ADMIN') then
    raise exception 'Only an OWNER or ADMIN can publish or hide items on the storefront'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_item_publish_authorization() from public, anon, authenticated;

drop trigger if exists items_enforce_publish_authorization on public.items;

create trigger items_enforce_publish_authorization
  before insert or update of is_published on public.items
  for each row execute function public.enforce_item_publish_authorization();

-- ============================================================
-- 3. Public visibility (RLS) — requires is_published
-- ============================================================

drop policy if exists items_select_public on public.items;

create policy items_select_public on public.items
  for select
  to anon, authenticated
  using (
    is_active = true
    and is_published = true
    and public.is_org_public_storefront(organization_id)
  );

drop policy if exists product_media_select_public on public.product_media;

create policy product_media_select_public on public.product_media
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.items i
      where i.id = product_media.item_id
        and i.is_active = true
        and i.is_published = true
        and public.is_org_public_storefront(i.organization_id)
    )
  );

drop policy if exists product_images_select_public on storage.objects;

create policy product_images_select_public on storage.objects
  for select
  to anon, authenticated
  using (
    bucket_id = 'product-images'
    and exists (
      select 1
      from public.items i
      where i.id = ((storage.foldername(objects.name))[2])::uuid
        and i.organization_id = ((storage.foldername(objects.name))[1])::uuid
        and i.is_active = true
        and i.is_published = true
        and public.is_org_public_storefront(i.organization_id)
    )
  );

-- ============================================================
-- 4. Customer write paths — re-validate is_published
-- ============================================================

create or replace function public.add_to_cart_item(p_item_id uuid, p_quantity integer DEFAULT 1)
 RETURNS TABLE(out_cart_item_id uuid, out_cart_id uuid, out_item_id uuid, out_quantity integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_customer_id uuid;
  v_organization_id uuid;
  v_cart_id uuid;
  v_item_exists boolean;
begin
  if p_quantity is null or p_quantity < 1 or p_quantity > 9999 then
    raise exception 'Invalid quantity' using errcode = '22023';
  end if;

  select c.id, c.organization_id
    into v_customer_id, v_organization_id
    from public.customers c
   where c.auth_user_id = auth.uid();

  if v_customer_id is null then
    raise exception 'No customer identity found for this session' using errcode = '42501';
  end if;

  select exists (
    select 1
      from public.items i
     where i.id = p_item_id
       and i.organization_id = v_organization_id
       and i.is_active = true
       and i.is_published = true
       and public.is_org_public_storefront(i.organization_id)
  ) into v_item_exists;

  if not v_item_exists then
    raise exception 'This product is not available' using errcode = '22023';
  end if;

  insert into public.carts (organization_id, customer_id)
  values (v_organization_id, v_customer_id)
  on conflict (customer_id) do update set updated_at = now()
  returning id into v_cart_id;

  return query
    insert into public.cart_items as ci (organization_id, cart_id, item_id, quantity)
    values (v_organization_id, v_cart_id, p_item_id, p_quantity)
    on conflict (cart_id, item_id) do update
      set quantity = least(ci.quantity + excluded.quantity, 9999),
          updated_at = now()
    returning ci.id, ci.cart_id, ci.item_id, ci.quantity;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_checkout_session(p_shipping_address_id uuid, p_fulfillment_store_id uuid, p_courier_id text, p_shipping_total numeric, p_payment_method text, p_idempotency_key text)
 RETURNS TABLE(out_checkout_session_id uuid, out_grand_total numeric, out_currency text, out_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_org_id uuid;
  v_customer_id uuid;
  v_existing_id uuid;
  v_cart_id uuid;
  v_line record;
  v_item record;
  v_unit_price numeric;
  v_tax_amount numeric;
  v_line_total numeric;
  v_subtotal numeric := 0;
  v_tax_total numeric := 0;
  v_line_count int := 0;
  v_session_id uuid;
  v_grand_total numeric;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_payment_method not in ('COD', 'RAZORPAY') then
    raise exception 'Invalid payment method' using errcode = '22023';
  end if;

  if p_idempotency_key is null or length(trim(p_idempotency_key)) = 0 then
    raise exception 'Missing idempotency key' using errcode = '22023';
  end if;

  v_org_id := public.primary_storefront_org_id();
  if v_org_id is null then
    raise exception 'No public storefront is currently configured';
  end if;

  select id into v_customer_id
    from public.customers
    where auth_user_id = v_uid and organization_id = v_org_id;

  if v_customer_id is null then
    raise exception 'No Kantira customer profile is linked to this account yet';
  end if;

  select id into v_existing_id
    from public.checkout_sessions
    where organization_id = v_org_id and customer_id = v_customer_id and idempotency_key = p_idempotency_key;

  if v_existing_id is not null then
    return query
      select cs.id, cs.grand_total, cs.currency, cs.status
      from public.checkout_sessions cs
      where cs.id = v_existing_id;
    return;
  end if;

  if p_shipping_address_id is null or not exists (
    select 1 from public.customer_addresses
    where id = p_shipping_address_id and customer_id = v_customer_id
  ) then
    raise exception 'Delivery address does not belong to this customer';
  end if;

  if p_fulfillment_store_id is not null and not exists (
    select 1 from public.stores
    where id = p_fulfillment_store_id and organization_id = v_org_id and is_active = true
  ) then
    raise exception 'Fulfillment store is not valid for this organization';
  end if;

  if p_shipping_total is null or p_shipping_total < 0 then
    raise exception 'Invalid shipping charge' using errcode = '22023';
  end if;

  select id into v_cart_id from public.carts where customer_id = v_customer_id;
  if v_cart_id is null then
    raise exception 'Your cart is empty';
  end if;

  create temporary table if not exists tmp_checkout_lines (
    item_id uuid, sku_snapshot text, name_snapshot text,
    unit_price numeric, quantity numeric, tax_amount numeric, line_total numeric
  ) on commit drop;
  delete from tmp_checkout_lines;

  for v_line in
    select ci.item_id, ci.quantity from public.cart_items ci where ci.cart_id = v_cart_id
  loop
    select i.id, i.sku, i.name, i.selling_price, i.tax_rate_percent
      into v_item
      from public.items i
      where i.id = v_line.item_id
        and i.organization_id = v_org_id
        and i.is_active = true
        and i.is_published = true
        and public.is_org_public_storefront(i.organization_id);

    if v_item.id is null then
      raise exception 'One or more items in your cart are no longer available';
    end if;

    v_unit_price := v_item.selling_price;
    v_tax_amount := round(v_unit_price * v_line.quantity * v_item.tax_rate_percent / 100, 2);
    v_line_total := round(v_unit_price * v_line.quantity, 2) + v_tax_amount;

    v_subtotal := v_subtotal + round(v_unit_price * v_line.quantity, 2);
    v_tax_total := v_tax_total + v_tax_amount;
    v_line_count := v_line_count + 1;

    insert into tmp_checkout_lines
      values (v_item.id, v_item.sku, v_item.name, v_unit_price, v_line.quantity, v_tax_amount, v_line_total);
  end loop;

  if v_line_count = 0 then
    raise exception 'Your cart is empty';
  end if;

  v_grand_total := v_subtotal + v_tax_total + p_shipping_total;

  begin
    insert into public.checkout_sessions (
      organization_id, customer_id, created_by, status, payment_method,
      shipping_address_id, fulfillment_store_id, courier_id,
      subtotal, tax_total, shipping_total, grand_total, currency, idempotency_key
    ) values (
      v_org_id, v_customer_id, v_uid, 'OPEN', p_payment_method,
      p_shipping_address_id, p_fulfillment_store_id, p_courier_id,
      v_subtotal, v_tax_total, p_shipping_total, v_grand_total, 'INR', p_idempotency_key
    )
    returning id into v_session_id;
  exception when unique_violation then
    select id into v_session_id
      from public.checkout_sessions
      where organization_id = v_org_id and customer_id = v_customer_id and idempotency_key = p_idempotency_key;

    drop table if exists tmp_checkout_lines;

    return query
      select cs.id, cs.grand_total, cs.currency, cs.status
      from public.checkout_sessions cs
      where cs.id = v_session_id;
    return;
  end;

  insert into public.checkout_session_lines (
    checkout_session_id, organization_id, item_id, sku_snapshot, name_snapshot,
    unit_price, quantity, tax_amount, line_total
  )
  select v_session_id, v_org_id, item_id, sku_snapshot, name_snapshot, unit_price, quantity, tax_amount, line_total
  from tmp_checkout_lines;

  drop table if exists tmp_checkout_lines;

  return query select v_session_id, v_grand_total, 'INR'::text, 'OPEN'::text;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_online_order(p_lines jsonb, p_shipping_address_id uuid, p_billing_address_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text, p_channel text DEFAULT 'WEBSITE'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_org_id uuid;
  v_customer_id uuid;
  v_existing_order_id uuid;
  v_order_id uuid;
  v_order_number text;
  v_line jsonb;
  v_item_id uuid;
  v_quantity numeric;
  v_item record;
  v_unit_price numeric;
  v_tax_amount numeric;
  v_line_total numeric;
  v_subtotal numeric := 0;
  v_tax_total numeric := 0;
  v_line_count int := 0;
  v_channel text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_channel := case when p_channel in ('WEBSITE', 'ANDROID') then p_channel else 'WEBSITE' end;

  v_org_id := public.primary_storefront_org_id();
  if v_org_id is null then
    raise exception 'No public storefront is currently configured';
  end if;

  select id into v_customer_id
  from public.customers
  where auth_user_id = v_uid
    and organization_id = v_org_id;

  if v_customer_id is null then
    raise exception 'No Kantira customer profile is linked to this account yet';
  end if;

  if p_idempotency_key is not null then
    select id into v_existing_order_id
    from public.online_orders
    where organization_id = v_org_id
      and customer_id = v_customer_id
      and idempotency_key = p_idempotency_key;

    if v_existing_order_id is not null then
      return v_existing_order_id;
    end if;
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Order must contain at least one line';
  end if;

  if not exists (
    select 1 from public.customer_addresses
    where id = p_shipping_address_id and customer_id = v_customer_id
  ) then
    raise exception 'Shipping address does not belong to this customer';
  end if;

  if p_billing_address_id is not null and not exists (
    select 1 from public.customer_addresses
    where id = p_billing_address_id and customer_id = v_customer_id
  ) then
    raise exception 'Billing address does not belong to this customer';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_item_id := (v_line ->> 'item_id')::uuid;
    v_quantity := (v_line ->> 'quantity')::numeric;

    if v_item_id is null or v_quantity is null or v_quantity <= 0 then
      raise exception 'Invalid order line: item_id and a positive quantity are required';
    end if;

    select id, name, selling_price, tax_rate_percent
      into v_item
    from public.items
    where id = v_item_id
      and organization_id = v_org_id
      and is_active = true
      and is_published = true;

    if v_item.id is null then
      raise exception 'Item % is not available', v_item_id;
    end if;

    v_unit_price := v_item.selling_price;
    v_tax_amount := round(v_unit_price * v_quantity * v_item.tax_rate_percent / 100, 2);
    v_line_total := round(v_unit_price * v_quantity, 2) + v_tax_amount;

    v_subtotal := v_subtotal + round(v_unit_price * v_quantity, 2);
    v_tax_total := v_tax_total + v_tax_amount;
    v_line_count := v_line_count + 1;

    create temporary table if not exists tmp_online_order_lines (
      item_id uuid, item_name_snapshot text, unit_price numeric,
      quantity numeric, tax_amount numeric, line_total numeric
    ) on commit drop;

    insert into tmp_online_order_lines
      values (v_item_id, v_item.name, v_unit_price, v_quantity, v_tax_amount, v_line_total);
  end loop;

  v_order_number := 'ONL-' || to_char(now(), 'YYYYMMDD') || '-'
    || lpad(nextval('public.online_order_number_seq')::text, 6, '0');

  begin
    insert into public.online_orders (
      organization_id, customer_id, order_number, status, payment_status,
      subtotal, tax_total, shipping_total, discount_total, grand_total,
      shipping_address_id, billing_address_id, idempotency_key, created_by, channel
    ) values (
      v_org_id, v_customer_id, v_order_number, 'PENDING', 'PENDING',
      v_subtotal, v_tax_total, 0, 0, v_subtotal + v_tax_total,
      p_shipping_address_id, p_billing_address_id, p_idempotency_key, v_uid, v_channel
    )
    returning id into v_order_id;
  exception
    when unique_violation then
      select id into v_order_id
      from public.online_orders
      where organization_id = v_org_id
        and customer_id = v_customer_id
        and idempotency_key = p_idempotency_key;

      if v_order_id is not null then
        drop table if exists tmp_online_order_lines;
        return v_order_id;
      end if;
      raise;
  end;

  insert into public.online_order_lines (
    organization_id, order_id, item_id, item_name_snapshot,
    unit_price, quantity, tax_amount, line_total
  )
  select v_org_id, v_order_id, item_id, item_name_snapshot,
         unit_price, quantity, tax_amount, line_total
  from tmp_online_order_lines;

  drop table if exists tmp_online_order_lines;

  return v_order_id;
end;
$function$;

-- ============================================================
-- 5. items_catalog_for_staff() — adds is_published (see header, item 7)
-- ============================================================

drop function if exists public.items_catalog_for_staff();

create function public.items_catalog_for_staff()
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
  is_published boolean,
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
    i.is_published,
    i.created_at,
    i.updated_at
  from public.items i
  where i.organization_id = public.current_org_id();
$$;

revoke all on function public.items_catalog_for_staff() from public, anon;
grant execute on function public.items_catalog_for_staff() to authenticated;

-- ============================================================
-- 6. set_storefront_enabled — OWNER-only, audited
-- ============================================================

create or replace function public.set_storefront_enabled(p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org_id uuid := public.current_org_id();
  v_role public.user_role := public.current_role();
  v_current boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if v_org_id is null then
    raise exception 'Not authenticated as a Business OS employee' using errcode = '42501';
  end if;

  if v_role is distinct from 'OWNER'::public.user_role then
    raise exception 'Only the organization OWNER can change the storefront setting'
      using errcode = '42501';
  end if;

  if p_enabled is null then
    raise exception 'A storefront state (on or off) is required' using errcode = '22023';
  end if;

  -- Serializes concurrent enable attempts so the "only one public
  -- storefront" check below cannot race.
  perform pg_advisory_xact_lock(hashtext('kantira.public_storefront'));

  select is_public_storefront into v_current
    from public.organizations
    where id = v_org_id
    for update;

  if v_current is null then
    raise exception 'Organization not found' using errcode = '42501';
  end if;

  if v_current = p_enabled then
    return v_current;
  end if;

  if p_enabled and exists (
    select 1 from public.organizations
    where is_public_storefront = true and id <> v_org_id
  ) then
    raise exception 'Another organization is already configured as the public storefront'
      using errcode = '55000';
  end if;

  update public.organizations
    set is_public_storefront = p_enabled
    where id = v_org_id;

  insert into public.audit_log (
    organization_id, table_name, record_id, action, changed_by, old_data, new_data
  )
  values (
    v_org_id,
    'organizations',
    v_org_id,
    'UPDATE',
    v_uid,
    jsonb_build_object('is_public_storefront', v_current),
    jsonb_build_object('is_public_storefront', p_enabled)
  );

  return p_enabled;
end;
$$;

revoke all on function public.set_storefront_enabled(boolean) from public, anon;
grant execute on function public.set_storefront_enabled(boolean) to authenticated;

-- ============================================================
-- 7. Hardening: no direct Data API write to is_public_storefront
-- ============================================================

revoke update on public.organizations from anon, authenticated;
grant update (name, legal_name, gstin) on public.organizations to authenticated;
