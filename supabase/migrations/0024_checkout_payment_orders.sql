-- KANTIRA Business OS — Phase 4D: checkout snapshot, Razorpay payment
-- verification, COD auto-confirmation, and atomic customer-facing order
-- finalization.
--
-- CONTEXT (minimal compatibility inspection performed before writing this):
-- `online_orders`/`online_order_lines` (0015) already model a historical
-- order snapshot correctly (server-derived price/tax via
-- create_online_order(), idempotency-key based dedup), and
-- `payment_intents`/`payment_events` (0015) already model provider
-- payment tracking with webhook-idempotency built in
-- (unique(provider, provider_event_id)). Reused as-is, not duplicated.
--
-- Two gaps this migration fills, additively:
--
-- 1. There was no PRE-ORDER checkout snapshot — `create_online_order()`
--    creates the order/lines directly from a live cart read, and
--    `payment_intents.order_id` was NOT NULL (a payment could only be
--    recorded against an order that already exists). Phase 4D's brief
--    requires the payable amount to be locked BEFORE payment for prepaid
--    (Razorpay Standard Checkout needs a Razorpay Order created against a
--    known amount before the customer ever sees the payment sheet, and
--    that amount must not silently change later). This adds
--    `checkout_sessions`/`checkout_session_lines` as that pre-order
--    snapshot, and makes `payment_intents.order_id` nullable + adds
--    `payment_intents.checkout_session_id` so a payment can be created
--    against a snapshot before an order exists, then the order is created
--    from that same snapshot once payment is authoritatively confirmed
--    (or immediately for COD, which has no payment gate at all).
--
-- 2. The only existing path from PENDING to CONFIRMED —
--    advance_online_order_status() — requires `current_org_id()` and
--    OWNER/ADMIN, i.e. staff only (verified by reading the function body).
--    Per the CTO's Decision 2, COD orders auto-confirm on customer
--    placement with no staff review step, and a Razorpay order finalizes
--    the moment payment is authoritatively verified — neither can go
--    through the staff-only function, and it is NOT modified or weakened
--    here. Instead, finalize_checkout_session_internal() (below) is a new,
--    narrowly-scoped, customer-safe path that performs the same class of
--    work (create order + lines, best-effort inventory reservation) using
--    the already-existing reserve_all_lines_at_store() helper directly
--    (which has no staff-only gate of its own), never by widening
--    advance_online_order_status()/auto_allocate_online_order_store()'s
--    existing authorization.
--
-- Accounting: intentionally NOT touched by this migration. The accepted
-- architecture (docs/architecture/PHASE_5_ARCHITECTURE_DECISIONS.md
-- section 3.2) posts a COD sale through the existing post_sale() "once
-- fulfilled" — i.e. at physical fulfillment, a later phase, operating on
-- the internal `sales` table, not at order placement. For prepaid, that
-- same document explicitly flags "post at CAPTURED webhook time or at
-- fulfillment time" as an undecided product question. Since neither this
-- phase's CTO decisions nor any existing code resolve that timing
-- question, this migration creates no accounting entries at all — exactly
-- matching what already happens for a freshly-placed order today.
--
-- Shiprocket: intentionally NOT touched. No shipment-creation code exists
-- anywhere in this repository (verified by inspection); this phase does
-- not add any.

-- ============================================================
-- TABLE: checkout_sessions — the authoritative pre-payment snapshot
-- ============================================================

create table public.checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  customer_id uuid not null references public.customers (id) on delete restrict,
  created_by uuid not null references auth.users (id),
  status text not null default 'OPEN'
    check (status in ('OPEN', 'AWAITING_PAYMENT', 'COMPLETED', 'EXPIRED', 'CANCELLED')),
  payment_method text not null check (payment_method in ('COD', 'RAZORPAY')),
  shipping_address_id uuid not null references public.customer_addresses (id) on delete restrict,
  -- Resolved server-side at snapshot-creation time via the existing
  -- customer-safe get_checkout_fulfillment_candidates()/
  -- resolveFulfillmentStore() (Phase 4C) — never a client-supplied store.
  -- Nullable: an org with no eligible store still gets a valid snapshot
  -- (shipping_total may reflect no quote); finalization treats a null
  -- store as "no reservation attempted", same truthful-non-allocation
  -- posture as auto_allocate_online_order_store().
  fulfillment_store_id uuid references public.stores (id) on delete restrict,
  -- The Shiprocket courier id the customer selected, carried only for
  -- staleness re-validation (does the fresh quote still contain it) — not
  -- itself trusted as a price.
  courier_id text,
  subtotal numeric(14, 2) not null check (subtotal >= 0),
  tax_total numeric(14, 2) not null default 0 check (tax_total >= 0),
  shipping_total numeric(14, 2) not null check (shipping_total >= 0),
  discount_total numeric(14, 2) not null default 0,
  grand_total numeric(14, 2) not null check (grand_total >= 0),
  currency text not null default 'INR' check (currency = 'INR'),
  -- Client-generated once per "proceed to payment" click — protects
  -- against a double-click creating two snapshots (and, transitively, two
  -- Razorpay orders / two COD orders) for the same intended checkout.
  idempotency_key text not null,
  order_id uuid references public.online_orders (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  unique (organization_id, customer_id, idempotency_key)
);

create index checkout_sessions_customer_id_idx on public.checkout_sessions (customer_id);
create index checkout_sessions_order_id_idx on public.checkout_sessions (order_id);

create trigger checkout_sessions_set_updated_at
  before update on public.checkout_sessions
  for each row execute function public.set_updated_at();

-- ============================================================
-- TABLE: checkout_session_lines — frozen line items for the snapshot
-- ============================================================

create table public.checkout_session_lines (
  id uuid primary key default gen_random_uuid(),
  checkout_session_id uuid not null references public.checkout_sessions (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  item_id uuid not null references public.items (id) on delete restrict,
  sku_snapshot text not null,
  name_snapshot text not null,
  quantity numeric(14, 3) not null check (quantity > 0),
  unit_price numeric(14, 2) not null check (unit_price >= 0),
  tax_amount numeric(14, 2) not null default 0 check (tax_amount >= 0),
  line_total numeric(14, 2) not null check (line_total >= 0),
  created_at timestamptz not null default now(),
  unique (checkout_session_id, item_id)
);

create index checkout_session_lines_session_id_idx on public.checkout_session_lines (checkout_session_id);

-- ============================================================
-- RLS — self-select only. Every write to these two tables happens through
-- the SECURITY DEFINER RPCs below, never through a direct table grant, so
-- no INSERT/UPDATE/DELETE policy is added for either table.
-- ============================================================

alter table public.checkout_sessions enable row level security;

create policy checkout_sessions_select_self on public.checkout_sessions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.customers c
      where c.id = checkout_sessions.customer_id and c.auth_user_id = auth.uid()
    )
  );

alter table public.checkout_session_lines enable row level security;

create policy checkout_session_lines_select_self on public.checkout_session_lines
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.checkout_sessions cs
      join public.customers c on c.id = cs.customer_id
      where cs.id = checkout_session_lines.checkout_session_id and c.auth_user_id = auth.uid()
    )
  );

grant select on public.checkout_sessions to authenticated;
grant select on public.checkout_session_lines to authenticated;
grant all on public.checkout_sessions to service_role;
grant all on public.checkout_session_lines to service_role;

-- ============================================================
-- ALTER payment_intents — allow a payment to exist before its order does
-- ============================================================

alter table public.payment_intents
  add column checkout_session_id uuid references public.checkout_sessions (id) on delete restrict;

alter table public.payment_intents
  alter column order_id drop not null;

alter table public.payment_intents
  add constraint payment_intents_order_or_checkout_check
  check (order_id is not null or checkout_session_id is not null);

create index payment_intents_checkout_session_id_idx on public.payment_intents (checkout_session_id);

-- Mirrors payment_intents_order_id_active_key's existing shape: at most one
-- CREATED (awaiting payment) intent per checkout session at a time — the
-- database-level guard against a double-click creating two concurrent
-- Razorpay orders for the same snapshot.
create unique index payment_intents_checkout_session_active_key
  on public.payment_intents (checkout_session_id)
  where (status = 'CREATED');

-- Additive: the existing payment_intents_select_self (0015) only matches
-- once order_id is set. A customer must also be able to see their own
-- payment_intent while it's still pre-order (CREATED, awaiting checkout
-- completion) — RLS policies for the same command are OR'd together, so
-- this only ever widens visibility to the same customer's own rows, never
-- to anyone else's.
create policy payment_intents_select_self_via_checkout on public.payment_intents
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.checkout_sessions cs
      join public.customers c on c.id = cs.customer_id
      where cs.id = payment_intents.checkout_session_id and c.auth_user_id = auth.uid()
    )
  );

-- ============================================================
-- RPC: create_checkout_session — the pre-payment snapshot boundary.
--
-- Re-reads the customer's cart (Phase 4B) and re-prices every line
-- server-side using the exact same formula create_online_order() (0015)
-- already uses (unit_price = items.selling_price; tax = round(unit_price *
-- qty * tax_rate/100, 2); line_total = round(unit_price*qty,2) + tax) —
-- restated here rather than extracted into a shared function, because
-- extracting it would require editing 0015's create_online_order(), which
-- is not permitted. This is the ONLY place in this migration prices are
-- computed; every later step (COD placement, Razorpay confirmation) reads
-- the already-computed snapshot instead of recomputing anything.
--
-- fulfillment_store_id/courier_id/shipping_total are accepted as
-- parameters but are NEVER trusted as client-authoritative on their own —
-- the caller (app/checkout/razorpay-actions.ts /
-- app/checkout/cod-actions.ts) always derives them server-side
-- immediately before this call, from a fresh Shiprocket quote plus the
-- existing resolveFulfillmentStore() resolution, never from a raw browser
-- value. This function's own job is authorizing/locking the *cart and
-- pricing* side of the snapshot; it accepts the shipping figure as already
-- server-derived input, the same trust boundary create_online_order()
-- already uses for its own p_shipping_address_id.
-- ============================================================

create or replace function public.create_checkout_session(
  p_shipping_address_id uuid,
  p_fulfillment_store_id uuid,
  p_courier_id text,
  p_shipping_total numeric,
  p_payment_method text,
  p_idempotency_key text
)
returns table (
  out_checkout_session_id uuid,
  out_grand_total numeric,
  out_currency text,
  out_status text
)
language plpgsql
security definer
set search_path = public
as $$
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
$$;

revoke all on function public.create_checkout_session(uuid, uuid, text, numeric, text, text) from public;
grant execute on function public.create_checkout_session(uuid, uuid, text, numeric, text, text) to authenticated;

-- ============================================================
-- INTERNAL: finalize_checkout_session_internal — the one place an
-- online_order is actually created from a snapshot. Not granted to any
-- role: only reachable from place_cod_order() and
-- confirm_razorpay_payment_and_finalize() below, both of which perform
-- their own authorization before ever reaching this point. This function
-- trusts its caller completely and must never be exposed directly.
--
-- Idempotent by construction at two layers: (1) if the session is already
-- COMPLETED, it returns the existing order with no further writes; (2) the
-- online_orders insert reuses idempotency_key = the checkout_session's own
-- id, so even a concurrent duplicate call that both pass the status check
-- above resolves to exactly one order via the existing
-- online_orders_org_customer_idempotency_key unique index (0015) — the
-- same unique_violation-recovery pattern create_online_order() already
-- uses. The `for update` row lock on checkout_sessions additionally
-- serializes truly concurrent calls for the same session so the second
-- one simply waits, then sees COMPLETED.
--
-- Inventory reservation is REQUIRED, not best-effort: a CONFIRMED order
-- must never exist with a silently-failed reservation. reserve_all_lines_at_store()
-- (0015) — the same primitive the staff-facing path uses, not a second
-- inventory engine — is called directly (it has no staff-only gate of its
-- own, unlike auto_allocate_online_order_store(), which IS staff/service_role
-- -gated and deliberately NOT called from this customer-safe path) and its
-- exception is allowed to propagate. Because this whole function runs as
-- one Postgres transaction with no savepoint around this call, a raised
-- exception here rolls back everything already done above — the
-- online_orders insert, the online_order_lines insert, and (for the
-- Razorpay caller) confirm_razorpay_payment_and_finalize()'s own
-- payment_intents CAPTURED update — atomically. So finalization either
-- fully succeeds (order + lines + reservation all committed) or fully
-- fails (nothing committed, checkout_session stays OPEN/AWAITING_PAYMENT
-- for a retry once stock is available); it can never leave a CONFIRMED
-- order behind with no matching reservation.
-- ============================================================

create or replace function public.finalize_checkout_session_internal(p_session_id uuid)
returns table (
  out_order_id uuid,
  out_order_number text,
  out_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session record;
  v_order_id uuid;
  v_order_number text;
begin
  select * into v_session from public.checkout_sessions where id = p_session_id for update;

  if v_session.id is null then
    raise exception 'Checkout session not found';
  end if;

  if v_session.status = 'COMPLETED' then
    select o.order_number into v_order_number from public.online_orders o where o.id = v_session.order_id;
    return query select v_session.order_id, v_order_number, 'CONFIRMED'::text;
    return;
  end if;

  if v_session.status not in ('OPEN', 'AWAITING_PAYMENT') then
    raise exception 'Checkout session is % and cannot be finalized', v_session.status;
  end if;

  v_order_number := 'ONL-' || to_char(now(), 'YYYYMMDD') || '-'
    || lpad(nextval('public.online_order_number_seq')::text, 6, '0');

  begin
    insert into public.online_orders (
      organization_id, customer_id, order_number, status, payment_status,
      subtotal, tax_total, shipping_total, discount_total, grand_total,
      shipping_address_id, billing_address_id, idempotency_key, created_by, channel,
      fulfillment_store_id, confirmed_at
    ) values (
      v_session.organization_id, v_session.customer_id, v_order_number, 'CONFIRMED',
      case when v_session.payment_method = 'COD' then 'PENDING' else 'PAID' end,
      v_session.subtotal, v_session.tax_total, v_session.shipping_total, 0, v_session.grand_total,
      v_session.shipping_address_id, v_session.shipping_address_id, p_session_id::text, v_session.created_by,
      'WEBSITE', v_session.fulfillment_store_id, now()
    )
    returning id into v_order_id;
  exception when unique_violation then
    select id, order_number into v_order_id, v_order_number
      from public.online_orders
      where organization_id = v_session.organization_id
        and customer_id = v_session.customer_id
        and idempotency_key = p_session_id::text;
  end;

  if not exists (select 1 from public.online_order_lines where order_id = v_order_id) then
    insert into public.online_order_lines (
      organization_id, order_id, item_id, item_name_snapshot, unit_price, quantity, tax_amount, line_total
    )
    select v_session.organization_id, v_order_id, csl.item_id, csl.name_snapshot, csl.unit_price,
           csl.quantity, csl.tax_amount, csl.line_total
    from public.checkout_session_lines csl
    where csl.checkout_session_id = p_session_id;
  end if;

  if v_session.fulfillment_store_id is not null
     and not exists (
       select 1 from public.stock_reservations
       where online_order_id = v_order_id and status = 'ACTIVE'
     )
  then
    perform public.reserve_all_lines_at_store(v_order_id, v_session.fulfillment_store_id);
  end if;

  update public.checkout_sessions
    set status = 'COMPLETED', order_id = v_order_id, updated_at = now()
    where id = p_session_id;

  return query select v_order_id, v_order_number, 'CONFIRMED'::text;
end;
$$;

revoke all on function public.finalize_checkout_session_internal(uuid) from public;

-- ============================================================
-- RPC: place_cod_order — Decision 2: COD auto-confirms on placement, no
-- staff review. Customer-owned session required; payment_method must be
-- COD (a RAZORPAY session must go through Razorpay confirmation instead).
-- ============================================================

create or replace function public.place_cod_order(p_checkout_session_id uuid)
returns table (
  out_order_id uuid,
  out_order_number text,
  out_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_customer_id uuid;
  v_session record;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select c.id into v_customer_id from public.customers c where c.auth_user_id = v_uid;
  if v_customer_id is null then
    raise exception 'No customer identity found for this session' using errcode = '42501';
  end if;

  select * into v_session from public.checkout_sessions where id = p_checkout_session_id;

  if v_session.id is null or v_session.customer_id <> v_customer_id then
    raise exception 'Checkout session not found' using errcode = '42501';
  end if;

  if v_session.payment_method <> 'COD' then
    raise exception 'This checkout session is not a COD order';
  end if;

  return query select * from public.finalize_checkout_session_internal(p_checkout_session_id);
end;
$$;

revoke all on function public.place_cod_order(uuid) from public;
grant execute on function public.place_cod_order(uuid) to authenticated;

-- ============================================================
-- RPC: create_razorpay_payment_intent — records a Razorpay Order (already
-- created via the Razorpay API in app/checkout/razorpay-actions.ts, which
-- holds RAZORPAY_KEY_SECRET — never available inside Postgres) against a
-- checkout session, enforcing that its amount/currency match the
-- snapshot's own locked total.
-- ============================================================

create or replace function public.create_razorpay_payment_intent(
  p_checkout_session_id uuid,
  p_provider_order_id text,
  p_amount numeric,
  p_currency text
)
returns table (
  out_payment_intent_id uuid,
  out_provider_order_id text,
  out_amount numeric,
  out_currency text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_customer_id uuid;
  v_session record;
  v_intent_id uuid;
  v_existing record;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select c.id into v_customer_id from public.customers c where c.auth_user_id = v_uid;
  if v_customer_id is null then
    raise exception 'No customer identity found for this session' using errcode = '42501';
  end if;

  select * into v_session
    from public.checkout_sessions
    where id = p_checkout_session_id and customer_id = v_customer_id;

  if v_session.id is null then
    raise exception 'Checkout session not found' using errcode = '42501';
  end if;

  if v_session.payment_method <> 'RAZORPAY' then
    raise exception 'This checkout session is not a prepaid order';
  end if;

  if v_session.status not in ('OPEN', 'AWAITING_PAYMENT') then
    raise exception 'This checkout session cannot accept a new payment';
  end if;

  if p_amount <> v_session.grand_total or p_currency <> v_session.currency then
    raise exception 'Payment amount/currency does not match this checkout' using errcode = '22023';
  end if;

  begin
    insert into public.payment_intents (
      organization_id, order_id, checkout_session_id, provider, provider_intent_id, amount, currency, status
    ) values (
      v_session.organization_id, null, v_session.id, 'RAZORPAY', p_provider_order_id, p_amount, p_currency, 'CREATED'
    )
    returning id into v_intent_id;
  exception when unique_violation then
    -- A concurrent request already registered a CREATED intent for this
    -- session (double-click) — use THAT one, never the Razorpay order this
    -- call itself just created (which is simply left unpaid/orphaned on
    -- Razorpay's side; harmless, since nothing here will ever reference it).
    select id, provider_intent_id, amount, currency into v_existing
      from public.payment_intents
      where checkout_session_id = v_session.id and status = 'CREATED';

    if v_existing.id is null then
      raise;
    end if;

    return query select v_existing.id, v_existing.provider_intent_id, v_existing.amount, v_existing.currency;
    return;
  end;

  update public.checkout_sessions
    set status = 'AWAITING_PAYMENT', updated_at = now()
    where id = v_session.id and status = 'OPEN';

  return query select v_intent_id, p_provider_order_id, p_amount, p_currency;
end;
$$;

revoke all on function public.create_razorpay_payment_intent(uuid, text, numeric, text) from public;
grant execute on function public.create_razorpay_payment_intent(uuid, text, numeric, text) to authenticated;

-- ============================================================
-- RPC: confirm_razorpay_payment_and_finalize — the one place a Razorpay
-- payment becomes an order. Callable two ways:
--
--  (a) authenticated (the customer's own browser, immediately after
--      Razorpay Checkout's success callback, once
--      app/checkout/razorpay-actions.ts has already verified the HMAC
--      signature AND fetched the authoritative payment status/amount/
--      currency/order-id directly from Razorpay's API — this function is
--      not the signature check, it's the DB-side re-validation + atomic
--      finalization that happens only after that succeeds);
--
--  (b) service_role (the webhook route, app/api/webhooks/razorpay/route.ts,
--      after it has independently verified X-Razorpay-Signature against
--      RAZORPAY_WEBHOOK_SECRET and fetched the same authoritative payment
--      state) — this is the recovery path if the browser never returns
--      (closed tab, crash, network drop after Razorpay itself already
--      captured the payment).
--
-- Both callers must independently prove the payment is genuine before
-- calling this; this function's own job is: does this payment actually
-- belong to this checkout, for this amount/currency, and has it already
-- been processed (idempotent short-circuit either way).
-- ============================================================

create or replace function public.confirm_razorpay_payment_and_finalize(
  p_provider_order_id text,
  p_provider_payment_id text,
  p_amount numeric,
  p_currency text
)
returns table (
  out_order_id uuid,
  out_order_number text,
  out_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_service_role boolean := coalesce(auth.role(), 'anon') = 'service_role';
  v_uid uuid := auth.uid();
  v_customer_id uuid;
  v_intent record;
  v_session record;
begin
  select * into v_intent
    from public.payment_intents
    where provider = 'RAZORPAY' and provider_intent_id = p_provider_order_id;

  if v_intent.id is null then
    raise exception 'Unknown payment order' using errcode = '42501';
  end if;

  select * into v_session from public.checkout_sessions where id = v_intent.checkout_session_id for update;

  if v_session.id is null then
    raise exception 'Checkout session not found for this payment' using errcode = '42501';
  end if;

  if not v_is_service_role then
    if v_uid is null then
      raise exception 'Not authenticated' using errcode = '42501';
    end if;

    select c.id into v_customer_id from public.customers c where c.auth_user_id = v_uid;

    if v_customer_id is null or v_session.customer_id <> v_customer_id then
      -- Deliberately the same "not found" message a real ownership
      -- mismatch would get — never confirm to the caller that a
      -- differently-owned checkout/payment exists at all.
      raise exception 'Checkout session not found' using errcode = '42501';
    end if;
  end if;

  if v_intent.amount <> p_amount or v_intent.currency <> p_currency then
    raise exception 'Payment amount/currency does not match this checkout' using errcode = '22023';
  end if;

  if v_intent.status = 'CAPTURED' then
    return query select * from public.finalize_checkout_session_internal(v_session.id);
    return;
  end if;

  if v_intent.status not in ('CREATED', 'AUTHORIZED') then
    raise exception 'This payment cannot be confirmed (status: %)', v_intent.status;
  end if;

  update public.payment_intents
    set status = 'CAPTURED', provider_payment_id = p_provider_payment_id, updated_at = now()
    where id = v_intent.id and status in ('CREATED', 'AUTHORIZED');

  return query select * from public.finalize_checkout_session_internal(v_session.id);
end;
$$;

revoke all on function public.confirm_razorpay_payment_and_finalize(text, text, numeric, text) from public;
grant execute on function public.confirm_razorpay_payment_and_finalize(text, text, numeric, text)
  to authenticated, service_role;

-- ============================================================
-- RPC: mark_razorpay_payment_failed — webhook-only (payment.failed). Never
-- moves a CAPTURED intent backwards (terminal states are not silently
-- changed into contradictory ones) — only CREATED/AUTHORIZED can become
-- FAILED.
-- ============================================================

create or replace function public.mark_razorpay_payment_failed(p_provider_order_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.payment_intents
    set status = 'FAILED', updated_at = now()
    where provider = 'RAZORPAY'
      and provider_intent_id = p_provider_order_id
      and status in ('CREATED', 'AUTHORIZED');
end;
$$;

revoke all on function public.mark_razorpay_payment_failed(text) from public;
grant execute on function public.mark_razorpay_payment_failed(text) to service_role;
