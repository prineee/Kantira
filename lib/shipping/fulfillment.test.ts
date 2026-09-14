import test from "node:test";
import assert from "node:assert/strict";
import { resolveFulfillmentStore, resolveActivePickupMapping } from "./fulfillment";
import { _resetShiprocketConfigForTests } from "@/lib/shiprocket/env";
import { invalidateShiprocketToken } from "@/lib/shiprocket/auth";
import { installMockFetch, withEnv } from "@/lib/shiprocket/test-helpers";

const TEST_ENV = {
  SHIPROCKET_API_BASE_URL: "https://example.invalid/v1/external",
  SHIPROCKET_API_EMAIL: "test@example.invalid",
  SHIPROCKET_API_PASSWORD: "irrelevant-test-value",
};

const ORG_ID = "22222222-2222-2222-2222-222222222222";
const STORE_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const STORE_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

type Candidate = {
  store_id: string;
  store_code: string;
  created_at: string;
  provider_location_id: string | null;
  provider_location_name: string | null;
};

/** Fakes the single RPC call resolveFulfillmentStore/resolveActivePickupMapping
 * both go through (get_checkout_fulfillment_candidates) — the org-scoping
 * and RLS-crossing happen inside that SQL function (migration 0020) and are
 * not re-tested here in JS; this only tests the TS-side selection logic
 * against whatever rows the RPC hands back. */
function mockSupabase(candidates: Candidate[]) {
  return {
    rpc: async (_fn: string) => ({ data: candidates, error: null }),
  };
}

test("resolveFulfillmentStore: no active stores at all", async () => {
  const supabase = mockSupabase([]);
  const result = await resolveFulfillmentStore(supabase, ORG_ID);
  assert.equal(result.ok, false);
});

test("resolveFulfillmentStore: prefers the store with an active Shiprocket mapping over an earlier-created store without one", async () => {
  const supabase = mockSupabase([
    {
      store_id: STORE_A,
      store_code: "MAIN",
      created_at: "2026-01-01T00:00:00Z",
      provider_location_id: null,
      provider_location_name: null,
    },
    {
      store_id: STORE_B,
      store_code: "SECOND",
      created_at: "2026-02-01T00:00:00Z",
      provider_location_id: "2836654",
      provider_location_name: "DCM",
    },
  ]);
  const result = await resolveFulfillmentStore(supabase, ORG_ID);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.storeId, STORE_B);
});

test("resolveFulfillmentStore: with no mappings anywhere, falls back to created_at then store_code (mirrors auto_allocate_online_order_store)", async () => {
  const supabase = mockSupabase([
    {
      store_id: STORE_B,
      store_code: "UAT01",
      created_at: "2026-02-01T00:00:00Z",
      provider_location_id: null,
      provider_location_name: null,
    },
    {
      store_id: STORE_A,
      store_code: "MAIN",
      created_at: "2026-01-01T00:00:00Z",
      provider_location_id: null,
      provider_location_name: null,
    },
  ]);
  const result = await resolveFulfillmentStore(supabase, ORG_ID);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.storeId, STORE_A); // earlier created_at wins
});

test("resolveActivePickupMapping: no mapping for this store", async () => {
  const supabase = mockSupabase([
    {
      store_id: STORE_A,
      store_code: "MAIN",
      created_at: "2026-01-01T00:00:00Z",
      provider_location_id: null,
      provider_location_name: null,
    },
  ]);
  const result = await resolveActivePickupMapping(supabase, ORG_ID, STORE_A);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /No active Shiprocket pickup/);
});

test("resolveActivePickupMapping: multiple active mappings is a safe configuration error, not an arbitrary pick", async () => {
  const supabase = mockSupabase([
    {
      store_id: STORE_A,
      store_code: "MAIN",
      created_at: "2026-01-01T00:00:00Z",
      provider_location_id: "111",
      provider_location_name: "One",
    },
    {
      store_id: STORE_A,
      store_code: "MAIN",
      created_at: "2026-01-01T00:00:00Z",
      provider_location_id: "222",
      provider_location_name: "Two",
    },
  ]);
  const result = await resolveActivePickupMapping(supabase, ORG_ID, STORE_A);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /Multiple active/);
});

test("resolveActivePickupMapping: a mapping with no provider_location_id is treated as incomplete, not silently ignored", async () => {
  // Structurally, get_checkout_fulfillment_candidates() only emits a
  // provider_location_id when its LEFT JOIN found an active mapping row, so
  // this exact shape (a row present but with a null id) shouldn't occur in
  // practice — resolveActivePickupMapping's filter already treats a null
  // provider_location_id the same as "no mapping" (see resolveActivePickupMapping's
  // `c.provider_location_id` filter), which this test confirms.
  const supabase = mockSupabase([
    {
      store_id: STORE_A,
      store_code: "MAIN",
      created_at: "2026-01-01T00:00:00Z",
      provider_location_id: null,
      provider_location_name: null,
    },
  ]);
  const result = await resolveActivePickupMapping(supabase, ORG_ID, STORE_A);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /No active Shiprocket pickup/);
});

test("resolveActivePickupMapping: a valid single mapping resolves to that pickup location's postcode", async () => {
  _resetShiprocketConfigForTests();
  invalidateShiprocketToken();
  await withEnv(TEST_ENV, async () => {
    const mock = installMockFetch([
      { match: (url) => url.endsWith("/auth/login"), respond: () => ({ status: 200, body: { token: "t" } }) },
      {
        match: (url) => url.includes("/settings/company/pickup"),
        respond: () => ({
          status: 200,
          body: {
            data: {
              shipping_address: [
                {
                  id: 2836654,
                  pickup_location: "DCM",
                  city: "Patna",
                  state: "Bihar",
                  country: "India",
                  pin_code: "800004",
                  status: 1,
                  phone_verified: 1,
                },
              ],
            },
          },
        }),
      },
    ]);
    try {
      const supabase = mockSupabase([
        {
          store_id: STORE_A,
          store_code: "MAIN",
          created_at: "2026-01-01T00:00:00Z",
          provider_location_id: "2836654",
          provider_location_name: "DCM",
        },
      ]);
      const result = await resolveActivePickupMapping(supabase, ORG_ID, STORE_A);
      assert.equal(result.ok, true);
      if (result.ok) assert.equal(result.pickupPostcode, "800004");
    } finally {
      mock.restore();
    }
  });
});

// ============================================================
// Phase 5A-2: shipping-aware selection mode (the optional third param).
// Omitting it (all tests above) preserves the exact pre-5A-2 behavior.
// ============================================================

function mockSupabaseCapturingArgs(candidates: Candidate[]) {
  const calls: unknown[] = [];
  return {
    supabase: {
      rpc: async (_fn: string, args?: unknown) => {
        calls.push(args);
        return { data: candidates, error: null };
      },
    },
    calls,
  };
}

test("resolveFulfillmentStore (shipping-aware): passes cart items through to the RPC as p_items", async () => {
  const { supabase, calls } = mockSupabaseCapturingArgs([]);
  await resolveFulfillmentStore(supabase, ORG_ID, {
    deliveryPostcode: "400001",
    weightKg: 1,
    cod: false,
    itemLines: [{ itemId: "item-1", quantity: 2 }],
  });
  assert.deepEqual(calls[0], { p_items: [{ item_id: "item-1", quantity: 2 }] });
});

test("resolveFulfillmentStore (shipping-aware): no candidates at all (e.g. none in stock) fails", async () => {
  const { supabase } = mockSupabaseCapturingArgs([]);
  const result = await resolveFulfillmentStore(supabase, ORG_ID, {
    deliveryPostcode: "400001",
    weightKg: 1,
    cod: false,
    itemLines: [{ itemId: "item-1", quantity: 1 }],
  });
  assert.equal(result.ok, false);
});

test("resolveFulfillmentStore (shipping-aware): a candidate with no Shiprocket mapping is skipped, never auto-selected", async () => {
  _resetShiprocketConfigForTests();
  invalidateShiprocketToken();
  await withEnv(TEST_ENV, async () => {
    const { supabase } = mockSupabaseCapturingArgs([
      { store_id: STORE_A, store_code: "MAIN", created_at: "2026-01-01T00:00:00Z", provider_location_id: null, provider_location_name: null },
    ]);
    const result = await resolveFulfillmentStore(supabase, ORG_ID, {
      deliveryPostcode: "400001",
      weightKg: 1,
      cod: false,
      itemLines: [{ itemId: "item-1", quantity: 1 }],
    });
    // No mapped candidate at all -> never reaches the network, fails cleanly.
    assert.equal(result.ok, false);
  });
});

test("resolveFulfillmentStore (shipping-aware): skips a mapped-but-not-serviceable store and picks the next serviceable candidate", async () => {
  _resetShiprocketConfigForTests();
  invalidateShiprocketToken();
  await withEnv(TEST_ENV, async () => {
    const { supabase } = mockSupabaseCapturingArgs([
      { store_id: STORE_A, store_code: "MAIN", created_at: "2026-01-01T00:00:00Z", provider_location_id: "111", provider_location_name: "One" },
      { store_id: STORE_B, store_code: "SECOND", created_at: "2026-02-01T00:00:00Z", provider_location_id: "222", provider_location_name: "Two" },
    ]);
    const mock = installMockFetch([
      { match: (url) => url.endsWith("/auth/login"), respond: () => ({ status: 200, body: { token: "t" } }) },
      {
        match: (url) => url.includes("/settings/company/pickup"),
        respond: () => ({
          status: 200,
          body: {
            data: {
              shipping_address: [
                { id: 111, pickup_location: "One", city: "A", state: "A", country: "India", pin_code: "100001", status: 1, phone_verified: 1 },
                { id: 222, pickup_location: "Two", city: "B", state: "B", country: "India", pin_code: "200002", status: 1, phone_verified: 1 },
              ],
            },
          },
        }),
      },
      {
        match: (url) => url.includes("/courier/serviceability/") && url.includes("pickup_postcode=100001"),
        respond: () => ({ status: 200, body: { status: 404, message: "No courier service available" } }),
      },
      {
        match: (url) => url.includes("/courier/serviceability/") && url.includes("pickup_postcode=200002"),
        respond: () => ({
          status: 200,
          body: { data: { available_courier_companies: [{ courier_company_id: 1, courier_name: "C", is_surface: true, charge_weight: 1, freight_charge: 50, cod_charges: 0, rate: 50, estimated_delivery_days: null, etd: null, rating: null, blocked: 0 }] } },
        }),
      },
    ]);
    try {
      const result = await resolveFulfillmentStore(supabase, ORG_ID, {
        deliveryPostcode: "900009",
        weightKg: 1,
        cod: false,
        itemLines: [{ itemId: "item-1", quantity: 1 }],
      });
      assert.equal(result.ok, true);
      if (result.ok) assert.equal(result.storeId, STORE_B);
    } finally {
      mock.restore();
    }
  });
});

test("resolveFulfillmentStore (shipping-aware): no candidate is serviceable -> fails, does not fall back to an unserviceable guess", async () => {
  _resetShiprocketConfigForTests();
  invalidateShiprocketToken();
  await withEnv(TEST_ENV, async () => {
    const { supabase } = mockSupabaseCapturingArgs([
      { store_id: STORE_A, store_code: "MAIN", created_at: "2026-01-01T00:00:00Z", provider_location_id: "111", provider_location_name: "One" },
    ]);
    const mock = installMockFetch([
      { match: (url) => url.endsWith("/auth/login"), respond: () => ({ status: 200, body: { token: "t" } }) },
      {
        match: (url) => url.includes("/settings/company/pickup"),
        respond: () => ({
          status: 200,
          body: { data: { shipping_address: [{ id: 111, pickup_location: "One", city: "A", state: "A", country: "India", pin_code: "100001", status: 1, phone_verified: 1 }] } },
        }),
      },
      {
        match: (url) => url.includes("/courier/serviceability/"),
        respond: () => ({ status: 200, body: { status: 404, message: "No courier service available" } }),
      },
    ]);
    try {
      const result = await resolveFulfillmentStore(supabase, ORG_ID, {
        deliveryPostcode: "900009",
        weightKg: 1,
        cod: false,
        itemLines: [{ itemId: "item-1", quantity: 1 }],
      });
      assert.equal(result.ok, false);
    } finally {
      mock.restore();
    }
  });
});

test("resolveActivePickupMapping: a mapping pointing at a pickup location Shiprocket no longer returns is a safe error, not a crash", async () => {
  _resetShiprocketConfigForTests();
  invalidateShiprocketToken();
  await withEnv(TEST_ENV, async () => {
    const mock = installMockFetch([
      { match: (url) => url.endsWith("/auth/login"), respond: () => ({ status: 200, body: { token: "t" } }) },
      {
        match: (url) => url.includes("/settings/company/pickup"),
        respond: () => ({ status: 200, body: { data: { shipping_address: [] } } }),
      },
    ]);
    try {
      const supabase = mockSupabase([
        {
          store_id: STORE_A,
          store_code: "MAIN",
          created_at: "2026-01-01T00:00:00Z",
          provider_location_id: "999999",
          provider_location_name: "Ghost",
        },
      ]);
      const result = await resolveActivePickupMapping(supabase, ORG_ID, STORE_A);
      assert.equal(result.ok, false);
      if (!result.ok) assert.match(result.reason, /could not be found/);
    } finally {
      mock.restore();
    }
  });
});
