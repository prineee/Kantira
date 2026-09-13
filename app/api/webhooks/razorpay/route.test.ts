import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { handleRazorpayWebhookCore, type WebhookDeps } from "./route";
import type { RazorpayPayment } from "@/lib/razorpay/client";

const SECRET = "whsec_test";
const ORDER_ID = "order_ABC";
const PAYMENT_ID = "pay_XYZ";
const INTENT = { id: "intent-1", organization_id: "org-1" };

function sign(body: string): string {
  return createHmac("sha256", SECRET).update(body).digest("hex");
}

function capturedPayload(event: string, extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    event,
    payload: { payment: { entity: { id: PAYMENT_ID, order_id: ORDER_ID, ...extra } } },
  });
}

function makeDeps(overrides: Partial<WebhookDeps> & { events?: unknown[]; insertShouldConflict?: boolean } = {}) {
  const events: unknown[] = overrides.events ?? [];
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];

  const supabase = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: table === "payment_intents" ? INTENT : null }),
          }),
        }),
      }),
      insert: async (row: Record<string, unknown>) => {
        if (overrides.insertShouldConflict) {
          return { error: { code: "23505" } };
        }
        events.push(row);
        return { error: null };
      },
    }),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return { error: null };
    },
  };

  const deps: WebhookDeps = {
    getWebhookSecret: () => SECRET,
    verifySignature: ({ rawBody, signature, webhookSecret }) => sign(rawBody) === signature && webhookSecret === SECRET,
    fetchPayment: async (): Promise<RazorpayPayment> => ({
      id: PAYMENT_ID,
      order_id: ORDER_ID,
      amount: 10000,
      currency: "INR",
      status: "captured",
    }),
    getSupabase: () => supabase as never,
    ...overrides,
  };

  return { deps, events, rpcCalls };
}

test("fails closed when RAZORPAY_WEBHOOK_SECRET is not configured, never processes the payload", async () => {
  const { deps, rpcCalls } = makeDeps({ getWebhookSecret: () => null });
  const body = capturedPayload("payment.captured");
  const result = await handleRazorpayWebhookCore(body, sign(body), deps);
  assert.equal(result.status, 500);
  assert.equal(rpcCalls.length, 0);
});

test("rejects a request with no signature header at all", async () => {
  const { deps, rpcCalls } = makeDeps();
  const body = capturedPayload("payment.captured");
  const result = await handleRazorpayWebhookCore(body, null, deps);
  assert.equal(result.status, 400);
  assert.equal(rpcCalls.length, 0);
});

test("rejects an invalid/tampered signature and never processes the payload", async () => {
  const { deps, rpcCalls } = makeDeps();
  const body = capturedPayload("payment.captured");
  const result = await handleRazorpayWebhookCore(body, "not-the-real-signature", deps);
  assert.equal(result.status, 400);
  assert.equal(rpcCalls.length, 0);
});

test("does not trust the webhook's own 'captured' claim — re-fetches authoritative state before finalizing", async () => {
  let fetchPaymentCalled = false;
  const { deps, rpcCalls } = makeDeps({
    fetchPayment: async () => {
      fetchPaymentCalled = true;
      return { id: PAYMENT_ID, order_id: ORDER_ID, amount: 10000, currency: "INR", status: "captured" };
    },
  });
  const body = capturedPayload("payment.captured");
  const result = await handleRazorpayWebhookCore(body, sign(body), deps);

  assert.equal(result.status, 200);
  assert.equal(fetchPaymentCalled, true);
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0]!.fn, "confirm_razorpay_payment_and_finalize");
});

test("does not finalize when the authoritative re-fetch says the payment is NOT captured", async () => {
  const { deps, rpcCalls } = makeDeps({
    fetchPayment: async () => ({ id: PAYMENT_ID, order_id: ORDER_ID, amount: 10000, currency: "INR", status: "authorized" }),
  });
  const body = capturedPayload("payment.captured");
  const result = await handleRazorpayWebhookCore(body, sign(body), deps);
  assert.equal(result.status, 200);
  assert.equal(rpcCalls.length, 0);
});

test("payment.failed marks the intent failed, never calls finalize", async () => {
  const { deps, rpcCalls } = makeDeps();
  const body = capturedPayload("payment.failed");
  const result = await handleRazorpayWebhookCore(body, sign(body), deps);
  assert.equal(result.status, 200);
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0]!.fn, "mark_razorpay_payment_failed");
});

test("a finalize RPC error (e.g. deterministic inventory-reservation failure) fails closed with a non-2xx so Razorpay retries, never a false 200", async () => {
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  const supabase = {
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: INTENT }) }) }) }),
      insert: async () => ({ error: null }),
    }),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return { error: { message: "Insufficient stock for item x at store y: available 0, requested 1" } };
    },
  };
  const { deps } = makeDeps({ getSupabase: () => supabase as never });
  const body = capturedPayload("payment.captured");
  const result = await handleRazorpayWebhookCore(body, sign(body), deps);
  assert.equal(result.status, 500);
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0]!.fn, "confirm_razorpay_payment_and_finalize");
});

test("a mark-failed RPC error also fails closed with a non-2xx", async () => {
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  const supabase = {
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: INTENT }) }) }) }),
      insert: async () => ({ error: null }),
    }),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return { error: { message: "unexpected" } };
    },
  };
  const { deps } = makeDeps({ getSupabase: () => supabase as never });
  const body = capturedPayload("payment.failed");
  const result = await handleRazorpayWebhookCore(body, sign(body), deps);
  assert.equal(result.status, 500);
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0]!.fn, "mark_razorpay_payment_failed");
});

test("duplicate webhook delivery (same event) is acknowledged but not reprocessed", async () => {
  const { deps, rpcCalls } = makeDeps({ insertShouldConflict: true });
  const body = capturedPayload("payment.captured");
  const result = await handleRazorpayWebhookCore(body, sign(body), deps);
  assert.equal(result.status, 200);
  assert.equal((result.body as { duplicate?: boolean }).duplicate, true);
  assert.equal(rpcCalls.length, 0);
});

test("an unrecognized payload shape is rejected before any DB access", async () => {
  const { deps, rpcCalls } = makeDeps();
  const body = JSON.stringify({ event: "payment.captured", payload: {} });
  const result = await handleRazorpayWebhookCore(body, sign(body), deps);
  assert.equal(result.status, 400);
  assert.equal(rpcCalls.length, 0);
});

test("an unknown payment order (no matching payment_intents row) is acknowledged and ignored, not an error", async () => {
  const supabase = {
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
      insert: async () => ({ error: null }),
    }),
    rpc: async () => ({ error: null }),
  };
  const { deps, rpcCalls } = makeDeps({ getSupabase: () => supabase as never });
  const body = capturedPayload("payment.captured");
  const result = await handleRazorpayWebhookCore(body, sign(body), deps);
  assert.equal(result.status, 200);
  assert.equal((result.body as { ignored?: boolean }).ignored, true);
  assert.equal(rpcCalls.length, 0);
});
