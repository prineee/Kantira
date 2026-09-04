-- KANTIRA Business OS — customer-safe checkout fulfillment/pickup accessor
--
-- CONTEXT: the Phase 5B-8D checkout shipping-quote path (app/checkout/actions.ts,
-- lib/shipping/fulfillment.ts) needs to resolve which store will fulfill an
-- online order and that store's active Shiprocket pickup mapping. Both
-- `stores` (stores_select) and `store_shipping_config`
-- (store_shipping_config_select_staff) are staff-only under RLS — gated on
-- current_org_id()/current_role(), which are always null/false for a
-- customer session (customers have no `profiles` row). A customer-scoped
-- Supabase client therefore cannot read either table at all, by design.
--
-- This migration does not weaken that RLS boundary, grant customers general
-- SELECT on either table, or introduce service_role. It adds one narrowly
-- scoped, read-only SECURITY DEFINER function that returns only the three
-- fields the checkout quote path actually needs (store id, store code +
-- created_at for the existing deterministic ordering already implemented in
-- lib/shipping/fulfillment.ts, and the mapping's provider_location_id/name)
-- scoped to the caller's own organization via the same auth_user_id ->
-- customers linkage every other customer-self policy already uses (see
-- customers_select_self, 0009). It never returns store address/phone/city,
-- the store_shipping_config row's id/timestamps, or anything Shiprocket-
-- credential-related — those never leave this function's SQL body.
--
-- The store-priority ordering itself (prefer a store with an active
-- mapping, then earliest created_at, then store_code) is NOT reimplemented
-- here — this function only returns rows; lib/shipping/fulfillment.ts's
-- existing sort/selection logic (unchanged) decides among them, exactly as
-- it already did when reading the tables directly. This keeps the ordering
-- rule in exactly one place.

CREATE OR REPLACE FUNCTION public.get_checkout_fulfillment_candidates()
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
    );
$$;

-- Postgres grants EXECUTE to PUBLIC by default on CREATE FUNCTION — revoke
-- that immediately (same pattern used throughout this schema, e.g. 0005's
-- record_stock_movement fix) so only an authenticated Supabase Auth session
-- can call it at all; a fully anonymous request gets a permission-denied
-- error before the function body ever runs. Not granted to anon: an online
-- customer must already be authenticated (a linked `customers` row) for
-- this to return anything useful, matching every other customer-self
-- policy in this schema (customers_select_self, customer_addresses_select_self).
REVOKE ALL ON FUNCTION public.get_checkout_fulfillment_candidates() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_checkout_fulfillment_candidates() TO authenticated;
