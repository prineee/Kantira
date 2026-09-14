import { timingSafeEqual } from "node:crypto";

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
