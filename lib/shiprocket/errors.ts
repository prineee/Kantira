// Normalized error type for the Shiprocket integration. Every failure path
// in this module (config, network, timeout, auth, API-level) resolves to
// one of these so callers never see a raw Shiprocket payload or stack trace.

export type ShiprocketErrorKind =
  | "config" // missing/invalid server env config
  | "invalid_input" // failed KANTIRA-side validation before any request was sent
  | "network" // fetch threw (DNS, connection reset, etc.)
  | "timeout"
  | "auth_failed" // login rejected (bad credentials)
  | "unauthorized" // a business-data call came back 401 even after one re-auth attempt
  | "not_serviceable" // Shiprocket returned a business-level "no courier"/invalid-pincode result
  | "api_error" // any other non-success Shiprocket response
  | "unknown";

export class ShiprocketError extends Error {
  readonly kind: ShiprocketErrorKind;
  /** HTTP status of the underlying response, when there was one. */
  readonly httpStatus?: number;
  /** Shiprocket's own inner `status`/`status_code` field, when present.
   * Verified live: serviceability failures return HTTP 200 with an inner
   * status of 400 (invalid pincode) or 404 (no courier serviceable) — this
   * field is what actually carries the failure code in that case. */
  readonly shiprocketStatus?: number;

  constructor(
    kind: ShiprocketErrorKind,
    message: string,
    opts?: { httpStatus?: number; shiprocketStatus?: number; cause?: unknown },
  ) {
    super(message, opts?.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = "ShiprocketError";
    this.kind = kind;
    this.httpStatus = opts?.httpStatus;
    this.shiprocketStatus = opts?.shiprocketStatus;
  }
}

/** A message safe to show a customer/client — never Shiprocket's raw text
 * for kinds that could leak account/internal detail. */
export function toSafeClientMessage(err: ShiprocketError): string {
  switch (err.kind) {
    case "invalid_input":
      return err.message; // KANTIRA's own validation message, already safe
    case "not_serviceable":
      return "Delivery is not currently available for this address.";
    case "timeout":
    case "network":
      return "Could not reach the shipping provider. Please try again.";
    default:
      return "Unable to calculate shipping right now. Please try again.";
  }
}

/** Strips anything that could be a credential/token before logging. Use
 * this on any object derived from request/response data before it is ever
 * passed to console/log output. */
export function redactForLog(input: unknown): unknown {
  const SENSITIVE_KEYS = new Set([
    "token",
    "authorization",
    "password",
    "email",
    "shiprocket_api_password",
    "shiprocket_api_email",
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
