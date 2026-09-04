import { listPickupLocations } from "@/lib/shiprocket/pickup";

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
// What this file *does* provide, correctly: the same store-priority
// ordering auto_allocate_online_order_store uses (active-Shiprocket-
// mapping first, then created_at, then store_code) minus its stock check —
// a provisional pick for quoting purposes only. Because the real allocator
// may later pick a different store (it additionally checks stock), any
// quote based on this resolution is provisional and must be revalidated
// once the real allocation happens — this file does not attempt to solve
// that staleness question, only to avoid pretending it doesn't exist.
//
// RLS NOTE (Phase 5B-8E): `stores` and `store_shipping_config` are
// staff-only under RLS (stores_select, store_shipping_config_select_staff),
// so a customer-scoped Supabase client cannot read either table directly —
// this was a real, reported gap as of Phase 5B-8D. It is closed here by
// routing both reads through a single narrowly-scoped SECURITY DEFINER
// function, get_checkout_fulfillment_candidates() (migration 0020), which
// returns only store id/code/created_at plus the store's active Shiprocket
// mapping's provider_location_id/name, scoped to the caller's own
// organization via the same auth_user_id -> customers linkage every other
// customer-self policy already uses. It never exposes store address/
// phone/city, the raw store_shipping_config row, or anything Shiprocket-
// credential-related. The ordering/selection logic below is unchanged from
// Phase 5B-8D — only where the rows come from changed.

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
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

async function fetchFulfillmentCandidates(supabase: SupabaseLike): Promise<FulfillmentCandidate[]> {
  const { data } = await supabase.rpc("get_checkout_fulfillment_candidates");
  return (data ?? []) as FulfillmentCandidate[];
}

export async function resolveFulfillmentStore(
  supabase: SupabaseLike,
  // Kept for interface stability with existing callers (app/checkout/actions.ts)
  // and as documentation of intent — organization scoping now happens
  // inside get_checkout_fulfillment_candidates() itself (via auth.uid()),
  // not via a client-supplied value, so it is not used to build the query.
  _organizationId: string,
): Promise<StoreResolution> {
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

  const sorted = stores.sort((a, b) => {
    const aMapped = a.provider_location_id ? 1 : 0;
    const bMapped = b.provider_location_id ? 1 : 0;
    if (aMapped !== bMapped) return bMapped - aMapped;
    const byCreated = a.created_at.localeCompare(b.created_at);
    if (byCreated !== 0) return byCreated;
    return a.store_code.localeCompare(b.store_code);
  });

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
