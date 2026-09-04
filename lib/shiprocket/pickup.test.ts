import test from "node:test";
import assert from "node:assert/strict";
import { listPickupLocations } from "./pickup";
import { invalidateShiprocketToken } from "./auth";
import { _resetShiprocketConfigForTests } from "./env";
import { ShiprocketError } from "./errors";
import { installMockFetch, withEnv } from "./test-helpers";

const TEST_ENV = {
  SHIPROCKET_API_BASE_URL: "https://example.invalid/v1/external",
  SHIPROCKET_API_EMAIL: "test@example.invalid",
  SHIPROCKET_API_PASSWORD: "irrelevant-test-value",
};

test("normalizes pickup locations to the safe subset of verified fields only", async () => {
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
                  id: 2839845,
                  pickup_location: "dcmstore-1",
                  city: "Patna",
                  state: "Bihar",
                  country: "India",
                  pin_code: "800004",
                  status: 2,
                  phone_verified: 1,
                  // Deliberately present to prove these are NOT surfaced:
                  phone: "9999999999",
                  email: "owner@example.com",
                  address: "123 Some Street",
                  gstin: "SOME_GSTIN",
                },
              ],
            },
          },
        }),
      },
    ]);
    try {
      const locations = await listPickupLocations();
      assert.equal(locations.length, 1);
      const loc = locations[0]!;
      assert.equal(loc.id, 2839845);
      assert.equal(loc.nickname, "dcmstore-1");
      assert.equal(loc.pinCode, "800004");
      assert.equal(loc.phoneVerified, true);
      assert.equal((loc as any).phone, undefined);
      assert.equal((loc as any).email, undefined);
      assert.equal((loc as any).gstin, undefined);
    } finally {
      mock.restore();
    }
  });
});

test("the real response nests the array under data.shipping_address, not data directly — a bare data array is malformed", async () => {
  // Regression guard for the Phase 5B-8E defect: the live API actually
  // returns { data: { shipping_address: [...] } }, not { data: [...] }.
  _resetShiprocketConfigForTests();
  invalidateShiprocketToken();
  await withEnv(TEST_ENV, async () => {
    const mock = installMockFetch([
      { match: (url) => url.endsWith("/auth/login"), respond: () => ({ status: 200, body: { token: "t" } }) },
      {
        match: (url) => url.includes("/settings/company/pickup"),
        respond: () => ({ status: 200, body: { data: [{ id: 1, pickup_location: "x" }] } }),
      },
    ]);
    try {
      await assert.rejects(
        () => listPickupLocations(),
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

test("a malformed pickup response (data missing) throws api_error", async () => {
  _resetShiprocketConfigForTests();
  invalidateShiprocketToken();
  await withEnv(TEST_ENV, async () => {
    const mock = installMockFetch([
      { match: (url) => url.endsWith("/auth/login"), respond: () => ({ status: 200, body: { token: "t" } }) },
      {
        match: (url) => url.includes("/settings/company/pickup"),
        respond: () => ({ status: 200, body: { unexpected: true } }),
      },
    ]);
    try {
      await assert.rejects(
        () => listPickupLocations(),
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
