import { listPickupLocations } from "@/lib/shiprocket/pickup";
import { getShippingQuote } from "@/lib/shiprocket/serviceability";

// Server-only. Resolves "which store fulfills this order" and "that
// store's active Shiprocket pickup location" for the pre-order checkout
// quote — read-only throughout, no reservation, no allocation side effect.
//
// IMPORTANT ARCHITECTURE NOTE (see PHASE_5B-8D report): the real,
// stock-aware allocator — auto_allocate_online_order_store() — only runs
// once an online order already exists and is transitioning to CONFIRMED
// (migration 0015). It is not reused here, and not reimplemented here,
// because doing so would mean duplicating its stock-sufficiency check
// against tables that are staff-only under RLS for a customer session.
//
// RLS NOTE (Phase 5B-8E): `stores` and `store_shipping_config` are
// staff-only under RLS (stores_select, store_shipping_config_select_staff),
// so a customer-scoped Supabase client cannot read either table directly.
// This is closed by routing both reads through a single narrowly-scoped
// SECURITY DEFINER function, get_checkout_fulfillment_candidates()
// (migration 0020, extended additively in 0028 with an optional stock
// filter), scoped to the caller's own organization via the same
// auth_user_id -> customers linkage every other customer-self policy
// already uses. It never exposes store address/phone/city, the raw
// store_shipping_config row, or anything Shiprocket-credential-related.
//
// PHASE 5A-2: resolveFulfillmentStore() gained an OPTIONAL third
// parameter. Called with only (supabase, organizationId) — its original
// signature — behavior is byte-identical to before: soft-priority pick
// (mapped-first, then created_at, then store_code), no stock check, no
// serviceability check. This preserves every existing test/call site
// unchanged. Passed a `ShippingAwareSelectionInput`, it instead: (1) asks
// get_checkout_fulfillment_candidates() to pre-filter to stores that can
// cover every cart line's quantity (via available_to_sell), then (2)
// walks the same priority-ordered candidate list and picks the FIRST one
// whose mapped pickup location is actually serviceable to the customer's
// destination pincode (a real getShippingQuote call per candidate, in
// priority order, stopping at the first match) — this is what makes
// selection genuinely shipping-aware rather than a single soft guess. A
// candidate with no Shiprocket mapping at all is skipped outright in this
// mode (it cannot be serviceability-checked, so it is not safe to
// auto-select for a real shipment) — this is intentionally stricter than
// the default/legacy branch, per the approved Phase 5A-2 algorithm. If no
// candidate is both stocked and serviceable, `{ ok: false }` is returned
// exactly as the "no active stores" case always has been — the caller
// (checkout) already treats that as "cannot fulfill," and an order that
// still reaches CONFIRMED with no store lands in the existing
// stalled-order/Needs-Attention flow, unchanged.

export type StoreResolution = { ok: true; storeId: string } | { ok: false; reason: string };

type FulfillmentCandidate = {
  store_id: string;
  store_code: string;
  created_at: string;
  provider_location_id: string | null;
  provider_location_name: string | null;
};

type SupabaseLike = {
  rpc: (
    fn: "get_checkout_fulfillment_candidates",
    args?: { p_items?: { item_id: string; quantity: number }[] },
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

async function fetchFulfillmentCandidates(
  supabase: SupabaseLike,
  items?: { item_id: string; quantity: number }[],
): Promise<FulfillmentCandidate[]> {
  const { data } = await supabase.rpc(
    "get_checkout_fulfillment_candidates",
    items ? { p_items: items } : undefined,
  );
  return (data ?? []) as FulfillmentCandidate[];
}

function sortByPriority(stores: FulfillmentCandidate[]): FulfillmentCandidate[] {
  return [...stores].sort((a, b) => {
    const aMapped = a.provider_location_id ? 1 : 0;
    const bMapped = b.provider_location_id ? 1 : 0;
    if (aMapped !== bMapped) return bMapped - aMapped;
    const byCreated = a.created_at.localeCompare(b.created_at);
    if (byCreated !== 0) return byCreated;
    return a.store_code.localeCompare(b.store_code);
  });
}

export type ShippingAwareSelectionInput = {
  deliveryPostcode: string;
  weightKg: number;
  cod: boolean;
  itemLines: { itemId: string; quantity: number }[];
};

async function resolveFulfillmentStoreShippingAware(
  supabase: SupabaseLike,
  shipping: ShippingAwareSelectionInput,
): Promise<StoreResolution> {
  const candidates = await fetchFulfillmentCandidates(
    supabase,
    shipping.itemLines.map((l) => ({ item_id: l.itemId, quantity: l.quantity })),
  );

  const byStore = new Map<string, FulfillmentCandidate>();
  for (const c of candidates) {
    if (!byStore.has(c.store_id)) byStore.set(c.store_id, c);
  }
  const sorted = sortByPriority([...byStore.values()]);

  if (sorted.length === 0) {
    return {
      ok: false,
      reason: "No fulfillment store currently has stock for this order.",
    };
  }

  // Fetched once and reused across candidates rather than once per
  // candidate — this is a read-only account-level list, not per-store.
  let pickupLocations: Awaited<ReturnType<typeof listPickupLocations>> | null = null;

  for (const candidate of sorted) {
    if (!candidate.provider_location_id) continue; // unmapped: not safe to auto-select

    if (!pickupLocations) {
      pickupLocations = await listPickupLocations();
    }
    const location = pickupLocations.find(
      (loc) => String(loc.id) === candidate.provider_location_id,
    );
    if (!location) continue; // mapping points at a location Shiprocket no longer returns

    const quote = await getShippingQuote({
      pickupPostcode: location.pinCode,
      deliveryPostcode: shipping.deliveryPostcode,
      weightKg: shipping.weightKg,
      cod: shipping.cod,
    });

    if (quote.serviceable) {
      return { ok: true, storeId: candidate.store_id };
    }
  }

  return {
    ok: false,
    reason: "No fulfillment store can currently ship to this address.",
  };
}

export async function resolveFulfillmentStore(
  supabase: SupabaseLike,
  // Kept for interface stability with existing callers and as
  // documentation of intent — organization scoping happens inside
  // get_checkout_fulfillment_candidates() itself (via auth.uid()), not via
  // a client-supplied value, so it is not used to build any query.
  _organizationId: string,
  shippingAware?: ShippingAwareSelectionInput,
): Promise<StoreResolution> {
  if (shippingAware) {
    return resolveFulfillmentStoreShippingAware(supabase, shippingAware);
  }

  const candidates = await fetchFulfillmentCandidates(supabase);

  const byStore = new Map<string, FulfillmentCandidate>();
  for (const c of candidates) {
    if (!byStore.has(c.store_id)) byStore.set(c.store_id, c);
  }
  const stores = [...byStore.values()];

  if (stores.length === 0) {
    return {
      ok: false,
      reason: "No active fulfillment store is configured for this organization.",
    };
  }

  const sorted = sortByPriority(stores);
  return { ok: true, storeId: sorted[0]!.store_id };
}

export type PickupMappingResolution =
  | { ok: true; pickupPostcode: string }
  | { ok: false; reason: string };

export async function resolveActivePickupMapping(
  supabase: SupabaseLike,
  _organizationId: string,
  storeId: string,
): Promise<PickupMappingResolution> {
  const candidates = await fetchFulfillmentCandidates(supabase);
  const rows = candidates.filter((c) => c.store_id === storeId && c.provider_location_id);

  if (rows.length === 0) {
    return {
      ok: false,
      reason: "No active Shiprocket pickup location is mapped to this store yet.",
    };
  }

  if (rows.length > 1) {
    // store_shipping_config's own unique index on (organization_id,
    // store_id) makes this unreachable today, but never choose arbitrarily
    // if it ever weren't.
    return {
      ok: false,
      reason: "Multiple active Shiprocket pickup mappings exist for this store.",
    };
  }

  const locationId = rows[0]?.provider_location_id;
  if (!locationId) {
    return { ok: false, reason: "The store's Shiprocket pickup mapping is incomplete." };
  }

  const locations = await listPickupLocations();
  const match = locations.find((loc) => String(loc.id) === locationId);

  if (!match) {
    return {
      ok: false,
      reason: "The store's mapped Shiprocket pickup location could not be found.",
    };
  }

  return { ok: true, pickupPostcode: match.pinCode };
}
