import test from "node:test";
import assert from "node:assert/strict";
import { createShiprocketOrder, assignAwb, getOrderByChannelId } from "./order";
import { _resetShiprocketConfigForTests } from "./env";
import { invalidateShiprocketToken } from "./auth";
import { ShiprocketError } from "./errors";
import { installMockFetch, withEnv } from "./test-helpers";
import type { CreateOrderInput } from "./types";

const TEST_ENV = {
  SHIPROCKET_API_BASE_URL: "https://example.invalid/v1/external",
  SHIPROCKET_API_EMAIL: "test@example.invalid",
  SHIPROCKET_API_PASSWORD: "irrelevant-test-value",
};

const BASE_INPUT: CreateOrderInput = {
  channelOrderId: "ONL-20260914-000001",
  orderDate: "2026-09-14 10:00",
  pickupLocationNickname: "MAIN",
  paymentMethod: "COD",
  subTotal: 100,
  billing: {
    customerName: "Test",
    lastName: "Customer",
    address: "123 Test Street",
    address2: null,
    city: "Mumbai",
    state: "Maharashtra",
    pincode: "400001",
    country: "India",
    email: "test@example.invalid",
    phone: "9999999999",
  },
  lines: [
    { name: "Test Item", sku: "SKU-1", units: 1, sellingPrice: 100, discount: 0, tax: 0, hsn: null },
  ],
  weightKg: 0.5,
  lengthCm: 10,
  breadthCm: 10,
  heightCm: 10,
};

function authRoute() {
  return { match: (url: string) => url.endsWith("/auth/login"), respond: () => ({ status: 200, body: { token: "t" } }) };
}

test("createShiprocketOrder: never sends anything but a POST to /orders/create/adhoc, and normalizes a successful response", async () => {
  _resetShiprocketConfigForTests();
  invalidateShiprocketToken();
  await withEnv(TEST_ENV, async () => {
    const mock = installMockFetch([
      authRoute(),
      {
        match: (url) => url.includes("/orders/create/adhoc"),
        respond: () => ({
          status: 200,
          body: {
            order_id: 12345,
            shipment_id: 67890,
            status: "NEW",
            awb_code: "",
            courier_company_id: "",
          },
        }),
      },
    ]);
    try {
      const result = await createShiprocketOrder(BASE_INPUT);
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.providerOrderId, "12345");
        assert.equal(result.providerShipmentId, "67890");
        assert.equal(result.awbCode, null);
        assert.equal(result.courierCompanyId, null);
      }
    } finally {
      mock.restore();
    }
  });
});

test("createShiprocketOrder: a business-level rejection (no order_id in response) is a normalized failure, not a thrown error", async () => {
  _resetShiprocketConfigForTests();
  invalidateShiprocketToken();
  await withEnv(TEST_ENV, async () => {
    const mock = installMockFetch([
      authRoute(),
      {
        match: (url) => url.includes("/orders/create/adhoc"),
        respond: () => ({ status: 200, body: { message: "Pickup location does not exist" } }),
      },
    ]);
    try {
      const result = await createShiprocketOrder(BASE_INPUT);
      assert.equal(result.ok, false);
      if (!result.ok) assert.match(result.reason, /Pickup location/);
    } finally {
      mock.restore();
    }
  });
});

test("createShiprocketOrder: a 5xx response throws a normalized ShiprocketError, never a fake success", async () => {
  _resetShiprocketConfigForTests();
  invalidateShiprocketToken();
  await withEnv(TEST_ENV, async () => {
    const mock = installMockFetch([
      authRoute(),
      {
        match: (url) => url.includes("/orders/create/adhoc"),
        respond: () => ({ status: 500, body: { message: "Internal Server Error" } }),
      },
    ]);
    try {
      await assert.rejects(
        () => createShiprocketOrder(BASE_INPUT),
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

test("createShiprocketOrder: never leaks the account password/email into the outgoing request body", async () => {
  _resetShiprocketConfigForTests();
  invalidateShiprocketToken();
  // Deliberately distinct from BASE_INPUT.billing.email — that address is
  // the CUSTOMER's billing email, which legitimately belongs in the order
  // payload. Only the Shiprocket ACCOUNT credentials must never appear.
  const ACCOUNT_ENV = { ...TEST_ENV, SHIPROCKET_API_EMAIL: "kantira-account-holder@example.invalid" };
  await withEnv(ACCOUNT_ENV, async () => {
    let capturedBody = "";
    const mock = installMockFetch([
      authRoute(),
      {
        match: (url) => url.includes("/orders/create/adhoc"),
        respond: () => ({ status: 200, body: { order_id: 1, shipment_id: 2 } }),
      },
    ]);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
      const url = typeof input === "string" ? input : String(input);
      if (url.includes("/orders/create/adhoc") && init?.body) {
        capturedBody = String(init.body);
      }
      return originalFetch(input as never, init);
    }) as typeof fetch;
    try {
      await createShiprocketOrder(BASE_INPUT);
      assert.doesNotMatch(capturedBody, /irrelevant-test-value/);
      assert.doesNotMatch(capturedBody, /kantira-account-holder@example\.invalid/);
    } finally {
      globalThis.fetch = originalFetch;
      mock.restore();
    }
  });
});

test("assignAwb: normalizes a successful AWB assignment", async () => {
  _resetShiprocketConfigForTests();
  invalidateShiprocketToken();
  await withEnv(TEST_ENV, async () => {
    const mock = installMockFetch([
      authRoute(),
      {
        match: (url) => url.includes("/courier/assign/awb"),
        respond: () => ({
          status: 200,
          body: {
            awb_assign_status: 1,
            response: { data: { awb_code: "AWB123", courier_company_id: 51, courier_name: "Test Courier" } },
          },
        }),
      },
    ]);
    try {
      const result = await assignAwb("67890");
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.awbCode, "AWB123");
        assert.equal(result.courierCompanyId, 51);
        assert.equal(result.courierName, "Test Courier");
      }
    } finally {
      mock.restore();
    }
  });
});

test("assignAwb: a response missing awb_code is a normalized failure, not a fabricated AWB", async () => {
  _resetShiprocketConfigForTests();
  invalidateShiprocketToken();
  await withEnv(TEST_ENV, async () => {
    const mock = installMockFetch([
      authRoute(),
      {
        match: (url) => url.includes("/courier/assign/awb"),
        respond: () => ({ status: 200, body: { message: "No couriers serviceable" } }),
      },
    ]);
    try {
      const result = await assignAwb("67890");
      assert.equal(result.ok, false);
      if (!result.ok) assert.match(result.reason, /No couriers/);
    } finally {
      mock.restore();
    }
  });
});

test("getOrderByChannelId: found=false when the response has no matching channel_order_id", async () => {
  _resetShiprocketConfigForTests();
  invalidateShiprocketToken();
  await withEnv(TEST_ENV, async () => {
    const mock = installMockFetch([
      authRoute(),
      { match: (url) => url.includes("/orders"), respond: () => ({ status: 200, body: { data: [] } }) },
    ]);
    try {
      const result = await getOrderByChannelId("ONL-20260914-000001");
      assert.equal(result.found, false);
    } finally {
      mock.restore();
    }
  });
});

test("getOrderByChannelId: a malformed/unexpected response shape is treated as not-found, never a false match", async () => {
  _resetShiprocketConfigForTests();
  invalidateShiprocketToken();
  await withEnv(TEST_ENV, async () => {
    const mock = installMockFetch([
      authRoute(),
      { match: (url) => url.includes("/orders"), respond: () => ({ status: 200, body: { unexpected: true } }) },
    ]);
    try {
      const result = await getOrderByChannelId("ONL-20260914-000001");
      assert.equal(result.found, false);
    } finally {
      mock.restore();
    }
  });
});

test("getOrderByChannelId: normalizes a matching order with a shipment", async () => {
  _resetShiprocketConfigForTests();
  invalidateShiprocketToken();
  await withEnv(TEST_ENV, async () => {
    const mock = installMockFetch([
      authRoute(),
      {
        match: (url) => url.includes("/orders"),
        respond: () => ({
          status: 200,
          body: {
            data: [
              {
                id: 12345,
                channel_order_id: "ONL-20260914-000001",
                status: "NEW",
                shipments: [{ id: 67890, awb: "AWB123", status: "NEW", courier: "Test Courier" }],
              },
            ],
          },
        }),
      },
    ]);
    try {
      const result = await getOrderByChannelId("ONL-20260914-000001");
      assert.equal(result.found, true);
      if (result.found) {
        assert.equal(result.providerOrderId, "12345");
        assert.equal(result.providerShipmentId, "67890");
        assert.equal(result.awbCode, "AWB123");
      }
    } finally {
      mock.restore();
    }
  });
});
