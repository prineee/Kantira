import test from "node:test";
import assert from "node:assert/strict";
import { getShiprocketConfig, _resetShiprocketConfigForTests } from "./env";
import { ShiprocketError } from "./errors";
import { withEnv } from "./test-helpers";

test("throws a config error listing every missing variable", () => {
  _resetShiprocketConfigForTests();
  withEnv(
    {
      SHIPROCKET_API_BASE_URL: undefined,
      SHIPROCKET_API_EMAIL: undefined,
      SHIPROCKET_API_PASSWORD: undefined,
    },
    () => {
      assert.throws(
        () => getShiprocketConfig(),
        (err: unknown) => {
          assert.ok(err instanceof ShiprocketError);
          assert.equal(err.kind, "config");
          assert.match(err.message, /SHIPROCKET_API_BASE_URL/);
          assert.match(err.message, /SHIPROCKET_API_EMAIL/);
          assert.match(err.message, /SHIPROCKET_API_PASSWORD/);
          return true;
        },
      );
    },
  );
});

test("succeeds and caches once all three variables are present", () => {
  _resetShiprocketConfigForTests();
  withEnv(
    {
      SHIPROCKET_API_BASE_URL: "https://example.invalid/v1/external",
      SHIPROCKET_API_EMAIL: "test@example.invalid",
      SHIPROCKET_API_PASSWORD: "irrelevant-test-value",
    },
    () => {
      const config = getShiprocketConfig();
      assert.equal(config.baseUrl, "https://example.invalid/v1/external");
    },
  );
});
