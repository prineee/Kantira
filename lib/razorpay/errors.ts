// Normalized error type for the Razorpay integration — same shape/intent
// as lib/shiprocket/errors.ts: every failure path resolves to one of these
// so callers never see a raw Razorpay payload, secret, or stack trace.

export type RazorpayErrorKind =
  | "config" // missing/invalid server env config (RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET)
  | "invalid_input" // failed KANTIRA-side validation before any request was sent
  | "network" // fetch threw (DNS, connection reset, etc.)
  | "timeout"
  | "invalid_signature" // HMAC verification failed (checkout callback or webhook)
  | "payment_mismatch" // authoritative payment data doesn't match the checkout it claims to belong to
  | "api_error" // any other non-success Razorpay response
  | "unknown";

export class RazorpayError extends Error {
  readonly kind: RazorpayErrorKind;
  readonly httpStatus?: number;

  constructor(
    kind: RazorpayErrorKind,
    message: string,
    opts?: { httpStatus?: number; cause?: unknown },
  ) {
    super(message, opts?.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = "RazorpayError";
    this.kind = kind;
    this.httpStatus = opts?.httpStatus;
  }
}

/** A message safe to show a customer — never Razorpay's raw text, and
 * never a hint about which specific server-side check failed for the
 * security-sensitive kinds (invalid_signature/payment_mismatch). */
export function toSafeClientMessage(err: RazorpayError): string {
  switch (err.kind) {
    case "invalid_input":
      return err.message; // KANTIRA's own validation message, already safe
    case "timeout":
    case "network":
      return "Could not reach the payment provider. Please try again.";
    case "invalid_signature":
    case "payment_mismatch":
      return "We could not verify this payment. Please contact support if you were charged.";
    default:
      return "Payment could not be processed right now. Please try again.";
  }
}

/** Strips anything that could be a credential/secret before logging. */
export function redactForLog(input: unknown): unknown {
  const SENSITIVE_KEYS = new Set([
    "key_secret",
    "razorpay_key_secret",
    "webhook_secret",
    "razorpay_webhook_secret",
    "razorpay_signature",
    "signature",
    "authorization",
  ]);

  function walk(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        out[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? "[REDACTED]" : walk(v);
      }
      return out;
    }
    return value;
  }

  return walk(input);
}
