import test from "node:test";
import assert from "node:assert/strict";
import { handleShiprocketWebhookCore, type ShiprocketWebhookDeps } from "@/lib/shiprocket/webhook";

// This route is a neutral public alias for
// app/api/webhooks/shiprocket/route.ts (Shiprocket's own webhook URL
// validation rejects URLs containing keywords like "shiprocket"/"sr"/"kr").
// It must reuse handleShiprocketWebhookCore() directly rather than
// duplicating any webhook logic, so these tests exercise the same core
// function's behavior plus the route module's own export shape — they
// deliberately mirror app/api/webhooks/shiprocket/route.test.ts rather than
// re-testing business logic that already has full coverage there.

const SECRET = "whsec_tracking_test";

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

test("route module exports only the POST route handler (never the webhook core or its types)", async () => {
  const routeModule = await import("./route");
  assert.deepEqual(Object.keys(routeModule), ["POST"]);
});

test("invalid x-api-key is rejected and never reaches the database", async () => {
  const { deps, rpcCalls } = makeDeps();
  const result = await handleShiprocketWebhookCore(payload(), "not-the-real-secret", deps);
  assert.equal(result.status, 401);
  assert.equal(rpcCalls.length, 0);
});

test("missing x-api-key header is rejected and never reaches the database", async () => {
  const { deps, rpcCalls } = makeDeps();
  const result = await handleShiprocketWebhookCore(payload(), null, deps);
  assert.equal(result.status, 401);
  assert.equal(rpcCalls.length, 0);
});

test("valid authentication reaches the shared webhook core and records the event exactly as the primary route does", async () => {
  const { deps, rpcCalls } = makeDeps();
  const result = await handleShiprocketWebhookCore(payload(), SECRET, deps);
  assert.equal(result.status, 200);
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0]!.fn, "record_shipment_webhook_event");
  assert.equal(rpcCalls[0]!.args.p_awb, "AWB123");
  assert.equal(rpcCalls[0]!.args.p_provider_shipment_id, "67890");
});
