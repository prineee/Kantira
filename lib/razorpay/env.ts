import { RazorpayError } from "./errors";

// Server-only config — same rule as lib/shiprocket/env.ts: never import
// this from a Client Component. RAZORPAY_KEY_SECRET and
// RAZORPAY_WEBHOOK_SECRET must never reach the browser; RAZORPAY_KEY_ID
// alone is safe to expose (Razorpay Checkout's own JS widget requires it
// client-side to open the payment sheet) but is still read from a
// server-only var here and passed to the client explicitly and only where
// needed (see app/checkout/razorpay-actions.ts), never via NEXT_PUBLIC_.

export type RazorpayConfig = {
  keyId: string;
  keySecret: string;
};

let cachedConfig: RazorpayConfig | null = null;

export function getRazorpayConfig(): RazorpayConfig {
  if (cachedConfig) return cachedConfig;

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  const missing = [!keyId && "RAZORPAY_KEY_ID", !keySecret && "RAZORPAY_KEY_SECRET"].filter(
    Boolean,
  );

  if (missing.length > 0) {
    throw new RazorpayError(
      "config",
      `Missing Razorpay server configuration: ${missing.join(", ")}`,
    );
  }

  cachedConfig = { keyId: keyId!, keySecret: keySecret! };
  return cachedConfig;
}

// Read separately from getRazorpayConfig(): the webhook route must fail
// closed (reject, never process as trusted) when this is absent, which is
// a distinct failure path from "can't create a payment order."
export function getRazorpayWebhookSecret(): string | null {
  return process.env.RAZORPAY_WEBHOOK_SECRET || null;
}

/** Test-only: clears the cached config so a test can exercise a different
 * env-var scenario within the same process. Not used by any production
 * code path. */
export function _resetRazorpayConfigForTests(): void {
  cachedConfig = null;
}
