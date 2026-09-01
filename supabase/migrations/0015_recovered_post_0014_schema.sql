-- KANTIRA Business OS — RECOVERED SCHEMA (post-0014, historical boundaries unknown)
--
-- ============================================================================
-- THIS IS A RECONSTRUCTION, NOT A HISTORICAL MIGRATION FILE.
-- ============================================================================
--
-- The authoritative local database (supabase_migrations.schema_migrations)
-- records migrations 0001-0014 by version and name. It records NOTHING
-- beyond 0014. Yet the live schema contains substantial additional
-- application-specific objects — 9 tables/views, 15 functions (14 new +
-- one, assert_stock_available, modified in place from its 0003 definition
-- to subtract active stock_reservations from availability), 1 sequence,
-- 1 storage bucket and its policies — that migrations 0001-0014 do not
-- produce (verified 2026-08-29 by building those 14 migrations fresh in a
-- disposable database, diffing every table/view/function/index/constraint/
-- trigger/policy against the authoritative schema, and specifically
-- diffing full function bodies — not just names — which is what surfaced
-- the modified assert_stock_available; a name-only comparison would have
-- missed it since the function already existed in 0003). These objects
-- were applied to the authoritative database with
-- NO migration identity at all — no tracked version, no name, nothing in
-- schema_migrations. There is no evidence anywhere on F: of what the
-- original file boundaries (if any ever existed) were, and this file does
-- NOT claim to reproduce specific historical migration numbers such as a
-- "0015" through "0025" sequence — those numbers, mentioned in earlier
-- conversation context, are not proof of this repository's actual
-- migration history and are not used here.
--
-- Every statement below was reconstructed solely from live PostgreSQL
-- catalog metadata on the authoritative database: pg_dump --schema-only
-- (for table/view/index/constraint/trigger/RLS/grant DDL) and
-- pg_get_functiondef() (for every function body, verbatim). Nothing here
-- was inferred from naming conventions, prior conversation summaries, or
-- assumptions about intended design — see PHASE_5_MASTER_RECOVERY_AND_ROADMAP.md
-- for the full recovery methodology and the disposable-database validation
-- this file was checked against before being placed here.
--
-- Applying this file to a copy of 0001-0014 must reproduce the
-- authoritative schema exactly, for these objects, with zero unexplained
-- difference. It does not touch any 0001-0014 object.

-- ============================================================================
-- SEQUENCE
-- ============================================================================

CREATE SEQUENCE public.online_order_number_seq
    START WITH 1
    INCREMENT BY 1
    MINVALUE 1
    NO MAXVALUE
    CACHE 1;

-- ============================================================================
-- TABLES (dependency order: customer_addresses -> online_orders ->
-- online_order_lines -> stock_reservations -> payment_intents ->
-- payment_events; product_media and store_shipping_config have no
-- interdependency with this chain)
-- ============================================================================

CREATE TABLE public.customer_addresses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    label text,
    recipient_name text NOT NULL,
    phone text NOT NULL,
    line1 text NOT NULL,
    line2 text,
    city text NOT NULL,
    state text NOT NULL,
    postal_code text NOT NULL,
    country text DEFAULT 'IN'::text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.customer_addresses
    ADD CONSTRAINT customer_addresses_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.customer_addresses
    ADD CONSTRAINT customer_addresses_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.customer_addresses
    ADD CONSTRAINT customer_addresses_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX customer_addresses_customer_id_default_key ON public.customer_addresses USING btree (customer_id) WHERE (is_default = true);

CREATE INDEX customer_addresses_organization_id_customer_id_idx ON public.customer_addresses USING btree (organization_id, customer_id);

CREATE TABLE public.online_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    fulfillment_store_id uuid,
    order_number text NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    payment_status text DEFAULT 'PENDING'::text NOT NULL,
    subtotal numeric(14,2) NOT NULL,
    discount_total numeric(14,2) DEFAULT 0 NOT NULL,
    tax_total numeric(14,2) NOT NULL,
    shipping_total numeric(14,2) DEFAULT 0 NOT NULL,
    grand_total numeric(14,2) NOT NULL,
    loyalty_points_earned integer DEFAULT 0 NOT NULL,
    loyalty_points_redeemed integer DEFAULT 0 NOT NULL,
    shipping_address_id uuid NOT NULL,
    billing_address_id uuid,
    sale_id uuid,
    idempotency_key text,
    placed_at timestamp with time zone DEFAULT now() NOT NULL,
    confirmed_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    delivered_at timestamp with time zone,
    cancellation_reason text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    channel text DEFAULT 'WEBSITE'::text NOT NULL,
    store_assigned_at timestamp with time zone,
    processing_at timestamp with time zone,
    packed_at timestamp with time zone,
    CONSTRAINT online_orders_channel_check CHECK ((channel = ANY (ARRAY['WEBSITE'::text, 'ANDROID'::text]))),
    CONSTRAINT online_orders_payment_status_check CHECK ((payment_status = ANY (ARRAY['PENDING'::text, 'PAID'::text, 'FAILED'::text, 'REFUNDED'::text, 'PARTIALLY_REFUNDED'::text]))),
    CONSTRAINT online_orders_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'CONFIRMED'::text, 'PROCESSING'::text, 'PACKED'::text, 'SHIPPED'::text, 'DELIVERED'::text, 'CANCELLED'::text, 'RETURN_REQUESTED'::text, 'RETURNED'::text])))
);

ALTER TABLE ONLY public.online_orders
    ADD CONSTRAINT online_orders_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.online_orders
    ADD CONSTRAINT online_orders_billing_address_id_fkey FOREIGN KEY (billing_address_id) REFERENCES public.customer_addresses(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.online_orders
    ADD CONSTRAINT online_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE ONLY public.online_orders
    ADD CONSTRAINT online_orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.online_orders
    ADD CONSTRAINT online_orders_fulfillment_store_id_fkey FOREIGN KEY (fulfillment_store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.online_orders
    ADD CONSTRAINT online_orders_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.online_orders
    ADD CONSTRAINT online_orders_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.online_orders
    ADD CONSTRAINT online_orders_shipping_address_id_fkey FOREIGN KEY (shipping_address_id) REFERENCES public.customer_addresses(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX online_orders_org_customer_idempotency_key ON public.online_orders USING btree (organization_id, customer_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);

CREATE INDEX online_orders_organization_id_channel_idx ON public.online_orders USING btree (organization_id, channel);

CREATE INDEX online_orders_organization_id_customer_id_idx ON public.online_orders USING btree (organization_id, customer_id);

CREATE UNIQUE INDEX online_orders_organization_id_order_number_key ON public.online_orders USING btree (organization_id, order_number);

CREATE INDEX online_orders_organization_id_store_id_status_idx ON public.online_orders USING btree (organization_id, fulfillment_store_id, status);

CREATE UNIQUE INDEX online_orders_sale_id_key ON public.online_orders USING btree (sale_id) WHERE (sale_id IS NOT NULL);

CREATE TABLE public.online_order_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    order_id uuid NOT NULL,
    item_id uuid NOT NULL,
    item_name_snapshot text NOT NULL,
    unit_price numeric(14,2) NOT NULL,
    quantity numeric(14,3) NOT NULL,
    tax_amount numeric(14,2) DEFAULT 0 NOT NULL,
    discount_amount numeric(14,2) DEFAULT 0 NOT NULL,
    line_total numeric(14,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT online_order_lines_quantity_check CHECK ((quantity > (0)::numeric))
);

ALTER TABLE ONLY public.online_order_lines
    ADD CONSTRAINT online_order_lines_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.online_order_lines
    ADD CONSTRAINT online_order_lines_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.online_order_lines
    ADD CONSTRAINT online_order_lines_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.online_orders(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.online_order_lines
    ADD CONSTRAINT online_order_lines_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

CREATE INDEX online_order_lines_order_id_idx ON public.online_order_lines USING btree (order_id);

CREATE INDEX online_order_lines_organization_id_item_id_idx ON public.online_order_lines USING btree (organization_id, item_id);

CREATE TABLE public.stock_reservations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    online_order_id uuid NOT NULL,
    online_order_line_id uuid NOT NULL,
    item_id uuid NOT NULL,
    store_id uuid NOT NULL,
    quantity numeric(14,3) NOT NULL,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    released_at timestamp with time zone,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stock_reservations_quantity_check CHECK ((quantity > (0)::numeric)),
    CONSTRAINT stock_reservations_status_check CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'RELEASED'::text, 'CONSUMED'::text])))
);

ALTER TABLE ONLY public.stock_reservations
    ADD CONSTRAINT stock_reservations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.stock_reservations
    ADD CONSTRAINT stock_reservations_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.stock_reservations
    ADD CONSTRAINT stock_reservations_online_order_id_fkey FOREIGN KEY (online_order_id) REFERENCES public.online_orders(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.stock_reservations
    ADD CONSTRAINT stock_reservations_online_order_line_id_fkey FOREIGN KEY (online_order_line_id) REFERENCES public.online_order_lines(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.stock_reservations
    ADD CONSTRAINT stock_reservations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.stock_reservations
    ADD CONSTRAINT stock_reservations_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX stock_reservations_line_active_key ON public.stock_reservations USING btree (online_order_line_id) WHERE (status = 'ACTIVE'::text);

CREATE INDEX stock_reservations_online_order_id_idx ON public.stock_reservations USING btree (online_order_id);

CREATE INDEX stock_reservations_org_store_item_status_idx ON public.stock_reservations USING btree (organization_id, store_id, item_id, status);

CREATE TABLE public.payment_intents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    order_id uuid NOT NULL,
    provider text NOT NULL,
    provider_intent_id text,
    provider_payment_id text,
    amount numeric(14,2) NOT NULL,
    currency text DEFAULT 'INR'::text NOT NULL,
    status text DEFAULT 'CREATED'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payment_intents_provider_check CHECK ((provider = ANY (ARRAY['RAZORPAY'::text, 'COD'::text]))),
    CONSTRAINT payment_intents_status_check CHECK ((status = ANY (ARRAY['CREATED'::text, 'AUTHORIZED'::text, 'CAPTURED'::text, 'FAILED'::text, 'REFUNDED'::text, 'PARTIALLY_REFUNDED'::text])))
);

ALTER TABLE ONLY public.payment_intents
    ADD CONSTRAINT payment_intents_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.payment_intents
    ADD CONSTRAINT payment_intents_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.online_orders(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.payment_intents
    ADD CONSTRAINT payment_intents_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX payment_intents_order_id_active_key ON public.payment_intents USING btree (order_id) WHERE (status = 'CREATED'::text);

CREATE INDEX payment_intents_order_id_idx ON public.payment_intents USING btree (order_id);

CREATE INDEX payment_intents_organization_id_idx ON public.payment_intents USING btree (organization_id);

CREATE UNIQUE INDEX payment_intents_provider_intent_id_key ON public.payment_intents USING btree (provider, provider_intent_id) WHERE (provider_intent_id IS NOT NULL);

CREATE TABLE public.payment_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    payment_intent_id uuid NOT NULL,
    provider text NOT NULL,
    provider_event_id text NOT NULL,
    event_type text NOT NULL,
    raw_payload jsonb NOT NULL,
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.payment_events
    ADD CONSTRAINT payment_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.payment_events
    ADD CONSTRAINT payment_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.payment_events
    ADD CONSTRAINT payment_events_payment_intent_id_fkey FOREIGN KEY (payment_intent_id) REFERENCES public.payment_intents(id) ON DELETE RESTRICT;

CREATE INDEX payment_events_organization_id_idx ON public.payment_events USING btree (organization_id);

CREATE INDEX payment_events_payment_intent_id_idx ON public.payment_events USING btree (payment_intent_id);

CREATE UNIQUE INDEX payment_events_provider_event_id_key ON public.payment_events USING btree (provider, provider_event_id);

CREATE TABLE public.product_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid DEFAULT public.current_org_id() NOT NULL,
    item_id uuid NOT NULL,
    storage_path text NOT NULL,
    media_type text DEFAULT 'IMAGE'::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    alt_text text,
    created_by uuid DEFAULT auth.uid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_media_media_type_check CHECK ((media_type = 'IMAGE'::text))
);

ALTER TABLE ONLY public.product_media
    ADD CONSTRAINT product_media_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.product_media
    ADD CONSTRAINT product_media_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);

ALTER TABLE ONLY public.product_media
    ADD CONSTRAINT product_media_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.product_media
    ADD CONSTRAINT product_media_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX product_media_item_id_primary_key ON public.product_media USING btree (item_id) WHERE (is_primary = true);

CREATE INDEX product_media_item_id_sort_order_idx ON public.product_media USING btree (item_id, sort_order);

CREATE INDEX product_media_organization_id_idx ON public.product_media USING btree (organization_id);

CREATE UNIQUE INDEX product_media_storage_path_key ON public.product_media USING btree (storage_path);

CREATE TABLE public.store_shipping_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    store_id uuid NOT NULL,
    provider text NOT NULL,
    provider_location_id text,
    provider_location_name text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT store_shipping_config_provider_check CHECK ((provider = 'SHIPROCKET'::text))
);

ALTER TABLE ONLY public.store_shipping_config
    ADD CONSTRAINT store_shipping_config_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.store_shipping_config
    ADD CONSTRAINT store_shipping_config_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.store_shipping_config
    ADD CONSTRAINT store_shipping_config_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX store_shipping_config_org_store_key ON public.store_shipping_config USING btree (organization_id, store_id);

-- ============================================================================
-- VIEW
--
-- RECOVERY NOTE (verified fact, not a fix): unlike every other view in this
-- schema (stock_balances, inventory_valuation, sale_line_cogs,
-- sale_profitability, loyalty_balances — all `WITH (security_invoker =
-- true)`), the authoritative database's available_to_sell view does NOT
-- have security_invoker set, confirmed via pg_class.reloptions. Combined
-- with `authenticated` already holding a table-level SELECT grant on it
-- (also confirmed), this view — reproduced here exactly as it exists —
-- runs with its owner's privileges, not the querying user's, meaning any
-- authenticated caller who queries it directly bypasses stock_reservations'
-- and stock_balances' own RLS and can see every organization's stock
-- availability. This migration reproduces the view exactly as found, per
-- the "reproduce, do not improve" instruction. See the security review in
-- PHASE_5_MASTER_RECOVERY_AND_ROADMAP.md.
-- ============================================================================

CREATE VIEW public.available_to_sell AS
 SELECT sb.organization_id,
    sb.store_id,
    sb.item_id,
    sb.quantity_on_hand,
    COALESCE(r.reserved_quantity, (0)::numeric) AS reserved_quantity,
    (sb.quantity_on_hand - COALESCE(r.reserved_quantity, (0)::numeric)) AS available_quantity
   FROM (public.stock_balances sb
     LEFT JOIN ( SELECT stock_reservations.organization_id,
            stock_reservations.store_id,
            stock_reservations.item_id,
            sum(stock_reservations.quantity) AS reserved_quantity
           FROM public.stock_reservations
          WHERE (stock_reservations.status = 'ACTIVE'::text)
          GROUP BY stock_reservations.organization_id, stock_reservations.store_id, stock_reservations.item_id) r ON (((r.organization_id = sb.organization_id) AND (r.store_id = sb.store_id) AND (r.item_id = sb.item_id))));

-- ============================================================================
-- FUNCTIONS
--
-- Every function below is reproduced byte-for-byte from pg_get_functiondef()
-- against the authoritative database. All 14 are SECURITY DEFINER, all set
-- an explicit search_path, and all derive identity/authorization from
-- auth.uid()/current_org_id()/current_role() — never from a client-supplied
-- organization_id or customer_id parameter. See the per-function security
-- notes in PHASE_5_MASTER_RECOVERY_AND_ROADMAP.md.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.primary_storefront_org_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select id
  from public.organizations
  where is_public_storefront = true
  order by created_at asc
  limit 1;
$function$;

REVOKE ALL ON FUNCTION public.primary_storefront_org_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.primary_storefront_org_id() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_customer_identity()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_org_id uuid;
  v_match_count int;
  v_customer_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if exists (select 1 from public.customers where auth_user_id = v_uid) then
    return null;
  end if;

  select email into v_email
  from auth.users
  where id = v_uid
    and email_confirmed_at is not null;

  if v_email is null or trim(v_email) = '' then
    return null;
  end if;

  v_org_id := public.primary_storefront_org_id();
  if v_org_id is null then
    return null;
  end if;

  select count(*)
    into v_match_count
  from public.customers
  where organization_id = v_org_id
    and auth_user_id is null
    and email is not null
    and lower(email) = lower(v_email);

  if v_match_count = 1 then
    select id into v_customer_id
    from public.customers
    where organization_id = v_org_id
      and auth_user_id is null
      and email is not null
      and lower(email) = lower(v_email)
    limit 1;

    update public.customers
      set auth_user_id = v_uid
      where id = v_customer_id
        and auth_user_id is null;

    if found then
      return v_customer_id;
    end if;
  end if;

  return null;
end;
$function$;

REVOKE ALL ON FUNCTION public.claim_customer_identity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_customer_identity() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_item_public_availability(p_item_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (
      select sum(greatest(ats.available_quantity, 0)) > 0
      from public.available_to_sell ats
      join public.stores s on s.id = ats.store_id and s.is_active = true
      where ats.item_id = p_item_id
    ),
    false
  );
$function$;

REVOKE ALL ON FUNCTION public.get_item_public_availability(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_item_public_availability(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_single_default_address()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.is_default then
    update public.customer_addresses
      set is_default = false
      where customer_id = new.customer_id
        and id <> new.id
        and is_default = true;
  end if;
  return new;
end;
$function$;

-- MODIFIES a function first defined in 0003_phase3_transactions.sql.
-- Reproduced exactly from pg_get_functiondef() against the authoritative
-- database — this is a genuine in-place change (CREATE OR REPLACE, same
-- signature), not a new function, discovered via full function-body
-- comparison rather than name-only comparison. Every caller of
-- assert_stock_available() (post_sale, post_purchase_return via 0004's
-- replacements, and reserve_all_lines_at_store/reserve_online_order_stock
-- below) is unaffected in signature; the change is purely that reserved
-- online-order stock is now subtracted from what counts as "available",
-- so an in-store sale can no longer oversell stock already committed to a
-- pending online order.
CREATE OR REPLACE FUNCTION public.assert_stock_available(
  p_store_id uuid,
  p_item_id uuid,
  p_quantity_needed numeric
)
returns void
language plpgsql
as $$
declare
  physical_available numeric(14, 3);
  reserved numeric(14, 3);
begin
  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text || ':' || p_item_id::text, 0));

  select coalesce(sum(case when direction = 'IN' then quantity else -quantity end), 0)
    into physical_available
    from public.stock_movements
    where store_id = p_store_id and item_id = p_item_id;

  select coalesce(sum(quantity), 0)
    into reserved
    from public.stock_reservations
    where store_id = p_store_id and item_id = p_item_id and status = 'ACTIVE';

  if (physical_available - reserved) < p_quantity_needed then
    raise exception 'Insufficient stock for item % at store %: available %, requested %',
      p_item_id, p_store_id, (physical_available - reserved), p_quantity_needed;
  end if;
end;
$$;

CREATE OR REPLACE FUNCTION public.reserve_all_lines_at_store(p_order_id uuid, p_store_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org_id uuid;
  v_line record;
begin
  select organization_id into v_org_id from public.online_orders where id = p_order_id;

  for v_line in
    select id, item_id, quantity from public.online_order_lines where order_id = p_order_id
  loop
    perform public.assert_stock_available(p_store_id, v_line.item_id, v_line.quantity);

    insert into public.stock_reservations (
      organization_id, online_order_id, online_order_line_id, item_id, store_id, quantity, status
    ) values (
      v_org_id, p_order_id, v_line.id, v_line.item_id, p_store_id, v_line.quantity, 'ACTIVE'
    );
  end loop;
end;
$function$;

REVOKE ALL ON FUNCTION public.reserve_all_lines_at_store(uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.reserve_online_order_stock(p_order_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org_id uuid := public.current_org_id();
  v_role public.user_role := public.current_role();
  v_order record;
  v_line record;
  v_existing_count int;
  v_reserved_count int := 0;
begin
  if v_org_id is null then
    raise exception 'Not authenticated as a Business OS employee';
  end if;

  select id, organization_id, status, fulfillment_store_id into v_order
  from public.online_orders
  where id = p_order_id;

  if v_order.id is null or v_order.organization_id <> v_org_id then
    raise exception 'Order not found in this organization';
  end if;

  if not (
    v_role = any (array['OWNER'::public.user_role, 'ADMIN'::public.user_role])
    or (v_role = 'STOCK'::public.user_role and public.has_store_access(v_order.fulfillment_store_id))
  ) then
    raise exception 'Not permitted to reserve stock for this order';
  end if;

  if v_order.fulfillment_store_id is null then
    raise exception 'Assign a fulfillment store before reserving stock';
  end if;

  -- Decision #6: release any ACTIVE reservation sitting at a store that
  -- no longer matches the order's current fulfillment_store_id (a staff
  -- reassignment happened since the reservation was made). Idempotent:
  -- if the existing reservation is already at the current store, this
  -- UPDATE matches zero rows and the normal idempotency check below
  -- short-circuits as before.
  update public.stock_reservations
    set status = 'RELEASED', released_at = now()
    where online_order_id = p_order_id
      and status = 'ACTIVE'
      and store_id <> v_order.fulfillment_store_id;

  select count(*) into v_existing_count
  from public.stock_reservations
  where online_order_id = p_order_id and status = 'ACTIVE' and store_id = v_order.fulfillment_store_id;

  if v_existing_count > 0 then
    return v_existing_count;
  end if;

  for v_line in
    select id, item_id, quantity from public.online_order_lines where order_id = p_order_id
  loop
    perform public.assert_stock_available(v_order.fulfillment_store_id, v_line.item_id, v_line.quantity);

    insert into public.stock_reservations (
      organization_id, online_order_id, online_order_line_id, item_id, store_id, quantity, status
    ) values (
      v_org_id, p_order_id, v_line.id, v_line.item_id, v_order.fulfillment_store_id, v_line.quantity, 'ACTIVE'
    );

    v_reserved_count := v_reserved_count + 1;
  end loop;

  return v_reserved_count;
end;
$function$;

REVOKE ALL ON FUNCTION public.reserve_online_order_stock(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_online_order_stock(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.auto_allocate_online_order_store(p_order_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order record;
  v_candidate record;
  v_reserved int;
  v_existing_active_count int;
begin
  if coalesce(auth.role(), 'anon') <> 'service_role' then
    if public.current_org_id() is null
      or not (public.current_role() = any (array['OWNER'::public.user_role, 'ADMIN'::public.user_role]))
    then
      raise exception 'Not permitted to allocate a fulfillment store';
    end if;
  end if;

  select id, organization_id, status, fulfillment_store_id into v_order
  from public.online_orders
  where id = p_order_id;

  if v_order.id is null then
    raise exception 'Order not found';
  end if;

  if coalesce(auth.role(), 'anon') <> 'service_role' and v_order.organization_id <> public.current_org_id() then
    raise exception 'Order not found in this organization';
  end if;

  -- Idempotent: already allocated with a live reservation at its current
  -- store — nothing to do. (A manually-assigned-but-not-yet-reserved
  -- order still falls through below and gets reserved at that same
  -- store first, before any candidate search — manual override always
  -- wins over automatic selection when it already happened.)
  if v_order.fulfillment_store_id is not null then
    select count(*) into v_existing_active_count
    from public.stock_reservations
    where online_order_id = p_order_id and status = 'ACTIVE' and store_id = v_order.fulfillment_store_id;

    if v_existing_active_count > 0 then
      return v_order.fulfillment_store_id;
    end if;

    -- Store already assigned (manually) but not yet reserved — reserve
    -- there directly, no candidate search, respecting the manual choice.
    begin
      perform public.reserve_all_lines_at_store(p_order_id, v_order.fulfillment_store_id);
      return v_order.fulfillment_store_id;
    exception when others then
      -- The manually-assigned store can't actually cover the order
      -- (stock changed since assignment) — fall through to candidate
      -- search below rather than leaving the order silently unreserved.
      null;
    end;
  end if;

  -- Candidate search: active stores in this org, deterministic order.
  -- Soft Shiprocket-mapping preference only applies once the org has at
  -- least one active mapping row (decision #2) — coalesce to false so an
  -- org with zero mappings (every org, today) treats all candidates
  -- equally rather than excluding all of them.
  for v_candidate in
    select s.id as store_id
    from public.stores s
    where s.organization_id = v_order.organization_id
      and s.is_active = true
    order by
      coalesce((
        select ssc.active from public.store_shipping_config ssc
        where ssc.store_id = s.id and ssc.active = true
      ), false) desc,
      s.created_at asc,
      s.store_code asc
  loop
    begin
      -- Assign then reserve inside the same sub-transaction: if
      -- reservation fails (a concurrent sale/reservation just consumed
      -- the stock this candidate looked eligible for), the whole
      -- sub-block rolls back to the savepoint and the loop tries the
      -- next candidate — no partial assignment, no partial reservation.
      update public.online_orders
        set fulfillment_store_id = v_candidate.store_id
        where id = p_order_id;

      perform public.reserve_all_lines_at_store(p_order_id, v_candidate.store_id);

      return v_candidate.store_id;
    exception when others then
      continue;
    end;
  end loop;

  -- No eligible store — truthful non-allocation, not a false confirmed
  -- state. fulfillment_store_id stays null (the UPDATE above only ever
  -- committed inside a rolled-back sub-block); staff resolve manually.
  update public.online_orders set fulfillment_store_id = null where id = p_order_id and fulfillment_store_id is null;
  return null;
end;
$function$;

REVOKE ALL ON FUNCTION public.auto_allocate_online_order_store(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auto_allocate_online_order_store(uuid) TO authenticated, service_role;

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
      and is_active = true;

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

REVOKE ALL ON FUNCTION public.create_online_order(jsonb, uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_online_order(jsonb, uuid, uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.advance_online_order_status(p_order_id uuid, p_new_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org_id uuid := public.current_org_id();
  v_role public.user_role := public.current_role();
  v_order record;
  v_updated int;
  v_is_owner_admin boolean;
begin
  if v_org_id is null then
    raise exception 'Not authenticated as a Business OS employee';
  end if;

  select id, organization_id, status, fulfillment_store_id into v_order
  from public.online_orders
  where id = p_order_id;

  if v_order.id is null or v_order.organization_id <> v_org_id then
    raise exception 'Order not found in this organization';
  end if;

  v_is_owner_admin := v_role = any (array['OWNER'::public.user_role, 'ADMIN'::public.user_role]);

  if p_new_status = 'CONFIRMED' then
    if v_order.status <> 'PENDING' then
      raise exception 'Order must be PENDING to confirm';
    end if;
    if not v_is_owner_admin then
      raise exception 'Only OWNER/ADMIN can confirm an order';
    end if;

  elsif p_new_status = 'PROCESSING' then
    if v_order.status <> 'CONFIRMED' then
      raise exception 'Order must be CONFIRMED to start processing';
    end if;
    if v_order.fulfillment_store_id is null then
      raise exception 'Assign a fulfillment store before processing';
    end if;
    if not (v_is_owner_admin or (v_role = 'STOCK'::public.user_role and public.has_store_access(v_order.fulfillment_store_id))) then
      raise exception 'Not permitted to process this order';
    end if;

  elsif p_new_status = 'PACKED' then
    if v_order.status <> 'PROCESSING' then
      raise exception 'Order must be PROCESSING to mark packed/ready';
    end if;
    if not (v_is_owner_admin or (v_role = 'STOCK'::public.user_role and public.has_store_access(v_order.fulfillment_store_id))) then
      raise exception 'Not permitted to mark this order ready';
    end if;

  else
    raise exception 'Unsupported status transition: %', p_new_status;
  end if;

  update public.online_orders
    set status = p_new_status,
        confirmed_at = case when p_new_status = 'CONFIRMED' then now() else confirmed_at end
    where id = p_order_id
      and organization_id = v_org_id
      and status = v_order.status;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'Order state changed — please refresh and try again';
  end if;

  if p_new_status = 'CONFIRMED' then
    -- Defense in depth for Part 4's "failure is non-fatal" requirement:
    -- auto_allocate_online_order_store() already treats "no eligible
    -- store" as a normal, non-raising outcome internally, but ANY
    -- unexpected error inside it (a bug, a future change, a permission
    -- edge case) must still never roll back the order's own CONFIRMED
    -- transition, which already committed above — CONFIRMED means
    -- "payment/acceptance", not "fulfillment secured" (architecture doc
    -- Section 8), so allocation is best-effort from this call site's
    -- perspective, not a precondition for the status change itself.
    begin
      perform public.auto_allocate_online_order_store(p_order_id);
    exception when others then
      null;
    end;
  end if;
end;
$function$;

REVOKE ALL ON FUNCTION public.advance_online_order_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.advance_online_order_status(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.assign_online_order_store(p_order_id uuid, p_store_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org_id uuid := public.current_org_id();
  v_role public.user_role := public.current_role();
  v_order record;
  v_updated int;
begin
  if v_org_id is null then
    raise exception 'Not authenticated as a Business OS employee';
  end if;

  if not (
    v_role = any (array['OWNER'::public.user_role, 'ADMIN'::public.user_role])
    or (v_role = 'STOCK'::public.user_role and public.has_store_access(p_store_id))
  ) then
    raise exception 'Not permitted to assign this store';
  end if;

  if not exists (
    select 1 from public.stores s
    where s.id = p_store_id and s.organization_id = v_org_id and s.is_active = true
  ) then
    raise exception 'Store not found in this organization';
  end if;

  select id, organization_id, status into v_order
  from public.online_orders
  where id = p_order_id;

  if v_order.id is null or v_order.organization_id <> v_org_id then
    raise exception 'Order not found in this organization';
  end if;

  if v_order.status not in ('PENDING', 'CONFIRMED') then
    raise exception 'Store can only be assigned before processing begins';
  end if;

  update public.online_orders
    set fulfillment_store_id = p_store_id,
        store_assigned_at = now()
    where id = p_order_id
      and organization_id = v_org_id
      and status in ('PENDING', 'CONFIRMED');

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'Order state changed — please refresh and try again';
  end if;
end;
$function$;

REVOKE ALL ON FUNCTION public.assign_online_order_store(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_online_order_store(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_online_order(p_order_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_is_owner_customer boolean;
  v_is_staff boolean;
  v_order record;
  v_updated int;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select id, status, payment_status into v_order
  from public.online_orders
  where id = p_order_id;

  if v_order.id is null then
    raise exception 'Order not found';
  end if;

  select exists (
    select 1 from public.online_orders o
    join public.customers c on c.id = o.customer_id
    where o.id = p_order_id and c.auth_user_id = v_uid
  ) into v_is_owner_customer;

  select exists (
    select 1 from public.online_orders o
    where o.id = p_order_id
      and o.organization_id = public.current_org_id()
      and public.current_role() = any (array['OWNER'::public.user_role, 'ADMIN'::public.user_role])
  ) into v_is_staff;

  if not (v_is_owner_customer or v_is_staff) then
    raise exception 'Not permitted to cancel this order';
  end if;

  if v_order.payment_status = 'PAID' then
    raise exception 'This order has been paid — cancellation requires a refund, which is not yet available';
  end if;

  update public.online_orders
    set status = 'CANCELLED',
        cancelled_at = now(),
        cancellation_reason = p_reason
    where id = p_order_id
      and sale_id is null
      and payment_status <> 'PAID'
      and (
        (v_is_owner_customer and status = 'PENDING')
        or (v_is_staff and status in ('PENDING', 'CONFIRMED'))
      );

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'Order cannot be cancelled from its current state';
  end if;

  update public.stock_reservations
    set status = 'RELEASED',
        released_at = now()
    where online_order_id = p_order_id
      and status = 'ACTIVE';
end;
$function$;

REVOKE ALL ON FUNCTION public.cancel_online_order(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_online_order(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_product_media(p_media_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org_id uuid := public.current_org_id();
  v_role public.user_role := public.current_role();
  v_path text;
begin
  if v_org_id is null then
    raise exception 'Not authenticated as a Business OS employee';
  end if;

  if v_role not in ('OWNER', 'ADMIN', 'STOCK') then
    raise exception 'Not permitted to manage product images';
  end if;

  delete from public.product_media
    where id = p_media_id
      and organization_id = v_org_id
    returning storage_path into v_path;

  if v_path is null then
    raise exception 'Product image not found in this organization';
  end if;

  return v_path;
end;
$function$;

REVOKE ALL ON FUNCTION public.delete_product_media(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_product_media(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reorder_product_media(p_item_id uuid, p_media_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org_id uuid := public.current_org_id();
  v_role public.user_role := public.current_role();
  v_item_org uuid;
  v_existing_count int;
  v_provided_count int;
begin
  if v_org_id is null then
    raise exception 'Not authenticated as a Business OS employee';
  end if;

  if v_role not in ('OWNER', 'ADMIN', 'STOCK') then
    raise exception 'Not permitted to manage product images';
  end if;

  select organization_id into v_item_org from public.items where id = p_item_id;
  if v_item_org is null or v_item_org <> v_org_id then
    raise exception 'Product not found in this organization';
  end if;

  select count(*) into v_existing_count
  from public.product_media
  where item_id = p_item_id;

  select count(*) into v_provided_count from unnest(p_media_ids) id;

  -- The provided list must be exactly this item's current media set (no
  -- more, no fewer, no foreign ids smuggled in) — verified by count plus
  -- the join-scoped UPDATE below only ever touching rows that already
  -- belong to p_item_id, so an id for a different item/org is silently
  -- excluded rather than acted on.
  if v_provided_count <> v_existing_count then
    raise exception 'Reorder list does not match this product''s current images';
  end if;

  update public.product_media pm
    set sort_order = ord.position
    from unnest(p_media_ids) with ordinality as ord(id, position)
    where pm.id = ord.id
      and pm.item_id = p_item_id
      and pm.organization_id = v_org_id;
end;
$function$;

REVOKE ALL ON FUNCTION public.reorder_product_media(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_product_media(uuid, uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_primary_product_media(p_media_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org_id uuid := public.current_org_id();
  v_role public.user_role := public.current_role();
  v_media record;
begin
  if v_org_id is null then
    raise exception 'Not authenticated as a Business OS employee';
  end if;

  if v_role not in ('OWNER', 'ADMIN', 'STOCK') then
    raise exception 'Not permitted to manage product images';
  end if;

  select id, item_id, organization_id into v_media
  from public.product_media
  where id = p_media_id;

  if v_media.id is null or v_media.organization_id <> v_org_id then
    raise exception 'Product image not found in this organization';
  end if;

  perform 1
  from public.product_media
  where item_id = v_media.item_id
  for update;

  update public.product_media
    set is_primary = false
    where item_id = v_media.item_id
      and is_primary = true
      and id <> p_media_id;

  update public.product_media
    set is_primary = true
    where id = p_media_id;
end;
$function$;

REVOKE ALL ON FUNCTION public.set_primary_product_media(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_primary_product_media(uuid) TO authenticated;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER customer_addresses_audit AFTER INSERT OR DELETE OR UPDATE ON public.customer_addresses FOR EACH ROW EXECUTE FUNCTION public.record_audit_log();
CREATE TRIGGER customer_addresses_enforce_single_default BEFORE INSERT OR UPDATE OF is_default ON public.customer_addresses FOR EACH ROW WHEN ((new.is_default = true)) EXECUTE FUNCTION public.enforce_single_default_address();
CREATE TRIGGER customer_addresses_set_updated_at BEFORE UPDATE ON public.customer_addresses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER online_order_lines_audit AFTER INSERT ON public.online_order_lines FOR EACH ROW EXECUTE FUNCTION public.record_audit_log();

CREATE TRIGGER online_orders_audit AFTER INSERT OR UPDATE ON public.online_orders FOR EACH ROW EXECUTE FUNCTION public.record_audit_log();
CREATE TRIGGER online_orders_set_updated_at BEFORE UPDATE ON public.online_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER payment_intents_audit AFTER INSERT OR UPDATE ON public.payment_intents FOR EACH ROW EXECUTE FUNCTION public.record_audit_log();
CREATE TRIGGER payment_intents_set_updated_at BEFORE UPDATE ON public.payment_intents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER product_media_audit AFTER INSERT OR DELETE OR UPDATE ON public.product_media FOR EACH ROW EXECUTE FUNCTION public.record_audit_log();
CREATE TRIGGER product_media_set_updated_at BEFORE UPDATE ON public.product_media FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER stock_reservations_audit AFTER INSERT OR UPDATE ON public.stock_reservations FOR EACH ROW EXECUTE FUNCTION public.record_audit_log();
CREATE TRIGGER stock_reservations_set_updated_at BEFORE UPDATE ON public.stock_reservations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER store_shipping_config_audit AFTER INSERT OR UPDATE ON public.store_shipping_config FOR EACH ROW EXECUTE FUNCTION public.record_audit_log();
CREATE TRIGGER store_shipping_config_set_updated_at BEFORE UPDATE ON public.store_shipping_config FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_addresses_delete_self ON public.customer_addresses FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.customers c
  WHERE ((c.id = customer_addresses.customer_id) AND (c.auth_user_id = auth.uid())))));

CREATE POLICY customer_addresses_insert_self ON public.customer_addresses FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.customers c
  WHERE ((c.id = customer_addresses.customer_id) AND (c.auth_user_id = auth.uid()) AND (c.organization_id = customer_addresses.organization_id)))));

CREATE POLICY customer_addresses_select_self ON public.customer_addresses FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.customers c
  WHERE ((c.id = customer_addresses.customer_id) AND (c.auth_user_id = auth.uid())))));

CREATE POLICY customer_addresses_select_staff ON public.customer_addresses FOR SELECT TO authenticated USING (((organization_id = public.current_org_id()) AND (public."current_role"() = ANY (ARRAY['OWNER'::public.user_role, 'ADMIN'::public.user_role]))));

CREATE POLICY customer_addresses_update_self ON public.customer_addresses FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.customers c
  WHERE ((c.id = customer_addresses.customer_id) AND (c.auth_user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.customers c
  WHERE ((c.id = customer_addresses.customer_id) AND (c.auth_user_id = auth.uid()) AND (c.organization_id = customer_addresses.organization_id)))));

ALTER TABLE public.online_order_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY online_order_lines_select_self ON public.online_order_lines FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.online_orders o
     JOIN public.customers c ON ((c.id = o.customer_id)))
  WHERE ((o.id = online_order_lines.order_id) AND (c.auth_user_id = auth.uid())))));

CREATE POLICY online_order_lines_select_staff ON public.online_order_lines FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.online_orders o
  WHERE ((o.id = online_order_lines.order_id) AND (o.organization_id = public.current_org_id()) AND ((public."current_role"() = ANY (ARRAY['OWNER'::public.user_role, 'ADMIN'::public.user_role])) OR ((public."current_role"() = 'STOCK'::public.user_role) AND (o.fulfillment_store_id IS NOT NULL) AND public.has_store_access(o.fulfillment_store_id)))))));

ALTER TABLE public.online_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY online_orders_select_self ON public.online_orders FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.customers c
  WHERE ((c.id = online_orders.customer_id) AND (c.auth_user_id = auth.uid())))));

CREATE POLICY online_orders_select_staff ON public.online_orders FOR SELECT TO authenticated USING (((organization_id = public.current_org_id()) AND ((public."current_role"() = ANY (ARRAY['OWNER'::public.user_role, 'ADMIN'::public.user_role])) OR ((public."current_role"() = 'STOCK'::public.user_role) AND (fulfillment_store_id IS NOT NULL) AND public.has_store_access(fulfillment_store_id)))));

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY payment_events_select_staff ON public.payment_events FOR SELECT TO authenticated USING (((organization_id = public.current_org_id()) AND (public."current_role"() = ANY (ARRAY['OWNER'::public.user_role, 'ADMIN'::public.user_role]))));

ALTER TABLE public.payment_intents ENABLE ROW LEVEL SECURITY;

CREATE POLICY payment_intents_select_self ON public.payment_intents FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.online_orders o
     JOIN public.customers c ON ((c.id = o.customer_id)))
  WHERE ((o.id = payment_intents.order_id) AND (c.auth_user_id = auth.uid())))));

CREATE POLICY payment_intents_select_staff ON public.payment_intents FOR SELECT TO authenticated USING (((organization_id = public.current_org_id()) AND (public."current_role"() = ANY (ARRAY['OWNER'::public.user_role, 'ADMIN'::public.user_role, 'ACCOUNTANT'::public.user_role]))));

ALTER TABLE public.product_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY product_media_delete ON public.product_media FOR DELETE TO authenticated USING (((organization_id = public.current_org_id()) AND (public."current_role"() = ANY (ARRAY['OWNER'::public.user_role, 'ADMIN'::public.user_role, 'STOCK'::public.user_role]))));

CREATE POLICY product_media_insert ON public.product_media FOR INSERT TO authenticated WITH CHECK (((organization_id = public.current_org_id()) AND (created_by = auth.uid()) AND (public."current_role"() = ANY (ARRAY['OWNER'::public.user_role, 'ADMIN'::public.user_role, 'STOCK'::public.user_role])) AND (EXISTS ( SELECT 1
   FROM public.items i
  WHERE ((i.id = product_media.item_id) AND (i.organization_id = public.current_org_id()))))));

CREATE POLICY product_media_select_public ON public.product_media FOR SELECT TO authenticated, anon USING ((EXISTS ( SELECT 1
   FROM public.items i
  WHERE ((i.id = product_media.item_id) AND (i.is_active = true) AND public.is_org_public_storefront(i.organization_id)))));

CREATE POLICY product_media_select_staff ON public.product_media FOR SELECT TO authenticated USING ((organization_id = public.current_org_id()));

CREATE POLICY product_media_update ON public.product_media FOR UPDATE TO authenticated USING (((organization_id = public.current_org_id()) AND (public."current_role"() = ANY (ARRAY['OWNER'::public.user_role, 'ADMIN'::public.user_role, 'STOCK'::public.user_role])))) WITH CHECK ((organization_id = public.current_org_id()));

ALTER TABLE public.stock_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY stock_reservations_select_self ON public.stock_reservations FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.online_orders o
     JOIN public.customers c ON ((c.id = o.customer_id)))
  WHERE ((o.id = stock_reservations.online_order_id) AND (c.auth_user_id = auth.uid())))));

CREATE POLICY stock_reservations_select_staff ON public.stock_reservations FOR SELECT TO authenticated USING (((organization_id = public.current_org_id()) AND ((public."current_role"() = ANY (ARRAY['OWNER'::public.user_role, 'ADMIN'::public.user_role])) OR ((public."current_role"() = 'STOCK'::public.user_role) AND public.has_store_access(store_id)))));

ALTER TABLE public.store_shipping_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY store_shipping_config_select_staff ON public.store_shipping_config FOR SELECT TO authenticated USING (((organization_id = public.current_org_id()) AND (public."current_role"() = ANY (ARRAY['OWNER'::public.user_role, 'ADMIN'::public.user_role]))));

-- ============================================================================
-- TABLE / VIEW GRANTS
--
-- Reproduced exactly from the authoritative database's ACLs. TRIGGER/
-- TRUNCATE/REFERENCES/MAINTAIN for anon and the `service_role ALL` grant on
-- every table are standard Supabase default-privilege boilerplate applied
-- to every table regardless of Kantira-specific migrations (confirmed by
-- pg_default_acl on this database), not something this recovery invents.
-- ============================================================================

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.stock_reservations TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.stock_reservations TO authenticated;
GRANT ALL ON TABLE public.stock_reservations TO service_role;

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.available_to_sell TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.available_to_sell TO authenticated;
GRANT ALL ON TABLE public.available_to_sell TO service_role;

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.customer_addresses TO anon;
GRANT ALL ON TABLE public.customer_addresses TO authenticated;
GRANT ALL ON TABLE public.customer_addresses TO service_role;

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.online_order_lines TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.online_order_lines TO authenticated;
GRANT ALL ON TABLE public.online_order_lines TO service_role;

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.online_orders TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.online_orders TO authenticated;
GRANT ALL ON TABLE public.online_orders TO service_role;

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.payment_events TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.payment_events TO authenticated;
GRANT ALL ON TABLE public.payment_events TO service_role;

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.payment_intents TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.payment_intents TO authenticated;
GRANT ALL ON TABLE public.payment_intents TO service_role;

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.product_media TO anon;
GRANT ALL ON TABLE public.product_media TO authenticated;
GRANT ALL ON TABLE public.product_media TO service_role;

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.store_shipping_config TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.store_shipping_config TO authenticated;
GRANT ALL ON TABLE public.store_shipping_config TO service_role;

-- ============================================================================
-- STORAGE (bucket definition is static configuration, per recovery scope —
-- no business data, no uploaded objects)
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('product-images', 'product-images', false, 10485760, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY product_images_delete_staff ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'product-images'::text) AND ((storage.foldername(name))[1] = (current_org_id())::text) AND ("current_role"() = ANY (ARRAY['OWNER'::user_role, 'ADMIN'::user_role, 'STOCK'::user_role]))));

CREATE POLICY product_images_insert_staff ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'product-images'::text) AND ((storage.foldername(name))[1] = (current_org_id())::text) AND ("current_role"() = ANY (ARRAY['OWNER'::user_role, 'ADMIN'::user_role, 'STOCK'::user_role])) AND (EXISTS ( SELECT 1
    FROM items i
   WHERE ((i.id = ((storage.foldername(objects.name))[2])::uuid) AND (i.organization_id = current_org_id()))))));

CREATE POLICY product_images_select_public ON storage.objects FOR SELECT TO anon, authenticated USING (((bucket_id = 'product-images'::text) AND (EXISTS ( SELECT 1
    FROM items i
   WHERE ((i.id = ((storage.foldername(objects.name))[2])::uuid) AND (i.organization_id = ((storage.foldername(objects.name))[1])::uuid) AND (i.is_active = true) AND is_org_public_storefront(i.organization_id))))));

CREATE POLICY product_images_select_staff ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'product-images'::text) AND ((storage.foldername(name))[1] = (current_org_id())::text)));
