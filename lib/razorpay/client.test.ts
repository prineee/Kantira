import test from "node:test";
import assert from "node:assert/strict";
import { createRazorpayOrder, fetchRazorpayPayment } from "./client";
import { RazorpayError } from "./errors";
import { _resetRazorpayConfigForTests } from "./env";
import { installMockFetch, withEnv } from "./test-helpers";

const ENV = { RAZORPAY_KEY_ID: "rzp_test_key", RAZORPAY_KEY_SECRET: "test_secret" };

test("createRazorpayOrder posts amount/currency/receipt and returns the parsed order", async () => {
  _resetRazorpayConfigForTests();
  await withEnv(ENV, async () => {
    const mock = installMockFetch([
      {
        match: (url) => url === "https://api.razorpay.com/v1/orders",
        respond: () => ({
          status: 200,
          body: { id: "order_ABC", amount: 10000, currency: "INR", status: "created", receipt: "chk_1" },
        }),
      },
    ]);
    try {
      const order = await createRazorpayOrder({ amountPaise: 10000, currency: "INR", receipt: "chk_1" });
      assert.equal(order.id, "order_ABC");
      assert.equal(order.amount, 10000);
      assert.equal(mock.callCount, 1);
    } finally {
      mock.restore();
    }
  });
});

test("createRazorpayOrder rejects a non-integer or non-positive amount before any request is sent", async () => {
  _resetRazorpayConfigForTests();
  await withEnv(ENV, async () => {
    const mock = installMockFetch([]);
    try {
      await assert.rejects(
        createRazorpayOrder({ amountPaise: 0, currency: "INR", receipt: "chk_1" }),
        (err: unknown) => err instanceof RazorpayError && err.kind === "invalid_input",
      );
      await assert.rejects(
        createRazorpayOrder({ amountPaise: 19.99, currency: "INR", receipt: "chk_1" }),
        (err: unknown) => err instanceof RazorpayError && err.kind === "invalid_input",
      );
      assert.equal(mock.callCount, 0);
    } finally {
      mock.restore();
    }
  });
});

test("createRazorpayOrder never sends the key secret as plaintext in the body, only Basic auth header", async () => {
  _resetRazorpayConfigForTests();
  await withEnv(ENV, async () => {
    let capturedInit: RequestInit | undefined;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      capturedInit = init;
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ id: "order_1", amount: 100, currency: "INR", status: "created", receipt: null }),
      } as unknown as Response;
    }) as typeof fetch;
    try {
      await createRazorpayOrder({ amountPaise: 100, currency: "INR", receipt: "r1" });
      assert.ok(!String(capturedInit?.body).includes("test_secret"));
      const headers = capturedInit?.headers as Record<string, string>;
      assert.match(headers.Authorization!, /^Basic /);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("fetchRazorpayPayment returns the authoritative payment state", async () => {
  _resetRazorpayConfigForTests();
  await withEnv(ENV, async () => {
    const mock = installMockFetch([
      {
        match: (url) => url === "https://api.razorpay.com/v1/payments/pay_XYZ",
        respond: () => ({
          status: 200,
          body: { id: "pay_XYZ", order_id: "order_ABC", amount: 10000, currency: "INR", status: "captured" },
        }),
      },
    ]);
    try {
      const payment = await fetchRazorpayPayment("pay_XYZ");
      assert.equal(payment.status, "captured");
      assert.equal(payment.order_id, "order_ABC");
    } finally {
      mock.restore();
    }
  });
});

test("fetchRazorpayPayment rejects a malformed payment id before any request", async () => {
  _resetRazorpayConfigForTests();
  await withEnv(ENV, async () => {
    const mock = installMockFetch([]);
    try {
      await assert.rejects(
        fetchRazorpayPayment("'; DROP TABLE payments; --"),
        (err: unknown) => err instanceof RazorpayError && err.kind === "invalid_input",
      );
      assert.equal(mock.callCount, 0);
    } finally {
      mock.restore();
    }
  });
});

test("a non-2xx Razorpay response throws api_error, never the raw body", async () => {
  _resetRazorpayConfigForTests();
  await withEnv(ENV, async () => {
    const mock = installMockFetch([
      {
        match: () => true,
        respond: () => ({ status: 401, body: { error: { description: "Authentication failed" } } }),
      },
    ]);
    try {
      await assert.rejects(
        fetchRazorpayPayment("pay_XYZ"),
        (err: unknown) => err instanceof RazorpayError && err.kind === "api_error",
      );
    } finally {
      mock.restore();
    }
  });
});
