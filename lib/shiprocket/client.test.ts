import test from "node:test";
import assert from "node:assert/strict";
import { shiprocketGet } from "./client";
import { invalidateShiprocketToken } from "./auth";
import { _resetShiprocketConfigForTests } from "./env";
import { ShiprocketError } from "./errors";
import { installMockFetch, withEnv } from "./test-helpers";

const TEST_ENV = {
  SHIPROCKET_API_BASE_URL: "https://example.invalid/v1/external",
  SHIPROCKET_API_EMAIL: "test@example.invalid",
  SHIPROCKET_API_PASSWORD: "irrelevant-test-value",
};

test("a 401 triggers exactly one re-authentication and retry, then succeeds", async () => {
  _resetShiprocketConfigForTests();
  invalidateShiprocketToken();
  await withEnv(TEST_ENV, async () => {
    let businessCallCount = 0;
    const mock = installMockFetch([
      {
        match: (url) => url.endsWith("/auth/login"),
        respond: () => ({ status: 200, body: { token: "token-" + Math.random() } }),
      },
      {
        match: (url) => url.includes("/some/business/endpoint"),
        respond: () => {
          businessCallCount += 1;
          if (businessCallCount === 1) {
            return {
              status: 401,
              body: { error_id: 1, message: "unauthorized request", status_code: 401, timestamp: "" },
            };
          }
          return { status: 200, body: { data: [{ ok: true }] } };
        },
      },
    ]);
    try {
      // client.ts retries a 401 internally (invalidate -> re-auth -> retry
      // once), so a single call should transparently succeed here.
      const result = (await shiprocketGet("/some/business/endpoint")) as unknown;
      assert.deepEqual(result, { data: [{ ok: true }] });
      assert.equal(businessCallCount, 2, "expected the initial 401 plus one retry");
    } finally {
      mock.restore();
    }
  });
});

test("a non-2xx, non-401 response throws kind 'api_error'", async () => {
  _resetShiprocketConfigForTests();
  invalidateShiprocketToken();
  await withEnv(TEST_ENV, async () => {
    const mock = installMockFetch([
      {
        match: (url) => url.endsWith("/auth/login"),
        respond: () => ({ status: 200, body: { token: "token" } }),
      },
      {
        match: (url) => url.includes("/broken/endpoint"),
        respond: () => ({ status: 500, body: { message: "Internal Server Error" } }),
      },
    ]);
    try {
      await assert.rejects(
        () => shiprocketGet("/broken/endpoint"),
        (err: unknown) => {
          assert.ok(err instanceof ShiprocketError);
          assert.equal(err.kind, "api_error");
          assert.equal(err.httpStatus, 500);
          return true;
        },
      );
    } finally {
      mock.restore();
    }
  });
});

test("a malformed (non-JSON) response throws kind 'api_error' instead of crashing", async () => {
  _resetShiprocketConfigForTests();
  invalidateShiprocketToken();
  await withEnv(TEST_ENV, async () => {
    const mock = installMockFetch([
      {
        match: (url) => url.endsWith("/auth/login"),
        respond: () => ({ status: 200, body: { token: "token" } }),
      },
      {
        match: (url) => url.includes("/broken/endpoint"),
        respond: () => ({ status: 200, rawText: "<html>not json</html>" }),
      },
    ]);
    try {
      await assert.rejects(
        () => shiprocketGet("/broken/endpoint"),
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
