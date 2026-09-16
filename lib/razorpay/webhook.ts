import { verifyWebhookSignature } from "@/lib/razorpay/signature";
import { getRazorpayWebhookSecret } from "@/lib/razorpay/env";
import { fetchRazorpayPayment, type RazorpayPayment } from "@/lib/razorpay/client";
import { paiseToRupees } from "@/lib/razorpay/money";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { Json } from "@/types/database";

// Reusable webhook-processing core, split out of
// app/api/webhooks/razorpay/route.ts so that Route Handler module only
// exports the HTTP method handlers Next.js expects (POST) — no other
// export from a route.ts file is treated as a route by Next.js, but this
// keeps the module boundary unambiguous.
//
// This is Razorpay's independent server-side confirmation/recovery path —
// the browser's own post-Checkout callback (app/checkout/razorpay-actions.ts)
// is the fast path, but this is what makes payment confirmation reliable
// even if the customer's tab closes, the network drops, or the browser
// callback simply never runs.
//
// This is the one place in the whole Phase 4D surface that a Postgres
// `service_role` client is used, and only after signature verification —
// see lib/supabase/service-role.ts's own comment for the full rationale.
//
// handleRazorpayWebhookCore() takes its collaborators as parameters
// (defaulted to the real ones) purely so tests can exercise signature
// rejection / idempotency / event routing without a live Supabase
// instance or a real Razorpay account — same pattern
// app/checkout/actions.ts's getCheckoutShippingQuoteCore() already uses.
// Application code should only ever hit the exported POST handler in
// route.ts.

type SupabaseLike = {
  from: (table: "payment_intents" | "payment_events") => {
    select: (columns: string) => {
      eq: (
        col: string,
        val: string,
      ) => { eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: unknown }> } };
    };
    insert: (row: Record<string, unknown>) => Promise<{ error: { code?: string; message?: string } | null }>;
  };
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: unknown }>;
};

export type WebhookDeps = {
  getWebhookSecret: () => string | null;
  verifySignature: (params: { rawBody: string; signature: string; webhookSecret: string }) => boolean;
  fetchPayment: (paymentId: string) => Promise<RazorpayPayment>;
  getSupabase: () => SupabaseLike;
};

const realDeps: WebhookDeps = {
  getWebhookSecret: getRazorpayWebhookSecret,
  verifySignature: verifyWebhookSignature,
  fetchPayment: fetchRazorpayPayment,
  getSupabase: createServiceRoleClient as unknown as () => SupabaseLike,
};

export type WebhookResult = { status: number; body: Record<string, unknown> };

export async function handleRazorpayWebhookCore(
  rawBody: string,
  signatureHeader: string | null,
  deps: WebhookDeps = realDeps,
): Promise<WebhookResult> {
  const webhookSecret = deps.getWebhookSecret();
  if (!webhookSecret) {
    // Fail closed: never process a webhook as trusted when this
    // environment has no secret configured to verify it against.
    return { status: 500, body: { error: "Webhook not configured" } };
  }

  if (!signatureHeader || !deps.verifySignature({ rawBody, signature: signatureHeader, webhookSecret })) {
    return { status: 400, body: { error: "Invalid signature" } };
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: "Malformed payload" } };
  }

  const eventType = typeof payload.event === "string" ? payload.event : null;
  const paymentEntity = (payload.payload as Record<string, unknown> | undefined)?.payment as
    | { entity?: Record<string, unknown> }
    | undefined;
  const entity = paymentEntity?.entity;
  const paymentId = typeof entity?.id === "string" ? entity.id : null;
  const orderId = typeof entity?.order_id === "string" ? entity.order_id : null;

  if (!eventType || !paymentId || !orderId) {
    return { status: 400, body: { error: "Unrecognized payload shape" } };
  }

  // Razorpay does not universally guarantee a stable top-level webhook
  // delivery id across all account/API configurations — build the
  // idempotency key from fields that are unambiguously always present:
  // the event type plus the payment entity's own id. A genuine redelivery
  // of the same event carries the exact same pair every time.
  const providerEventId =
    typeof payload.id === "string" && payload.id ? payload.id : `${eventType}:${paymentId}`;

  const supabase = deps.getSupabase();

  const { data: intentRow } = await supabase
    .from("payment_intents")
    .select("id, organization_id")
    .eq("provider", "RAZORPAY")
    .eq("provider_intent_id", orderId)
    .maybeSingle();

  const intent = intentRow as { id: string; organization_id: string } | null;

  if (!intent) {
    // Unknown to us (e.g. a test event, or a resource this integration
    // doesn't track) — acknowledge so Razorpay doesn't retry forever, but
    // do nothing.
    return { status: 200, body: { ok: true, ignored: true } };
  }

  const { error: insertError } = await supabase.from("payment_events").insert({
    organization_id: intent.organization_id,
    payment_intent_id: intent.id,
    provider: "RAZORPAY",
    provider_event_id: providerEventId,
    event_type: eventType,
    raw_payload: payload as unknown as Json,
  });

  if (insertError) {
    // unique_violation on (provider, provider_event_id) — this exact event
    // was already recorded and processed. Acknowledge, do not reprocess.
    if (insertError.code === "23505") {
      return { status: 200, body: { ok: true, duplicate: true } };
    }
    return { status: 500, body: { error: "Could not record webhook event" } };
  }

  try {
    if (eventType === "payment.captured" || eventType === "order.paid") {
      // Re-fetch authoritative state directly from Razorpay — this
      // webhook's own payload saying "captured" is never sufficient on
      // its own.
      const payment = await deps.fetchPayment(paymentId);
      if (payment.status === "captured") {
        // rpc() resolves { data, error } — it does NOT throw on a Postgres
        // exception (e.g. finalize_checkout_session_internal's inventory
        // reservation failing deterministically). Checking `error`
        // explicitly here, rather than only relying on the outer try/catch,
        // is required so that failure still reaches the catch block below
        // and gets a non-2xx/retry response instead of a false 200.
        const { error: rpcError } = await supabase.rpc("confirm_razorpay_payment_and_finalize", {
          p_provider_order_id: payment.order_id,
          p_provider_payment_id: payment.id,
          p_amount: paiseToRupees(payment.amount),
          p_currency: payment.currency,
        });
        if (rpcError) throw rpcError;
      }
    } else if (eventType === "payment.failed") {
      const { error: rpcError } = await supabase.rpc("mark_razorpay_payment_failed", {
        p_provider_order_id: orderId,
      });
      if (rpcError) throw rpcError;
    }
  } catch {
    // Never leak internal error detail. A non-2xx response makes Razorpay
    // retry, which is the correct behavior for a transient failure here —
    // the payment_events row above already guarantees the eventual retry
    // won't double-process once this succeeds.
    return { status: 500, body: { error: "Processing error" } };
  }

  return { status: 200, body: { ok: true } };
}
