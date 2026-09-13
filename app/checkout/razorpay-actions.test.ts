import test from "node:test";
import assert from "node:assert/strict";
import { startRazorpayPaymentAction, verifyRazorpayPaymentAction } from "./razorpay-actions";

// The security-critical logic (signature verification order, authoritative
// Razorpay re-fetch, amount/currency/order/customer matching, idempotent
// finalization) lives in verifyCheckoutSignature (lib/razorpay/signature.ts,
// unit-tested directly) and confirm_razorpay_payment_and_finalize()
// (migration 0024, verified against a real local Postgres instance this
// session — amount tampering, wrong order id, cross-customer confirmation,
// and duplicate confirmation were all exercised there). These tests cover
// only the input-shape guards that run before any Supabase/Razorpay call.

test("startRazorpayPaymentAction rejects an invalid checkout session id before any I/O", async () => {
  const result = await startRazorpayPaymentAction("not-a-uuid");
  assert.equal(result.ok, false);
});

test("verifyRazorpayPaymentAction rejects when any confirmation field is missing, before any I/O", async () => {
  const missingOrderId = await verifyRazorpayPaymentAction({
    razorpayOrderId: "",
    razorpayPaymentId: "pay_1",
    razorpaySignature: "sig",
  });
  assert.equal(missingOrderId.ok, false);

  const missingPaymentId = await verifyRazorpayPaymentAction({
    razorpayOrderId: "order_1",
    razorpayPaymentId: "",
    razorpaySignature: "sig",
  });
  assert.equal(missingPaymentId.ok, false);

  const missingSignature = await verifyRazorpayPaymentAction({
    razorpayOrderId: "order_1",
    razorpayPaymentId: "pay_1",
    razorpaySignature: "",
  });
  assert.equal(missingSignature.ok, false);
});
