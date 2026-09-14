-- KANTIRA Business OS — Phase 5A-1: fulfillment operational continuation +
-- shipment foundation.
--
-- SCOPE, per the CTO's explicit lock: this does NOT touch checkout,
-- inventory-at-confirmation, or accounting. Every existing accounting/
-- inventory primitive (post_online_order_accounting, record_online_sale_
-- stock_out, reserve_all_lines_at_store, assert_stock_available, post_sale)
-- is reused unmodified. No second inventory OUT is ever performed after
-- order confirmation — nothing in this migration calls record_stock_movement
-- or record_online_sale_stock_out at all.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO (reported as blockers, not
-- guessed around):
--   1. No actual Shiprocket order-creation API call is implemented
--      (lib/shiprocket/ gets no new file here). This repository has zero
--      verified evidence of Shiprocket's order-creation request/response
--      contract or its duplicate-handling behavior (confirmed by re-reading
--      docs/architecture/PHASE_5_ARCHITECTURE_DECISIONS.md section 7, and
--      by this session's own file inventory of lib/shiprocket/, which has
--      no order/shipment/tracking file at all). Calling it without a
--      verified contract would mean guessing field names and idempotency
--      behavior — instructed against.
--   2. No Shiprocket webhook route is added. Its signature/authentication
--      mechanism has never been verified in this repository either.
--      Inventing one is explicitly disallowed.
-- What IS built: the complete DB-side foundation a verified integration
-- would sit on top of — schema, RLS, and RPCs that RECORD the result of an
-- external call (success or failure) rather than making the call
-- themselves, so the boundary between "KANTIRA's own atomic DB work" and
-- "an external, non-transactional side effect" is structural, not a
-- convention someone has to remember.

-- ============================================================
-- TABLE: shipments — one row per online_order's shipment attempt (this
-- phase guarantees exactly one shipment per order; the unique index below
-- enforces it at the DB level, per the CTO's instruction). Carrier state
-- lives here, never on online_orders — online_orders.status only ever
-- reaches 'SHIPPED'/'DELIVERED' as a same-transaction side effect of a
-- verified shipment-state change (see record_shipment_result/
-- record_shipment_delivered below), never independently.
-- ============================================================

create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  online_order_id uuid not null references public.online_orders (id) on delete restrict,
  fulfillment_store_id uuid not null references public.stores (id) on delete restrict,
  provider text not null default 'SHIPROCKET' check (provider = 'SHIPROCKET'),
  provider_order_id text,
  provider_shipment_id text,
  provider_awb text,
  courier_id text,
  courier_name text,
  -- not created (no row) / creating-pending / created / failed-retryable /
  -- delivered — exactly the CTO's minimum lifecycle, no extra states.
  status text not null default 'PENDING' check (status in ('PENDING', 'CREATED', 'FAILED', 'DELIVERED')),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  shipped_at timestamptz,
  delivered_at timestamptz,
  unique (online_order_id)
);

create index shipments_organization_id_status_idx on public.shipments (organization_id, status);
create index shipments_fulfillment_store_id_idx on public.shipments (fulfillment_store_id);

create trigger shipments_set_updated_at
  before update on public.shipments
  for each row execute function public.set_updated_at();

create trigger shipments_audit
  after insert or update on public.shipments
  for each row execute function public.record_audit_log();

alter table public.shipments enable row level security;

create policy shipments_select_self on public.shipments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.online_orders o
      join public.customers c on c.id = o.customer_id
      where o.id = shipments.online_order_id and c.auth_user_id = auth.uid()
    )
  );

-- Mirrors online_orders_select_staff (0015) exactly: OWNER/ADMIN see every
-- shipment in their org; STOCK sees only shipments at a store they have
-- access to.
create policy shipments_select_staff on public.shipments
  for select
  to authenticated
  using (
    organization_id = public.current_org_id()
    and (
      public.current_role() = any (array['OWNER'::public.user_role, 'ADMIN'::public.user_role])
      or (public.current_role() = 'STOCK'::public.user_role and public.has_store_access(fulfillment_store_id))
    )
  );

grant select on public.shipments to authenticated;
grant all on public.shipments to service_role;

-- ============================================================
-- TABLE: shipment_events — webhook/provider event log, modeled directly on
-- payment_events (0015): the same (provider, provider_event_id) uniqueness
-- is the DB-level duplicate-delivery guard a future webhook handler relies
-- on, exactly like the Razorpay webhook already does. Staff-visible only,
-- same as payment_events (no customer-facing raw event data).
-- ============================================================

create table public.shipment_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  shipment_id uuid not null references public.shipments (id) on delete restrict,
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create index shipment_events_organization_id_idx on public.shipment_events (organization_id);
create index shipment_events_shipment_id_idx on public.shipment_events (shipment_id);

alter table public.shipment_events enable row level security;

create policy shipment_events_select_staff on public.shipment_events
  for select
  to authenticated
  using (
    organization_id = public.current_org_id()
    and public.current_role() = any (array['OWNER'::public.user_role, 'ADMIN'::public.user_role])
  );

grant select on public.shipment_events to authenticated;
grant all on public.shipment_events to service_role;

-- ============================================================
-- VIEW: stalled_fulfillment_orders — operational visibility for the
-- "no eligible store" case (docs/architecture/PHASE_5_ARCHITECTURE_
-- DECISIONS.md section 4.2, item 11), WITHOUT overloading online_orders.
-- status or inventing a new column. A plain view (not SECURITY DEFINER):
-- Postgres evaluates the underlying online_orders RLS policies against the
-- querying user exactly as if they'd queried online_orders directly, so
-- this adds zero new security surface — a customer sees only their own
-- stalled order (if any), staff see it per online_orders_select_staff
-- (which means only OWNER/ADMIN can see a stalled order today, since STOCK's
-- own policy branch requires fulfillment_store_id IS NOT NULL — consistent
-- with assign_online_order_store()'s own authorization, where only
-- OWNER/ADMIN may assign a store to an order that doesn't have one yet).
-- ============================================================

create view public.stalled_fulfillment_orders as
select
  o.id as order_id,
  o.organization_id,
  o.customer_id,
  o.order_number,
  o.status,
  o.payment_status,
  o.grand_total,
  o.placed_at
from public.online_orders o
where o.status = 'CONFIRMED' and o.fulfillment_store_id is null;

grant select on public.stalled_fulfillment_orders to authenticated;

-- ============================================================
-- RPC: complete_stalled_order_fulfillment — the operational continuation
-- for a stalled order. Does not reimplement any inventory/accounting rule:
-- delegates authorization AND all state changes entirely to the three
-- already-existing, unmodified functions below, in the same transaction,
-- so a failure at any step (e.g. the chosen store also can't cover the
-- order) rolls back the store assignment too — the order lands back in
-- stalled_fulfillment_orders for another attempt, never half-applied.
-- ============================================================

create or replace function public.complete_stalled_order_fulfillment(p_order_id uuid, p_store_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_payment_method text;
begin
  select id, status, fulfillment_store_id into v_order
  from public.online_orders where id = p_order_id;

  if v_order.id is null then
    raise exception 'Order not found';
  end if;

  if v_order.status <> 'CONFIRMED' then
    raise exception 'Only a CONFIRMED order can be resolved this way (current status: %)', v_order.status;
  end if;

  if v_order.fulfillment_store_id is not null then
    raise exception 'This order already has a fulfillment store assigned';
  end if;

  -- assign_online_order_store() (0015, unmodified) performs its own
  -- OWNER/ADMIN/STOCK-with-access authorization and org/store validation —
  -- trusted completely, not re-implemented here. Its own exception (wrong
  -- role, wrong org, inactive store) propagates and aborts this whole call.
  perform public.assign_online_order_store(p_order_id, p_store_id);

  if not exists (
    select 1 from public.stock_reservations
    where online_order_id = p_order_id and status = 'ACTIVE'
  ) then
    perform public.reserve_all_lines_at_store(p_order_id, p_store_id);
  end if;

  -- Recover the payment method the way finalize_checkout_session_internal()
  -- itself would have — from the checkout_sessions row that produced this
  -- order (checkout_sessions.order_id, 0024). A staff-created order that
  -- never went through checkout_sessions at all (the older, pre-4D
  -- create_online_order() path) has none — accounting posting is then
  -- skipped, exactly matching that path's existing, unchanged scope (it was
  -- never wired to online-order accounting in Phase 4D either).
  select cs.payment_method into v_payment_method
  from public.checkout_sessions cs
  where cs.order_id = p_order_id;

  if v_payment_method is not null then
    perform public.post_online_order_accounting(p_order_id, v_payment_method);
  end if;
end;
$$;

revoke all on function public.complete_stalled_order_fulfillment(uuid, uuid) from public;
grant execute on function public.complete_stalled_order_fulfillment(uuid, uuid) to authenticated;

-- ============================================================
-- RPC: create_shipment_pending — records the INTENT to create a shipment,
-- before any external call is made. One row per order (unique index
-- above); PENDING/FAILED both retry cleanly onto the same row, a CREATED
-- shipment can never be re-created. This function makes no external call —
-- it is the "before" half of the deterministic external-side-effect
-- workflow the CTO's instructions require: caller inserts/reuses this
-- PENDING row, THEN (outside any DB transaction) calls Shiprocket, THEN
-- calls record_shipment_result() with the outcome.
-- ============================================================

create or replace function public.create_shipment_pending(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_role public.user_role := public.current_role();
  v_order record;
  v_existing record;
  v_shipment_id uuid;
begin
  if v_org_id is null then
    raise exception 'Not authenticated as a Business OS employee';
  end if;

  select id, organization_id, status, fulfillment_store_id into v_order
  from public.online_orders where id = p_order_id;

  if v_order.id is null or v_order.organization_id <> v_org_id then
    raise exception 'Order not found in this organization';
  end if;

  if not (
    v_role = any (array['OWNER'::public.user_role, 'ADMIN'::public.user_role])
    or (v_role = 'STOCK'::public.user_role and public.has_store_access(v_order.fulfillment_store_id))
  ) then
    raise exception 'Not permitted to create a shipment for this order';
  end if;

  if v_order.status <> 'PACKED' then
    raise exception 'Order must be PACKED before a shipment can be created (current status: %)', v_order.status;
  end if;

  if v_order.fulfillment_store_id is null then
    raise exception 'Order has no fulfillment store assigned';
  end if;

  select * into v_existing from public.shipments where online_order_id = p_order_id for update;

  if v_existing.id is not null then
    if v_existing.status = 'CREATED' then
      raise exception 'A shipment already exists for this order';
    end if;

    update public.shipments
      set status = 'PENDING', last_error = null, updated_at = now()
      where id = v_existing.id
      returning id into v_shipment_id;

    return v_shipment_id;
  end if;

  insert into public.shipments (organization_id, online_order_id, fulfillment_store_id, status)
  values (v_org_id, p_order_id, v_order.fulfillment_store_id, 'PENDING')
  returning id into v_shipment_id;

  return v_shipment_id;
end;
$$;

revoke all on function public.create_shipment_pending(uuid) from public;
grant execute on function public.create_shipment_pending(uuid) to authenticated;

-- ============================================================
-- RPC: record_shipment_result — the "after" half. Records exactly what the
-- external call (already completed, outside this function entirely)
-- actually returned. Only a PENDING attempt can be resolved, so a stale or
-- duplicate call against an already-CREATED/FAILED shipment is rejected
-- rather than silently reprocessed. Success advances online_orders to
-- SHIPPED through advance_online_order_status() (below) — never sets
-- online_orders.status directly — so that transition keeps going through
-- its own authorization/state checks unchanged. Failure never touches
-- online_orders at all: the order stays PACKED, retryable.
-- ============================================================

create or replace function public.record_shipment_result(
  p_shipment_id uuid,
  p_success boolean,
  p_provider_order_id text default null,
  p_provider_shipment_id text default null,
  p_awb text default null,
  p_courier_id text default null,
  p_courier_name text default null,
  p_error_message text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_role public.user_role := public.current_role();
  v_shipment record;
begin
  if v_org_id is null then
    raise exception 'Not authenticated as a Business OS employee';
  end if;

  select * into v_shipment from public.shipments where id = p_shipment_id for update;

  if v_shipment.id is null or v_shipment.organization_id <> v_org_id then
    raise exception 'Shipment not found in this organization';
  end if;

  if not (
    v_role = any (array['OWNER'::public.user_role, 'ADMIN'::public.user_role])
    or (v_role = 'STOCK'::public.user_role and public.has_store_access(v_shipment.fulfillment_store_id))
  ) then
    raise exception 'Not permitted to update this shipment';
  end if;

  if v_shipment.status <> 'PENDING' then
    raise exception 'Only a PENDING shipment attempt can be resolved (current status: %)', v_shipment.status;
  end if;

  if p_success then
    update public.shipments
      set status = 'CREATED',
          provider_order_id = p_provider_order_id,
          provider_shipment_id = p_provider_shipment_id,
          provider_awb = p_awb,
          courier_id = p_courier_id,
          courier_name = p_courier_name,
          shipped_at = now(),
          last_error = null,
          updated_at = now()
      where id = p_shipment_id;

    perform public.advance_online_order_status(v_shipment.online_order_id, 'SHIPPED');
  else
    update public.shipments
      set status = 'FAILED', last_error = p_error_message, updated_at = now()
      where id = p_shipment_id;
  end if;
end;
$$;

revoke all on function public.record_shipment_result(uuid, boolean, text, text, text, text, text, text) from public;
grant execute on function public.record_shipment_result(uuid, boolean, text, text, text, text, text, text) to authenticated;

-- ============================================================
-- RPC: record_shipment_delivered — foundation for a future, verified
-- Shiprocket webhook (service_role branch, mirroring
-- confirm_razorpay_payment_and_finalize()'s exact pattern) and an explicit
-- staff override (OWNER/ADMIN only). Not wired to any route in this
-- migration — see this file's header for why the webhook itself is not yet
-- implemented. Looked up by (provider, provider_shipment_id), the only
-- provider-supplied identifier a webhook payload would carry.
-- ============================================================

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

    if v_role <> any (array['OWNER'::public.user_role, 'ADMIN'::public.user_role]) then
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

-- ============================================================
-- advance_online_order_status() — re-issued (0015's function, this
-- migration does not edit that file) with exactly one addition: a SHIPPED
-- branch, same authorization shape as the existing PACKED branch
-- (OWNER/ADMIN, or STOCK with access to the order's fulfillment store),
-- plus one extra guard: a CREATED shipment must already exist. Every other
-- branch below is byte-for-byte identical to 0015's version — no existing
-- transition's behavior or authorization changes.
-- ============================================================

create or replace function public.advance_online_order_status(p_order_id uuid, p_new_status text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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

  elsif p_new_status = 'SHIPPED' then
    if v_order.status <> 'PACKED' then
      raise exception 'Order must be PACKED to ship';
    end if;
    if not (v_is_owner_admin or (v_role = 'STOCK'::public.user_role and public.has_store_access(v_order.fulfillment_store_id))) then
      raise exception 'Not permitted to ship this order';
    end if;
    if not exists (
      select 1 from public.shipments
      where online_order_id = p_order_id and status = 'CREATED'
    ) then
      raise exception 'A confirmed shipment must exist before this order can be marked SHIPPED';
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
    begin
      perform public.auto_allocate_online_order_store(p_order_id);
    exception when others then
      null;
    end;
  end if;
end;
$function$;

revoke all on function public.advance_online_order_status(uuid, text) from public;
grant execute on function public.advance_online_order_status(uuid, text) to authenticated;
