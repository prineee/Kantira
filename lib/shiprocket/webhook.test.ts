import test from "node:test";
import assert from "node:assert/strict";
import { verifyShiprocketWebhookSecret } from "./webhook";

test("verifyShiprocketWebhookSecret: accepts a matching header", () => {
  assert.equal(verifyShiprocketWebhookSecret("s3cret", "s3cret"), true);
});

test("verifyShiprocketWebhookSecret: rejects a mismatched header", () => {
  assert.equal(verifyShiprocketWebhookSecret("wrong", "s3cret"), false);
});

test("verifyShiprocketWebhookSecret: rejects a missing header", () => {
  assert.equal(verifyShiprocketWebhookSecret(null, "s3cret"), false);
});

test("verifyShiprocketWebhookSecret: rejects an empty header", () => {
  assert.equal(verifyShiprocketWebhookSecret("", "s3cret"), false);
});

test("verifyShiprocketWebhookSecret: a header that is a prefix of the real secret is rejected, not partially matched", () => {
  assert.equal(verifyShiprocketWebhookSecret("s3cre", "s3cret"), false);
});
