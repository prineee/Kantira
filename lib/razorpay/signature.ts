import { createHmac, timingSafeEqual } from "node:crypto";

// Pure crypto helpers — no network, no env reads (the secret is always
// passed in by the caller, which reads it from lib/razorpay/env.ts). Kept
// separate and dependency-free so these can be unit-tested directly
// against Razorpay's publicly documented HMAC-SHA256 scheme without any
// fixture/mocking setup.

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  // timingSafeEqual throws on length mismatch rather than returning false —
  // an attacker-controlled signature length must never crash this check.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function hmacHex(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

// Verifies the signature Razorpay Standard Checkout returns to the browser
// on success (razorpay_payment_id, razorpay_order_id, razorpay_signature).
// Per Razorpay's documented scheme: signature = HMAC_SHA256(order_id + "|"
// + payment_id, key_secret). This never trusts the browser-supplied
// order_id as authoritative on its own — the caller (see
// app/checkout/razorpay-actions.ts) always re-derives the expected order_id
// from its own payment_intents row before calling this, so a mismatched
// order_id simply fails to verify rather than being trusted.
export function verifyCheckoutSignature(params: {
  orderId: string;
  paymentId: string;
  signature: string;
  keySecret: string;
}): boolean {
  const expected = hmacHex(`${params.orderId}|${params.paymentId}`, params.keySecret);
  return safeCompare(expected, params.signature);
}

// Verifies the `X-Razorpay-Signature` header on an incoming webhook:
// signature = HMAC_SHA256(raw_request_body, webhook_secret). Must be
// computed over the exact raw bytes Razorpay signed — never a re-serialized
// JSON.stringify(JSON.parse(body)), which is not guaranteed byte-identical.
export function verifyWebhookSignature(params: {
  rawBody: string;
  signature: string;
  webhookSecret: string;
}): boolean {
  const expected = hmacHex(params.rawBody, params.webhookSecret);
  return safeCompare(expected, params.signature);
}
