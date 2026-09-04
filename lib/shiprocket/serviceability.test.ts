import test from "node:test";
import assert from "node:assert/strict";
import { getShippingQuote, validateShippingQuoteInput } from "./serviceability";
import { invalidateShiprocketToken } from "./auth";
import { _resetShiprocketConfigForTests } from "./env";
import { ShiprocketError } from "./errors";
import { installMockFetch, withEnv } from "./test-helpers";

const TEST_ENV = {
  SHIPROCKET_API_BASE_URL: "https://example.invalid/v1/external",
  SHIPROCKET_API_EMAIL: "test@example.invalid",
  SHIPROCKET_API_PASSWORD: "irrelevant-test-value",
};

// A courier record shaped exactly like the live-verified response fields
// (see serviceability.ts's header comment for the source of this shape).
function rawCourier(overrides: Record<string, unknown> = {}) {
  return {
    courier_company_id: 196,
    courier_name: "DTDC Air 500gm",
    is_surface: false,
    charge_weight: 0.5,
    freight_charge: 118.23,
    cod_charges: 0,
    rate: 118.23,
    estimated_delivery_days: "3",
    etd: "Sep 05, 2026",
    rating: 4.8,
    blocked: 0,
    surge: [{ charge: 5.63, cod_surge: 0 }],
    ...overrides,
  };
}

test("rejects an invalid pincode before making any request", async () => {
  _resetShiprocketConfigForTests();
  invalidateShiprocketToken();
  await withEnv(TEST_ENV, async () => {
    const mock = installMockFetch([]); // any call at all is a test failure
    try {
      await assert.rejects(
        () =>
          getShippingQuote({
            pickupPostcode: "800004",
            deliveryPostcode: "123", // malformed
            weightKg: 0.5,
            cod: false,
          }),
        (err: unknown) => {
          assert.ok(err instanceof ShiprocketError);
          assert.equal(err.kind, "invalid_input");
          return true;
        },
      );
      assert.equal(mock.callCount, 0);
    } finally {
      mock.restore();
    }
  });
});

test("rejects a non-positive weight", () => {
  assert.ok(
    validateShippingQuoteInput({
      pickupPostcode: "800004",
      deliveryPostcode: "110001",
      weightKg: 0,
      cod: false,
    }),
  );
});

test("normalizes a prepaid quote: shippingTotal equals freight_charge (cod_charges is 0)", async () => {
  _resetShiprocketConfigForTests();
  invalidateShiprocketToken();
  await withEnv(TEST_ENV, async () => {
    const mock = installMockFetch([
      { match: (url) => url.endsWith("/auth/login"), respond: () => ({ status: 200, body: { token: "t" } }) },
      {
        match: (url) => url.includes("/courier/serviceability/"),
        respond: () => ({
          status: 200,
          body: {
            status: 200,
            data: {
              available_courier_companies: [rawCourier()],
              recommended_courier_company_id: 196,
            },
          },
        }),
      },
    ]);
    try {
      const result = await getShippingQuote({
        pickupPostcode: "800004",
        deliveryPostcode: "110001",
        weightKg: 0.5,
        cod: false,
      });
      assert.ok(result.serviceable);
      if (result.serviceable) {
        assert.equal(result.options.length, 1);
        assert.equal(result.options[0]!.codCharge, 0);
        assert.equal(result.options[0]!.freightCharge, 118.23);
        assert.equal(result.options[0]!.shippingTotal, 118.23);
        assert.equal(result.options[0]!.rawSurgeCharge, 5.63);
        assert.equal(result.recommendedCourierId, 196);
      }
    } finally {
      mock.restore();
    }
  });
});

test("normalizes a COD quote: shippingTotal equals freight_charge + cod_charges", async () => {
  _resetShiprocketConfigForTests();
  invalidateShiprocketToken();
  await withEnv(TEST_ENV, async () => {
    const mock = installMockFetch([
      { match: (url) => url.endsWith("/auth/login"), respond: () => ({ status: 200, body: { token: "t" } }) },
      {
        match: (url) => url.includes("/courier/serviceability/"),
        respond: () => ({
          status: 200,
          body: {
            status: 200,
            data: {
              available_courier_companies: [rawCourier({ cod_charges: 58.8, rate: 177.03 })],
              recommended_courier_company_id: 196,
            },
          },
        }),
      },
    ]);
    try {
      const result = await getShippingQuote({
        pickupPostcode: "800004",
        deliveryPostcode: "110001",
        weightKg: 0.5,
        cod: true,
      });
      assert.ok(result.serviceable);
      if (result.serviceable) {
        assert.equal(result.options[0]!.codCharge, 58.8);
        assert.equal(result.options[0]!.shippingTotal, 118.23 + 58.8);
      }
    } finally {
      mock.restore();
    }
  });
});

test("treats the verified 'no courier'/invalid-pincode shape as serviceable: false, not an error", async () => {
  _resetShiprocketConfigForTests();
  invalidateShiprocketToken();
  await withEnv(TEST_ENV, async () => {
    const mock = installMockFetch([
      { match: (url) => url.endsWith("/auth/login"), respond: () => ({ status: 200, body: { token: "t" } }) },
      {
        match: (url) => url.includes("/courier/serviceability/"),
        respond: () => ({
          status: 200,
          body: { status: 404, message: "No courier service available between 800004 and 999999" },
        }),
      },
    ]);
    try {
      const result = await getShippingQuote({
        pickupPostcode: "800004",
        deliveryPostcode: "999999",
        weightKg: 0.5,
        cod: false,
      });
      assert.equal(result.serviceable, false);
      if (!result.serviceable) {
        assert.match(result.reason, /No courier service available/);
      }
    } finally {
      mock.restore();
    }
  });
});

test("a malformed success-shaped response (data present but not an array) throws api_error", async () => {
  _resetShiprocketConfigForTests();
  invalidateShiprocketToken();
  await withEnv(TEST_ENV, async () => {
    const mock = installMockFetch([
      { match: (url) => url.endsWith("/auth/login"), respond: () => ({ status: 200, body: { token: "t" } }) },
      {
        match: (url) => url.includes("/courier/serviceability/"),
        respond: () => ({
          status: 200,
          body: { status: 200, data: { available_courier_companies: "not-an-array" } },
        }),
      },
    ]);
    try {
      await assert.rejects(
        () =>
          getShippingQuote({
            pickupPostcode: "800004",
            deliveryPostcode: "110001",
            weightKg: 0.5,
            cod: false,
          }),
        (err: unknown) => {
          assert.ok(err instanceof ShiprocketError);
          assert.equal(err.kind, "api_error");
          return true;
        },
      );
    } finally {
      mock.restore();
    }
  });
});
