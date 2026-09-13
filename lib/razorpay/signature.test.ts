import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyCheckoutSignature, verifyWebhookSignature } from "./signature";

const SECRET = "test_secret_value";

test("verifyCheckoutSignature accepts a correctly computed HMAC(order_id|payment_id)", () => {
  const orderId = "order_ABC123";
  const paymentId = "pay_XYZ789";
  const signature = createHmac("sha256", SECRET).update(`${orderId}|${paymentId}`).digest("hex");

  assert.equal(
    verifyCheckoutSignature({ orderId, paymentId, signature, keySecret: SECRET }),
    true,
  );
});

test("verifyCheckoutSignature rejects a tampered signature", () => {
  const orderId = "order_ABC123";
  const paymentId = "pay_XYZ789";
  const signature = createHmac("sha256", SECRET).update(`${orderId}|${paymentId}`).digest("hex");

  assert.equal(
    verifyCheckoutSignature({ orderId, paymentId: "pay_DIFFERENT", signature, keySecret: SECRET }),
    false,
  );
});

test("verifyCheckoutSignature rejects when signed with the wrong secret", () => {
  const orderId = "order_ABC123";
  const paymentId = "pay_XYZ789";
  const signature = createHmac("sha256", "wrong_secret").update(`${orderId}|${paymentId}`).digest("hex");

  assert.equal(
    verifyCheckoutSignature({ orderId, paymentId, signature, keySecret: SECRET }),
    false,
  );
});

test("verifyCheckoutSignature never throws on a malformed/short signature (length mismatch)", () => {
  assert.equal(
    verifyCheckoutSignature({
      orderId: "order_1",
      paymentId: "pay_1",
      signature: "not-a-real-signature",
      keySecret: SECRET,
    }),
    false,
  );
});

test("verifyCheckoutSignature rejects an empty signature", () => {
  assert.equal(
    verifyCheckoutSignature({ orderId: "order_1", paymentId: "pay_1", signature: "", keySecret: SECRET }),
    false,
  );
});

test("verifyWebhookSignature accepts a correctly computed HMAC over the raw body", () => {
  const rawBody = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_1" } } } });
  const signature = createHmac("sha256", SECRET).update(rawBody).digest("hex");

  assert.equal(verifyWebhookSignature({ rawBody, signature, webhookSecret: SECRET }), true);
});

test("verifyWebhookSignature rejects a body that doesn't match the signature (tamper detection)", () => {
  const rawBody = JSON.stringify({ event: "payment.captured" });
  const signature = createHmac("sha256", SECRET).update(rawBody).digest("hex");
  const tamperedBody = JSON.stringify({ event: "payment.failed" });

  assert.equal(verifyWebhookSignature({ rawBody: tamperedBody, signature, webhookSecret: SECRET }), false);
});

test("verifyWebhookSignature rejects when the webhook secret is wrong", () => {
  const rawBody = JSON.stringify({ event: "order.paid" });
  const signature = createHmac("sha256", "wrong_secret").update(rawBody).digest("hex");

  assert.equal(verifyWebhookSignature({ rawBody, signature, webhookSecret: SECRET }), false);
});
