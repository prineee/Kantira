import test from "node:test";
import assert from "node:assert/strict";
import { getCheckoutShippingQuoteCore, type CheckoutShippingQuoteInput } from "./actions";
import { validateInput } from "./validation";
import { calculateTotalShipmentWeightKg } from "@/lib/shipping/weight";
import { ShiprocketError } from "@/lib/shiprocket/errors";
import type { ShippingQuoteResult } from "@/lib/shiprocket/types";

const CUSTOMER_ID = "11111111-1111-1111-1111-111111111111";
const ORG_ID = "22222222-2222-2222-2222-222222222222";
const ADDRESS_ID = "33333333-3333-3333-3333-333333333333";
const ITEM_ID = "44444444-4444-4444-4444-444444444444";
const STORE_ID = "55555555-5555-5555-5555-555555555555";

type TableData = unknown;

/** Minimal fake of the @supabase/ssr query-builder surface actually used by
 * app/checkout/actions.ts: .from(table).select().eq()...maybeSingle(), and
 * .from(table).select().eq().in() awaited directly (no terminal call). */
function makeMockSupabase(tableResults: Record<string, TableData | null>) {
  return {
    from(table: string) {
      const result = { data: tableResults[table] ?? null };
      const builder: PromiseLike<typeof result> & Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        limit: () => builder,
        maybeSingle: async () => result,
        then(onFulfilled: (v: typeof result) => unknown) {
          return Promise.resolve(result).then(onFulfilled);
        },
      } as never;
      return builder;
    },
  };
}

function okCustomerContext(supabase: unknown) {
  return async () =>
    ({
      error: null,
      supabase: supabase as never,
      user: { id: "user-1" } as never,
      customer: { id: CUSTOMER_ID, organization_id: ORG_ID, name: "Test Customer" },
    }) as const;
}

function validInput(overrides: Partial<CheckoutShippingQuoteInput> = {}): CheckoutShippingQuoteInput {
  return {
    addressId: ADDRESS_ID,
    itemLines: [{ itemId: ITEM_ID, quantity: 2 }],
    paymentMethod: "PREPAID",
    ...overrides,
  };
}

function fullyServiceableQuote(cod: boolean): ShippingQuoteResult {
  return {
    serviceable: true,
    recommendedCourierId: 196,
    options: [
      {
        courierId: 196,
        courierName: "DTDC Air 500gm",
        isSurface: false,
        chargeableWeightKg: 0.5,
        freightCharge: 118.23,
        codCharge: cod ? 58.8 : 0,
        shippingTotal: cod ? 177.03 : 118.23,
        rawSurgeCharge: 8.43,
        estimatedDeliveryDays: "3",
        estimatedDeliveryDate: "Sep 05, 2026",
        ratingOutOf5: 4.8,
        isBlocked: false,
      },
      {
        courierId: 6,
        courierName: "DTDC Surface",
        isSurface: true,
        chargeableWeightKg: 0.5,
        freightCharge: 87.67,
        codCharge: cod ? 58.8 : 0,
        shippingTotal: cod ? 146.47 : 87.67,
        rawSurgeCharge: 6.97,
        estimatedDeliveryDays: "4",
        estimatedDeliveryDate: "Sep 06, 2026",
        ratingOutOf5: 5,
        isBlocked: false,
      },
    ],
  };
}

const unreachableWeight = () => {
  throw new Error("must not be called");
};
const unreachableStore = async (): Promise<never> => {
  throw new Error("must not be called");
};
const unreachablePickup = async (): Promise<never> => {
  throw new Error("must not be called");
};
const unreachableQuote = async (): Promise<never> => {
  throw new Error("must not be called");
};

test("rejects when the customer has no linked identity", async () => {
  const result = await getCheckoutShippingQuoteCore(validInput(), {
    requireCustomerContext: async () =>
      ({ error: "No customer profile is linked to this account.", supabase: null, user: null, customer: null }) as const,
    calculateTotalShipmentWeightKg: unreachableWeight,
    resolveFulfillmentStore: unreachableStore,
    resolveActivePickupMapping: unreachablePickup,
    getShippingQuote: unreachableQuote,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /No customer profile/);
});

test("rejects an invalid delivery address id shape without touching the database", async () => {
  const supabase = makeMockSupabase({});
  const result = await getCheckoutShippingQuoteCore(validInput({ addressId: "not-a-uuid" }), {
    requireCustomerContext: okCustomerContext(supabase),
    calculateTotalShipmentWeightKg: unreachableWeight,
    resolveFulfillmentStore: unreachableStore,
    resolveActivePickupMapping: unreachablePickup,
    getShippingQuote: unreachableQuote,
  });
  assert.equal(result.ok, false);
});

test("rejects an empty cart", () => {
  assert.ok(validateInput({ addressId: ADDRESS_ID, itemLines: [], paymentMethod: "PREPAID" }));
});

test("rejects a non-positive/non-integer quantity", () => {
  assert.ok(
    validateInput({
      addressId: ADDRESS_ID,
      itemLines: [{ itemId: ITEM_ID, quantity: 0 }],
      paymentMethod: "PREPAID",
    }),
  );
  assert.ok(
    validateInput({
      addressId: ADDRESS_ID,
      itemLines: [{ itemId: ITEM_ID, quantity: 1.5 }],
      paymentMethod: "PREPAID",
    }),
  );
});

test("ignores any extra client-supplied fields (e.g. a smuggled price or weight) — the type has no such field and nothing reads it", () => {
  // Simulates a request body smuggling extra fields past an untyped JSON
  // boundary (TypeScript's own excess-property check only guards a direct
  // object-literal call site, not this deserialize-then-spread shape) —
  // `CheckoutShippingQuoteInput` has no price/weight/pickup field at all,
  // and this only asserts validateInput() doesn't choke on their presence;
  // the full-pipeline tests below independently prove nothing downstream
  // ever reads such a field (weight/pickup always come from injected
  // server-side resolvers, never from `input`).
  const smuggled = {
    ...validInput(),
    shippingTotal: 1,
    weightKg: 999,
    pickupPostcode: "000000",
  };
  assert.equal(validateInput(smuggled), null);
});

test("rejects an invalid delivery pincode on the saved address", async () => {
  const supabase = makeMockSupabase({
    customer_addresses: { id: ADDRESS_ID, postal_code: "123" },
  });
  const result = await getCheckoutShippingQuoteCore(validInput(), {
    requireCustomerContext: okCustomerContext(supabase),
    calculateTotalShipmentWeightKg: unreachableWeight,
    resolveFulfillmentStore: unreachableStore,
    resolveActivePickupMapping: unreachablePickup,
    getShippingQuote: unreachableQuote,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /pincode/);
});

test("rejects when a cart item no longer exists/is inactive", async () => {
  const supabase = makeMockSupabase({
    customer_addresses: { id: ADDRESS_ID, postal_code: "800004" },
    items: [], // the requested item id was not found among active org items
  });
  const result = await getCheckoutShippingQuoteCore(validInput(), {
    requireCustomerContext: okCustomerContext(supabase),
    calculateTotalShipmentWeightKg: unreachableWeight,
    resolveFulfillmentStore: unreachableStore,
    resolveActivePickupMapping: unreachablePickup,
    getShippingQuote: unreachableQuote,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /no longer available/);
});

test("missing item weight blocks the quote before any store/Shiprocket call, using the real weight calculator", async () => {
  const supabase = makeMockSupabase({
    customer_addresses: { id: ADDRESS_ID, postal_code: "800004" },
    items: [{ id: ITEM_ID, weight_kg: null }],
  });
  const result = await getCheckoutShippingQuoteCore(validInput(), {
    requireCustomerContext: okCustomerContext(supabase),
    calculateTotalShipmentWeightKg, // the real implementation
    resolveFulfillmentStore: unreachableStore,
    resolveActivePickupMapping: unreachablePickup,
    getShippingQuote: unreachableQuote,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /not configured/);
});

test("valid weight but no fulfillment store configured blocks the quote", async () => {
  const supabase = makeMockSupabase({
    customer_addresses: { id: ADDRESS_ID, postal_code: "800004" },
    items: [{ id: ITEM_ID, weight_kg: 0.5 }],
  });
  const result = await getCheckoutShippingQuoteCore(validInput(), {
    requireCustomerContext: okCustomerContext(supabase),
    calculateTotalShipmentWeightKg,
    resolveFulfillmentStore: async () => ({ ok: false, reason: "No active fulfillment store." }),
    resolveActivePickupMapping: unreachablePickup,
    getShippingQuote: unreachableQuote,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /FULFILLMENT CONFIGURATION REQUIRED/);
});

test("valid weight and store but no active pickup mapping blocks the quote (today's real state)", async () => {
  const supabase = makeMockSupabase({
    customer_addresses: { id: ADDRESS_ID, postal_code: "800004" },
    items: [{ id: ITEM_ID, weight_kg: 0.5 }],
  });
  const result = await getCheckoutShippingQuoteCore(validInput(), {
    requireCustomerContext: okCustomerContext(supabase),
    calculateTotalShipmentWeightKg,
    resolveFulfillmentStore: async () => ({ ok: true, storeId: STORE_ID }),
    resolveActivePickupMapping: async () => ({
      ok: false,
      reason: "No active Shiprocket pickup location is mapped to this store yet.",
    }),
    getShippingQuote: unreachableQuote,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /PICKUP MAPPING REQUIRED/);
});

test("multiple active pickup mappings blocks the quote rather than picking one arbitrarily", async () => {
  const supabase = makeMockSupabase({
    customer_addresses: { id: ADDRESS_ID, postal_code: "800004" },
    items: [{ id: ITEM_ID, weight_kg: 0.5 }],
  });
  const result = await getCheckoutShippingQuoteCore(validInput(), {
    requireCustomerContext: okCustomerContext(supabase),
    calculateTotalShipmentWeightKg,
    resolveFulfillmentStore: async () => ({ ok: true, storeId: STORE_ID }),
    resolveActivePickupMapping: async () => ({
      ok: false,
      reason: "Multiple active Shiprocket pickup mappings exist for this store.",
    }),
    getShippingQuote: unreachableQuote,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /Multiple active/);
});

test("full pipeline: prepaid success returns multiple normalized options with no surge exposed", async () => {
  const supabase = makeMockSupabase({
    customer_addresses: { id: ADDRESS_ID, postal_code: "110001" },
    items: [{ id: ITEM_ID, weight_kg: 0.25 }],
  });
  const result = await getCheckoutShippingQuoteCore(validInput({ paymentMethod: "PREPAID" }), {
    requireCustomerContext: okCustomerContext(supabase),
    calculateTotalShipmentWeightKg,
    resolveFulfillmentStore: async () => ({ ok: true, storeId: STORE_ID }),
    resolveActivePickupMapping: async () => ({ ok: true, pickupPostcode: "800004" }),
    getShippingQuote: async (args) => {
      assert.equal(args.cod, false);
      assert.equal(args.weightKg, 0.5); // 0.25kg x quantity 2, computed server-side
      assert.equal(args.pickupPostcode, "800004");
      assert.equal(args.deliveryPostcode, "110001");
      return fullyServiceableQuote(false);
    },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.options.length, 2);
    assert.equal(result.recommendedCourierId, 196);
    for (const opt of result.options) {
      assert.equal(opt.codCharge, 0);
      assert.equal(opt.shippingTotal, opt.freightCharge); // prepaid: no double count, no surge
      assert.equal((opt as Record<string, unknown>).rawSurgeCharge, undefined);
      assert.equal((opt as Record<string, unknown>).surge, undefined);
    }
  }
});

test("full pipeline: COD success — shippingTotal is not double-counted (equals freight+cod once, not rate+cod again)", async () => {
  const supabase = makeMockSupabase({
    customer_addresses: { id: ADDRESS_ID, postal_code: "110001" },
    items: [{ id: ITEM_ID, weight_kg: 0.25 }],
  });
  const result = await getCheckoutShippingQuoteCore(validInput({ paymentMethod: "COD" }), {
    requireCustomerContext: okCustomerContext(supabase),
    calculateTotalShipmentWeightKg,
    resolveFulfillmentStore: async () => ({ ok: true, storeId: STORE_ID }),
    resolveActivePickupMapping: async () => ({ ok: true, pickupPostcode: "800004" }),
    getShippingQuote: async (args) => {
      assert.equal(args.cod, true);
      return fullyServiceableQuote(true);
    },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    const first = result.options[0]!;
    assert.equal(first.codCharge, 58.8);
    assert.equal(first.freightCharge, 118.23);
    assert.equal(first.shippingTotal, 177.03); // == freight + cod, i.e. Shiprocket's `rate` — not rate + cod again
  }
});

test("not-serviceable is a normal ok:false result, not a thrown error", async () => {
  const supabase = makeMockSupabase({
    customer_addresses: { id: ADDRESS_ID, postal_code: "999999" },
    items: [{ id: ITEM_ID, weight_kg: 0.25 }],
  });
  const result = await getCheckoutShippingQuoteCore(validInput(), {
    requireCustomerContext: okCustomerContext(supabase),
    calculateTotalShipmentWeightKg,
    resolveFulfillmentStore: async () => ({ ok: true, storeId: STORE_ID }),
    resolveActivePickupMapping: async () => ({ ok: true, pickupPostcode: "800004" }),
    getShippingQuote: async () => ({ serviceable: false, reason: "No courier service available." }),
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /not currently available/);
});

test("a ShiprocketError from the quote layer is mapped to a safe message, never surfaced raw", async () => {
  const supabase = makeMockSupabase({
    customer_addresses: { id: ADDRESS_ID, postal_code: "110001" },
    items: [{ id: ITEM_ID, weight_kg: 0.25 }],
  });
  const result = await getCheckoutShippingQuoteCore(validInput(), {
    requireCustomerContext: okCustomerContext(supabase),
    calculateTotalShipmentWeightKg,
    resolveFulfillmentStore: async () => ({ ok: true, storeId: STORE_ID }),
    resolveActivePickupMapping: async () => ({ ok: true, pickupPostcode: "800004" }),
    getShippingQuote: async () => {
      throw new ShiprocketError("api_error", "Shiprocket returned an error response.", { httpStatus: 500 });
    },
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error, "Unable to calculate shipping right now. Please try again.");
  }
});
