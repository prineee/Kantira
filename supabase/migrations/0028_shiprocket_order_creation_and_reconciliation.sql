-- KANTIRA Business OS — Phase 5A-2: production Shiprocket integration
-- foundation (order/shipment creation, external-idempotency/reconciliation
-- state, webhook event ingestion, stock-aware fulfillment candidates).
--
-- SCOPE, per the CTO's explicit lock (mirrors 0026's own header): this does
-- NOT touch checkout's core RPC, inventory-at-confirmation, or accounting.
-- No function here calls record_stock_movement, post_online_order_accounting,
-- or writes to sales/sale_lines/journal_entries/journal_entry_lines. The
-- only accounting-adjacent reuse is record_shipment_webhook_event()
-- delegating to the EXISTING, unmodified record_shipment_delivered() (0026,
-- fixed 0027) for the one status it maps — never a second implementation of
-- that transition.
--
-- WHAT THIS MIGRATION DOES:
--   1. shipments: widen the status lifecycle with one new value, ATTEMPTED
--      ("a provider create request was sent; outcome not yet known" — the
--      state a network timeout or ambiguous response leaves a shipment in,
--      per Architectural Rule #5). Two new informational/audit columns:
--      attempt_count, last_attempted_at. One new purely-descriptive column,
--      last_tracking_status, for post-creation courier tracking text (e.g.
--      "IN_TRANSIT") — deliberately NOT part of the status CHECK/lifecycle,
--      per the CTO's "do not invent a large state machine" instruction.
--   2. mark_shipment_attempted() — commits "an attempt is in flight" BEFORE
--      any HTTP call is made by the caller (Architectural Rule #4: the DB
--      transaction that records this must not, and does not, span the
--      external call itself — see app/orders/actions.ts's createShipment).
--   3. resolve_shipment_attempt_as_retryable() — the human-gated escape
--      hatch from ATTEMPTED back to PENDING, OWNER/ADMIN only, intended to
--      be exposed by the UI only after an explicit reconciliation lookup
--      (see lib/shiprocket/order.ts's getOrderByChannelId) came back
--      "not found" — the DB cannot verify that sequencing itself, exactly
--      like it cannot verify any other UI-level workflow ordering elsewhere
--      in this schema; the guard it CAN and does enforce is the state
--      transition itself (ATTEMPTED -> PENDING only).
--   4. record_shipment_result() re-issued: the only change is its guard now
--      accepts resolving from ATTEMPTED as well as PENDING (a manual
--      UAT/debugging entry can still go PENDING -> resolved directly,
--      unchanged; the real provider path now goes PENDING -> ATTEMPTED ->
--      resolved). Every other line is byte-for-byte identical to 0026.
--   5. record_shipment_webhook_event() — service_role-only. Idempotent via
--      shipment_events' existing unique(provider, provider_event_id); a
--      duplicate delivery is a safe no-op (no second insert, no second
--      status transition). Looks up the target shipment by provider
--      identifiers only (never trusts an organization id from the payload)
--      so a webhook can never cross an organization boundary — there is no
--      code path that writes using anything but the matched shipment's own
--      organization_id.
--   6. get_checkout_fulfillment_candidates() signature changed from zero
--      parameters (0020) to one optional parameter, p_items jsonb default
--      null. This REQUIRES an explicit DROP before CREATE (below) — a
--      bare `create or replace` does NOT replace a same-named function
--      across a different arity in Postgres; leaving both the old 0-arg
--      and a new 1-arg-with-default overload registered simultaneously
--      would create a genuine PostgREST overload-resolution ambiguity for
--      any zero-argument call, which is exactly the call every existing
--      caller makes today — an explicit drop avoids introducing that
--      regression. Called with p_items omitted/null, behavior is
--      byte-identical to 0020's version (every existing caller). Called
--      with a jsonb array of {item_id, quantity}, candidates are
--      additionally filtered to stores whose available_to_sell covers
--      every supplied line, closing the "Store has required stock" gap in
--      lib/shipping/fulfillment.ts's shipping-aware selection mode.

-- ============================================================
-- shipments: widen lifecycle + reconciliation/tracking columns
-- ============================================================

alter table public.shipments drop constraint shipments_status_check;
alter table public.shipments add constraint shipments_status_check
  check (status in ('PENDING', 'ATTEMPTED', 'CREATED', 'FAILED', 'DELIVERED'));

alter table public.shipments add column attempt_count int not null default 0;
alter table public.shipments add column last_attempted_at timestamptz;
alter table public.shipments add column last_tracking_status text;

-- ============================================================
-- RPC: mark_shipment_attempted — commits "an attempt is in flight" before
-- any external call. Same authorization shape as create_shipment_pending
-- (0026): OWNER/ADMIN, or STOCK with access to the shipment's store.
-- ============================================================

create or replace function public.mark_shipment_attempted(p_shipment_id uuid)
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
    raise exception 'Not permitted to attempt this shipment';
  end if;

  -- Deliberately excludes ATTEMPTED: a shipment already mid-attempt (or
  -- left in an uncertain state by a prior timeout) must go through
  -- resolve_shipment_attempt_as_retryable() first — never a second create
  -- attempt fired blindly on top of an unresolved one (Architectural Rule
  -- #5: "A timeout must also NOT blindly retry a create request").
  if v_shipment.status not in ('PENDING', 'FAILED') then
    raise exception 'Only a PENDING or FAILED shipment can be attempted (current status: %)', v_shipment.status;
  end if;

  update public.shipments
    set status = 'ATTEMPTED',
        attempt_count = attempt_count + 1,
        last_attempted_at = now(),
        last_error = null,
        updated_at = now()
    where id = p_shipment_id;
end;
$$;

revoke all on function public.mark_shipment_attempted(uuid) from public;
grant execute on function public.mark_shipment_attempted(uuid) to authenticated;

-- ============================================================
-- RPC: resolve_shipment_attempt_as_retryable — the reconciliation escape
-- hatch. OWNER/ADMIN only (deliberately narrower than mark_shipment_attempted:
-- this overrides an uncertain external state, not a routine action).
-- ============================================================

create or replace function public.resolve_shipment_attempt_as_retryable(p_shipment_id uuid)
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

  if v_role <> all (array['OWNER'::public.user_role, 'ADMIN'::public.user_role]) then
    raise exception 'Only OWNER/ADMIN may resolve an uncertain shipment attempt';
  end if;

  if v_shipment.status <> 'ATTEMPTED' then
    raise exception 'Only an ATTEMPTED shipment can be resolved this way (current status: %)', v_shipment.status;
  end if;

  update public.shipments
    set status = 'PENDING', updated_at = now()
    where id = p_shipment_id;
end;
$$;

revoke all on function public.resolve_shipment_attempt_as_retryable(uuid) from public;
grant execute on function public.resolve_shipment_attempt_as_retryable(uuid) to authenticated;

-- ============================================================
-- record_shipment_result — re-issued (0026's function, unmodified file).
-- Only change: the resolvable-from set is now ('PENDING','ATTEMPTED')
-- instead of just ('PENDING'). Every other line is unchanged.
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

  if v_shipment.status not in ('PENDING', 'ATTEMPTED') then
    raise exception 'Only a PENDING or ATTEMPTED shipment attempt can be resolved (current status: %)', v_shipment.status;
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
-- RPC: record_shipment_webhook_event — service_role only. The webhook
-- route (app/api/webhooks/shiprocket/route.ts) authenticates the request
-- via a shared-secret header BEFORE this is ever called; by the time this
-- runs, the caller is trusted the same way confirm_razorpay_payment_and_
-- finalize()'s service_role branch already is (0024). Idempotent via
-- shipment_events' unique(provider, provider_event_id) — a duplicate
-- delivery inserts nothing and triggers no second status transition.
-- Organization scope is derived exclusively from the matched shipment row
-- — nothing here ever trusts an organization/customer id from the webhook
-- payload itself.
-- ============================================================

create or replace function public.record_shipment_webhook_event(
  p_provider text,
  p_provider_event_id text,
  p_event_type text,
  p_raw_payload jsonb,
  p_provider_shipment_id text default null,
  p_awb text default null,
  p_tracking_status text default null
)
returns table (matched boolean, is_new_event boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_service_role boolean := coalesce(auth.role(), 'anon') = 'service_role';
  v_shipment record;
  v_inserted boolean := false;
begin
  if not v_is_service_role then
    raise exception 'Not permitted' using errcode = '42501';
  end if;

  select * into v_shipment from public.shipments
  where (p_provider_shipment_id is not null and provider_shipment_id = p_provider_shipment_id)
     or (p_awb is not null and provider_awb = p_awb)
  order by (provider_shipment_id = p_provider_shipment_id) desc
  limit 1
  for update;

  if v_shipment.id is null then
    return query select false, false;
    return;
  end if;

  begin
    insert into public.shipment_events (
      organization_id, shipment_id, provider, provider_event_id, event_type, raw_payload
    ) values (
      v_shipment.organization_id, v_shipment.id, p_provider, p_provider_event_id, p_event_type, p_raw_payload
    );
    v_inserted := true;
  exception when unique_violation then
    v_inserted := false;
  end;

  if v_inserted and p_tracking_status is not null then
    update public.shipments
      set last_tracking_status = p_tracking_status, updated_at = now()
      where id = v_shipment.id;

    if p_tracking_status ilike '%delivered%' and v_shipment.status = 'CREATED' then
      perform public.record_shipment_delivered(v_shipment.provider, v_shipment.provider_shipment_id);
    end if;
  end if;

  return query select true, v_inserted;
end;
$$;

revoke all on function public.record_shipment_webhook_event(text, text, text, jsonb, text, text, text) from public;
grant execute on function public.record_shipment_webhook_event(text, text, text, jsonb, text, text, text) to service_role;

-- ============================================================
-- get_checkout_fulfillment_candidates — re-issued (0020) with one
-- additive, optional parameter. p_items omitted/null: behavior is
-- byte-identical to 0020's version (every existing caller). p_items
-- provided (a jsonb array of {item_id, quantity}): candidates are
-- additionally filtered to stores whose available_to_sell covers every
-- supplied line, closing the "Store has required stock" gap in
-- lib/shipping/fulfillment.ts's shipping-aware selection mode.
-- ============================================================

drop function if exists public.get_checkout_fulfillment_candidates();

create or replace function public.get_checkout_fulfillment_candidates(p_items jsonb default null)
RETURNS TABLE (
  store_id uuid,
  store_code text,
  created_at timestamptz,
  provider_location_id text,
  provider_location_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    s.id AS store_id,
    s.store_code,
    s.created_at,
    ssc.provider_location_id,
    ssc.provider_location_name
  FROM public.stores s
  LEFT JOIN public.store_shipping_config ssc
    ON ssc.store_id = s.id
   AND ssc.organization_id = s.organization_id
   AND ssc.provider = 'SHIPROCKET'
   AND ssc.active = true
  WHERE s.is_active = true
    AND s.organization_id = (
      SELECT c.organization_id
      FROM public.customers c
      WHERE c.auth_user_id = auth.uid()
    )
    AND (
      p_items IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_items) AS line(item_id uuid, quantity numeric)
        LEFT JOIN public.available_to_sell ats
          ON ats.store_id = s.id AND ats.item_id = line.item_id
        WHERE coalesce(ats.available_quantity, 0) < line.quantity
      )
    );
$$;

REVOKE ALL ON FUNCTION public.get_checkout_fulfillment_candidates(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_checkout_fulfillment_candidates(jsonb) TO authenticated;
