import test from "node:test";
import assert from "node:assert/strict";
import { getShiprocketToken, invalidateShiprocketToken, _setTimeoutMsForTests } from "./auth";
import { _resetShiprocketConfigForTests } from "./env";
import { ShiprocketError } from "./errors";
import { installMockFetch, withEnv } from "./test-helpers";

const TEST_ENV = {
  SHIPROCKET_API_BASE_URL: "https://example.invalid/v1/external",
  SHIPROCKET_API_EMAIL: "test@example.invalid",
  SHIPROCKET_API_PASSWORD: "irrelevant-test-value",
};

test("authenticates successfully and never leaks the raw fetch body", async () => {
  _resetShiprocketConfigForTests();
  invalidateShiprocketToken();
  await withEnv(TEST_ENV, async () => {
    const mock = installMockFetch([
      {
        match: (url) => url.endsWith("/auth/login"),
        respond: () => ({
          status: 200,
          body: {
            token: "header.payload.signature",
            id: 1,
            first_name: "Test",
            last_name: "User",
            email: "test@example.invalid",
            company_id: 1,
            created_at: "2026-01-01T00:00:00.000Z",
          },
        }),
      },
    ]);
    try {
      const token = await getShiprocketToken();
      assert.equal(token, "header.payload.signature");
    } finally {
      mock.restore();
    }
  });
});

test("authentication failure throws a ShiprocketError of kind auth_failed", async () => {
  _resetShiprocketConfigForTests();
  invalidateShiprocketToken();
  await withEnv(TEST_ENV, async () => {
    const mock = installMockFetch([
      {
        match: (url) => url.endsWith("/auth/login"),
        respond: () => ({
          status: 403,
          body: { message: "Invalid email and password combination", status_code: 403 },
        }),
      },
    ]);
    try {
      await assert.rejects(
        () => getShiprocketToken(),
        (err: unknown) => {
          assert.ok(err instanceof ShiprocketError);
          assert.equal(err.kind, "auth_failed");
          assert.equal(err.httpStatus, 403);
          return true;
        },
      );
    } finally {
      mock.restore();
    }
  });
});

test("reuses the cached token across calls instead of re-authenticating", async () => {
  _resetShiprocketConfigForTests();
  invalidateShiprocketToken();
  await withEnv(TEST_ENV, async () => {
    const mock = installMockFetch([
      {
        match: (url) => url.endsWith("/auth/login"),
        respond: () => ({ status: 200, body: { token: "cached-token" } }),
      },
    ]);
    try {
      await getShiprocketToken();
      await getShiprocketToken();
      assert.equal(mock.callCount, 1, "expected only one login call across two getShiprocketToken() calls");
    } finally {
      mock.restore();
    }
  });
});

test("re-authenticates after an explicit token invalidation", async () => {
  _resetShiprocketConfigForTests();
  invalidateShiprocketToken();
  await withEnv(TEST_ENV, async () => {
    const mock = installMockFetch([
      {
        match: (url) => url.endsWith("/auth/login"),
        respond: () => ({ status: 200, body: { token: "token-" + Math.random() } }),
      },
    ]);
    try {
      const first = await getShiprocketToken();
      invalidateShiprocketToken();
      const second = await getShiprocketToken();
      assert.equal(mock.callCount, 2);
      assert.notEqual(first, second);
    } finally {
      mock.restore();
    }
  });
});

test("times out and throws kind 'timeout' rather than hanging", async () => {
  _resetShiprocketConfigForTests();
  invalidateShiprocketToken();
  _setTimeoutMsForTests(20);
  await withEnv(TEST_ENV, async () => {
    const original = globalThis.fetch;
    globalThis.fetch = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      })) as typeof fetch;
    try {
      await assert.rejects(
        () => getShiprocketToken(),
        (err: unknown) => {
          assert.ok(err instanceof ShiprocketError);
          assert.equal(err.kind, "timeout");
          return true;
        },
      );
    } finally {
      globalThis.fetch = original;
      _setTimeoutMsForTests(15_000);
    }
  });
});
