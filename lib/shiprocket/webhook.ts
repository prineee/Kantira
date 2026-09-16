import { timingSafeEqual } from "node:crypto";
import { getShiprocketWebhookSecret } from "@/lib/shiprocket/env";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { Json } from "@/types/database";

// Server-only. UNVERIFIED CONTRACT (see order.ts/types.ts headers).
//
// Shiprocket's webhook authenticity mechanism (per their published
// dashboard/docs) is a static secret you configure in their panel, which
// they echo back on every webhook POST as the `x-api-key` header — not an
// HMAC signature over the raw body like Razorpay's. This is compared as a
// plain shared secret, not verified as a signature. This has NOT been
// live-confirmed against a real Shiprocket account/webhook delivery from
// this repository — re-confirm the exact header name and mechanism against
// the live dashboard configuration before this is trusted in production
// (Phase 5A-2 Step 10). If Shiprocket's actual mechanism differs, this
// function is the only place that needs to change.
export function verifyShiprocketWebhookSecret(
  headerValue: string | null,
  configuredSecret: string,
): boolean {
  if (!headerValue) return false;

  const a = Buffer.from(headerValue);
  const b = Buffer.from(configuredSecret);
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

// Reusable webhook-processing core, split out of
// app/api/webhooks/shiprocket/route.ts so that Route Handler module only
// exports the HTTP method handlers Next.js expects (POST) — same pattern as
// app/api/webhooks/razorpay/route.ts / lib/razorpay/webhook.ts.
//
// handleShiprocketWebhookCore() takes its collaborators as parameters
// (defaulted to the real ones) purely so tests can exercise secret
// rejection / idempotency / event routing without a live Supabase instance
// or a real Shiprocket account. Application code should only ever hit the
// exported POST handler in route.ts.

type SupabaseLike = {
  rpc: (
    fn: "record_shipment_webhook_event",
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
};

export type ShiprocketWebhookDeps = {
  getWebhookSecret: () => string | null;
  verifySecret: (headerValue: string | null, secret: string) => boolean;
  getSupabase: () => SupabaseLike;
};

const realDeps: ShiprocketWebhookDeps = {
  getWebhookSecret: getShiprocketWebhookSecret,
  verifySecret: verifyShiprocketWebhookSecret,
  getSupabase: createServiceRoleClient as unknown as () => SupabaseLike,
};

export type WebhookResult = { status: number; body: Record<string, unknown> };

function extractString(payload: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value) return value;
    if (typeof value === "number") return String(value);
  }
  return null;
}

export async function handleShiprocketWebhookCore(
  rawBody: string,
  headerValue: string | null,
  deps: ShiprocketWebhookDeps = realDeps,
): Promise<WebhookResult> {
  const secret = deps.getWebhookSecret();
  if (!secret) {
    // Fail closed: never process a webhook as trusted when this
    // environment has no secret configured to verify it against.
    return { status: 500, body: { error: "Webhook not configured" } };
  }

  if (!deps.verifySecret(headerValue, secret)) {
    return { status: 401, body: { error: "Invalid credentials" } };
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: "Malformed payload" } };
  }

  const awb = extractString(payload, ["awb", "awb_code"]);
  const providerShipmentId = extractString(payload, ["shipment_id", "shipment_status_id"]);
  const trackingStatus = extractString(payload, ["current_status", "shipment_status", "status"]);
  const eventType = extractString(payload, ["event_type", "current_status"]) ?? "unknown";
  const timestamp = extractString(payload, ["current_timestamp", "updated_at", "timestamp"]) ?? "";

  if (!awb && !providerShipmentId) {
    return { status: 400, body: { error: "Unrecognized payload shape" } };
  }

  // Shiprocket does not universally guarantee a stable top-level webhook
  // delivery id — build the idempotency key from fields that should be
  // present together for a genuine redelivery of the same event. Best
  // effort, not a verified-unique provider id (see file header).
  const providerEventId =
    extractString(payload, ["event_id", "id"]) ??
    `${eventType}:${awb ?? providerShipmentId}:${timestamp}`;

  const supabase = deps.getSupabase();

  const { data, error } = await supabase.rpc("record_shipment_webhook_event", {
    p_provider: "SHIPROCKET",
    p_provider_event_id: providerEventId,
    p_event_type: eventType,
    p_raw_payload: payload as unknown as Json,
    p_provider_shipment_id: providerShipmentId ?? undefined,
    p_awb: awb ?? undefined,
    p_tracking_status: trackingStatus ?? undefined,
  });

  if (error) {
    // Never leak internal error detail. A non-2xx makes Shiprocket retry,
    // which is correct for a transient failure — the idempotency key above
    // guarantees the eventual retry won't double-process once this
    // succeeds.
    return { status: 500, body: { error: "Processing error" } };
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { matched?: boolean; is_new_event?: boolean }
    | undefined;

  if (!row?.matched) {
    // No shipment in this system matches the provider identifiers — not an
    // error, just nothing to do. Acknowledge so Shiprocket doesn't retry
    // forever.
    return { status: 200, body: { ok: true, ignored: true } };
  }

  if (!row.is_new_event) {
    return { status: 200, body: { ok: true, duplicate: true } };
  }

  return { status: 200, body: { ok: true } };
}
