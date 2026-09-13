import test from "node:test";
import assert from "node:assert/strict";
import { getRazorpayConfig, getRazorpayWebhookSecret, _resetRazorpayConfigForTests } from "./env";
import { RazorpayError } from "./errors";
import { withEnv } from "./test-helpers";

test("throws a config error listing every missing variable", () => {
  _resetRazorpayConfigForTests();
  withEnv({ RAZORPAY_KEY_ID: undefined, RAZORPAY_KEY_SECRET: undefined }, () => {
    assert.throws(
      () => getRazorpayConfig(),
      (err: unknown) => {
        assert.ok(err instanceof RazorpayError);
        assert.equal(err.kind, "config");
        assert.match(err.message, /RAZORPAY_KEY_ID/);
        assert.match(err.message, /RAZORPAY_KEY_SECRET/);
        return true;
      },
    );
  });
});

test("succeeds and caches once both variables are present", () => {
  _resetRazorpayConfigForTests();
  withEnv(
    { RAZORPAY_KEY_ID: "rzp_test_123", RAZORPAY_KEY_SECRET: "shh_secret" },
    () => {
      const config = getRazorpayConfig();
      assert.equal(config.keyId, "rzp_test_123");
      assert.equal(config.keySecret, "shh_secret");
    },
  );
});

test("getRazorpayWebhookSecret returns null when unset, fails closed rather than throwing", () => {
  withEnv({ RAZORPAY_WEBHOOK_SECRET: undefined }, () => {
    assert.equal(getRazorpayWebhookSecret(), null);
  });
});

test("getRazorpayWebhookSecret returns the configured value", () => {
  withEnv({ RAZORPAY_WEBHOOK_SECRET: "whsec_test" }, () => {
    assert.equal(getRazorpayWebhookSecret(), "whsec_test");
  });
});
