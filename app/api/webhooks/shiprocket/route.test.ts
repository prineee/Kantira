import test from "node:test";
import assert from "node:assert/strict";
import { handleShiprocketWebhookCore, type ShiprocketWebhookDeps } from "@/lib/shiprocket/webhook";

const SECRET = "whsec_shiprocket_test";

function makeDeps(
  overrides: Partial<ShiprocketWebhookDeps> & { rpcResult?: { data: unknown; error: unknown } } = {},
) {
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];

  const supabase = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return overrides.rpcResult ?? { data: [{ matched: true, is_new_event: true }], error: null };
    },
  };

  const deps: ShiprocketWebhookDeps = {
    getWebhookSecret: () => SECRET,
    verifySecret: (headerValue, secret) => headerValue === secret,
    getSupabase: () => supabase as never,
    ...overrides,
  };

  return { deps, rpcCalls };
}

function payload(extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    awb: "AWB123",
    shipment_id: 67890,
    current_status: "IN TRANSIT",
    event_id: "evt-1",
    ...extra,
  });
}

test("fails closed when SHIPROCKET_WEBHOOK_SECRET is not configured, never processes the payload", async () => {
  const { deps, rpcCalls } = makeDeps({ getWebhookSecret: () => null });
  const result = await handleShiprocketWebhookCore(payload(), SECRET, deps);
  assert.equal(result.status, 500);
  assert.equal(rpcCalls.length, 0);
});

test("rejects a request with no x-api-key header at all", async () => {
  const { deps, rpcCalls } = makeDeps();
  const result = await handleShiprocketWebhookCore(payload(), null, deps);
  assert.equal(result.status, 401);
  assert.equal(rpcCalls.length, 0);
});

test("rejects a mismatched secret and never processes the payload", async () => {
  const { deps, rpcCalls } = makeDeps();
  const result = await handleShiprocketWebhookCore(payload(), "not-the-real-secret", deps);
  assert.equal(result.status, 401);
  assert.equal(rpcCalls.length, 0);
});

test("a malformed (non-JSON) body is rejected before any DB access", async () => {
  const { deps, rpcCalls } = makeDeps();
  const result = await handleShiprocketWebhookCore("not json", SECRET, deps);
  assert.equal(result.status, 400);
  assert.equal(rpcCalls.length, 0);
});

test("a payload with neither awb nor shipment_id is rejected before any DB access", async () => {
  const { deps, rpcCalls } = makeDeps();
  const body = JSON.stringify({ current_status: "IN TRANSIT" });
  const result = await handleShiprocketWebhookCore(body, SECRET, deps);
  assert.equal(result.status, 400);
  assert.equal(rpcCalls.length, 0);
});

test("a verified event is recorded via record_shipment_webhook_event with the raw payload attached", async () => {
  const { deps, rpcCalls } = makeDeps();
  const result = await handleShiprocketWebhookCore(payload(), SECRET, deps);
  assert.equal(result.status, 200);
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0]!.fn, "record_shipment_webhook_event");
  assert.equal(rpcCalls[0]!.args.p_awb, "AWB123");
  assert.equal(rpcCalls[0]!.args.p_provider_shipment_id, "67890");
  assert.equal(rpcCalls[0]!.args.p_tracking_status, "IN TRANSIT");
  assert.deepEqual(rpcCalls[0]!.args.p_raw_payload, JSON.parse(payload()));
});

test("no shipment matches the provider identifiers — acknowledged and ignored, not an error", async () => {
  const { deps, rpcCalls } = makeDeps({ rpcResult: { data: [{ matched: false, is_new_event: false }], error: null } });
  const result = await handleShiprocketWebhookCore(payload(), SECRET, deps);
  assert.equal(result.status, 200);
  assert.equal((result.body as { ignored?: boolean }).ignored, true);
  assert.equal(rpcCalls.length, 1);
});

test("a duplicate event (already recorded) is acknowledged but not treated as new", async () => {
  const { deps, rpcCalls } = makeDeps({ rpcResult: { data: [{ matched: true, is_new_event: false }], error: null } });
  const result = await handleShiprocketWebhookCore(payload(), SECRET, deps);
  assert.equal(result.status, 200);
  assert.equal((result.body as { duplicate?: boolean }).duplicate, true);
  assert.equal(rpcCalls.length, 1);
});

test("an RPC error fails closed with a non-2xx so Shiprocket retries, never a false 200", async () => {
  const { deps, rpcCalls } = makeDeps({ rpcResult: { data: null, error: { message: "db error" } } });
  const result = await handleShiprocketWebhookCore(payload(), SECRET, deps);
  assert.equal(result.status, 500);
  assert.equal(rpcCalls.length, 1);
});

test("builds a stable idempotency key from event type + awb + timestamp when no explicit event id is present", async () => {
  const { deps, rpcCalls } = makeDeps();
  const body = JSON.stringify({ awb: "AWB123", current_status: "DELIVERED", current_timestamp: "2026-09-14T10:00:00Z" });
  await handleShiprocketWebhookCore(body, SECRET, deps);
  assert.equal(rpcCalls[0]!.args.p_provider_event_id, "DELIVERED:AWB123:2026-09-14T10:00:00Z");
});

test("route module exports only the POST route handler, never the reusable webhook core (the export shape that broke the Vercel build)", async () => {
  const routeModule = await import("./route");
  assert.deepEqual(Object.keys(routeModule), ["POST"]);
});
