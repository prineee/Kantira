import { ShiprocketError } from "./errors";

// Server-only config. This file must never be imported from a Client
// Component — it reads plain (non-NEXT_PUBLIC_) env vars, which Next.js
// already keeps out of the browser bundle by convention (see
// .env.local.example's SUPABASE_SERVICE_ROLE_KEY comment for the same rule
// applied to Supabase). Importing this from client code would fail at
// build/runtime rather than silently leak, since these vars are undefined
// in the browser bundle.

export type ShiprocketConfig = {
  baseUrl: string;
  email: string;
  password: string;
};

let cachedConfig: ShiprocketConfig | null = null;

export function getShiprocketConfig(): ShiprocketConfig {
  if (cachedConfig) return cachedConfig;

  const baseUrl = process.env.SHIPROCKET_API_BASE_URL;
  const email = process.env.SHIPROCKET_API_EMAIL;
  const password = process.env.SHIPROCKET_API_PASSWORD;

  const missing = [
    !baseUrl && "SHIPROCKET_API_BASE_URL",
    !email && "SHIPROCKET_API_EMAIL",
    !password && "SHIPROCKET_API_PASSWORD",
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new ShiprocketError(
      "config",
      `Missing Shiprocket server configuration: ${missing.join(", ")}`,
    );
  }

  cachedConfig = { baseUrl: baseUrl!, email: email!, password: password! };
  return cachedConfig;
}

// Read separately from getShiprocketConfig(): the webhook route must fail
// closed (reject, never process as trusted) when this is absent — a
// distinct failure path from "can't call the Shiprocket API." Mirrors
// lib/razorpay/env.ts's getRazorpayWebhookSecret() exactly.
export function getShiprocketWebhookSecret(): string | null {
  return process.env.SHIPROCKET_WEBHOOK_SECRET || null;
}

/** Test-only: clears the cached config so a test can exercise a different
 * env-var scenario within the same process. Not used by any production
 * code path. */
export function _resetShiprocketConfigForTests(): void {
  cachedConfig = null;
}
