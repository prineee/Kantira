"use server";

import { requireCustomerContext } from "@/lib/actions/customer-auth";
import { isValidUuid } from "@/lib/data/storefront-catalog";
import { createRazorpayOrder, fetchRazorpayPayment } from "@/lib/razorpay/client";
import { verifyCheckoutSignature } from "@/lib/razorpay/signature";
import { getRazorpayConfig } from "@/lib/razorpay/env";
import { rupeesToPaise, paiseToRupees } from "@/lib/razorpay/money";
import { RazorpayError, toSafeClientMessage } from "@/lib/razorpay/errors";

export type StartRazorpayPaymentResult =
  | { ok: true; razorpayOrderId: string; amountPaise: number; currency: string; keyId: string }
  | { ok: false; error: string };

// Creates the Razorpay Order the browser's Checkout widget opens against.
// The amount is derived ONLY from the already-locked checkout_sessions
// snapshot (never recomputed, never accepted from the caller) — this is
// the "Razorpay amount must equal the authoritative checkout snapshot
// total" requirement made structurally true rather than merely checked.
export async function startRazorpayPaymentAction(
  checkoutSessionId: string,
): Promise<StartRazorpayPaymentResult> {
  if (!isValidUuid(checkoutSessionId)) {
    return { ok: false, error: "Invalid checkout session." };
  }

  const ctx = await requireCustomerContext();
  if (ctx.error) return { ok: false, error: ctx.error };

  const { data: session } = await ctx.supabase
    .from("checkout_sessions")
    .select("id, grand_total, currency, payment_method, status")
    .eq("id", checkoutSessionId)
    .maybeSingle();

  if (!session) return { ok: false, error: "Checkout session not found." };
  if (session.payment_method !== "RAZORPAY") {
    return { ok: false, error: "This checkout is not a prepaid order." };
  }
  if (session.status !== "OPEN" && session.status !== "AWAITING_PAYMENT") {
    return { ok: false, error: "This checkout can no longer accept payment." };
  }

  let amountPaise: number;
  try {
    amountPaise = rupeesToPaise(session.grand_total);
  } catch {
    return { ok: false, error: "Invalid checkout amount." };
  }

  try {
    const razorpayOrder = await createRazorpayOrder({
      amountPaise,
      currency: session.currency,
      receipt: session.id,
    });

    const { data, error } = await ctx.supabase.rpc("create_razorpay_payment_intent", {
      p_checkout_session_id: session.id,
      p_provider_order_id: razorpayOrder.id,
      p_amount: session.grand_total,
      p_currency: session.currency,
    });

    if (error || !data || data.length === 0) {
      return { ok: false, error: "Could not start payment. Please try again." };
    }

    const row = data[0]!;
    const { keyId } = getRazorpayConfig();

    return {
      ok: true,
      razorpayOrderId: row.out_provider_order_id,
      amountPaise: rupeesToPaise(row.out_amount),
      currency: row.out_currency,
      keyId,
    };
  } catch (err) {
    if (err instanceof RazorpayError) return { ok: false, error: toSafeClientMessage(err) };
    return { ok: false, error: "Could not start payment. Please try again." };
  }
}

export type VerifyRazorpayPaymentResult =
  | { ok: true; orderId: string; orderNumber: string }
  | { ok: false; error: string };

// Called from the customer's own browser immediately after Razorpay
// Checkout's success callback. This is NOT the source of truth for
// "payment succeeded" — it is one input that must independently pass:
//   1. HMAC signature verification (proves the triple wasn't forged)
//   2. an authoritative Razorpay API fetch of the payment (proves it is
//      genuinely captured, for the right order, right now — never trusts
//      the browser's own claim of success)
// before confirm_razorpay_payment_and_finalize() (DB-side) ever runs. The
// webhook (app/api/webhooks/razorpay/route.ts) performs the exact same two
// checks independently and calls the same RPC — this function is not the
// only path to a confirmed order, only the fast one.
export async function verifyRazorpayPaymentAction(params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): Promise<VerifyRazorpayPaymentResult> {
  if (!params.razorpayOrderId || !params.razorpayPaymentId || !params.razorpaySignature) {
    return { ok: false, error: "Missing payment confirmation details." };
  }

  const ctx = await requireCustomerContext();
  if (ctx.error) return { ok: false, error: ctx.error };

  let keySecret: string;
  try {
    keySecret = getRazorpayConfig().keySecret;
  } catch {
    return { ok: false, error: "Payment could not be processed right now. Please try again." };
  }

  const signatureValid = verifyCheckoutSignature({
    orderId: params.razorpayOrderId,
    paymentId: params.razorpayPaymentId,
    signature: params.razorpaySignature,
    keySecret,
  });

  if (!signatureValid) {
    return {
      ok: false,
      error: "We could not verify this payment. Please contact support if you were charged.",
    };
  }

  try {
    const payment = await fetchRazorpayPayment(params.razorpayPaymentId);

    if (payment.order_id !== params.razorpayOrderId) {
      return { ok: false, error: "This payment does not match the expected order." };
    }
    if (payment.status !== "captured") {
      return { ok: false, error: "Payment has not been completed yet." };
    }

    const { data, error } = await ctx.supabase.rpc("confirm_razorpay_payment_and_finalize", {
      p_provider_order_id: payment.order_id,
      p_provider_payment_id: payment.id,
      p_amount: paiseToRupees(payment.amount),
      p_currency: payment.currency,
    });

    if (error || !data || data.length === 0) {
      return {
        ok: false,
        error: "Could not confirm your payment. Please contact support if you were charged.",
      };
    }

    const row = data[0]!;
    return { ok: true, orderId: row.out_order_id, orderNumber: row.out_order_number };
  } catch (err) {
    if (err instanceof RazorpayError) return { ok: false, error: toSafeClientMessage(err) };
    return { ok: false, error: "Could not confirm your payment. Please try again." };
  }
}
