import { getRazorpayConfig } from "./env";
import { RazorpayError } from "./errors";

// Server-only. Never import from a Client Component. Raw fetch, no SDK
// dependency — same approach lib/shiprocket/client.ts already uses for
// this codebase's other external payment/shipping integration, so this
// doesn't introduce a new supply-chain dependency for a security-sensitive
// integration.

const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";
const TIMEOUT_MS = 15_000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new RazorpayError("timeout", "Razorpay request timed out.", { cause: err });
    }
    throw new RazorpayError("network", "Could not reach Razorpay.", { cause: err });
  } finally {
    clearTimeout(timer);
  }
}

function authHeader(): string {
  const { keyId, keySecret } = getRazorpayConfig();
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetchWithTimeout(`${RAZORPAY_API_BASE}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: authHeader(),
    },
  });

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new RazorpayError("api_error", "Razorpay returned an unparseable response.", {
      httpStatus: res.status,
    });
  }

  if (!res.ok) {
    throw new RazorpayError("api_error", "Razorpay returned an error response.", {
      httpStatus: res.status,
    });
  }

  return json as T;
}

export type RazorpayOrder = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  receipt: string | null;
};

// Creates a Razorpay Order — the gateway-side object the browser's
// Checkout widget opens against. `amountPaise` must already be the
// authoritative amount derived from the server-side checkout snapshot
// (see app/checkout/razorpay-actions.ts) — this function has no opinion on
// pricing, it only forwards whatever integer paise amount it's given.
export async function createRazorpayOrder(params: {
  amountPaise: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> {
  if (!Number.isInteger(params.amountPaise) || params.amountPaise <= 0) {
    throw new RazorpayError("invalid_input", "Order amount must be a positive integer (paise).");
  }

  return request<RazorpayOrder>("/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: params.amountPaise,
      currency: params.currency,
      receipt: params.receipt,
      notes: params.notes,
      payment_capture: 1, // auto-capture — this integration never manually captures an authorized-only payment
    }),
  });
}

export type RazorpayPayment = {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
};

// Authoritative fetch of a payment's current state directly from Razorpay
// — this, not the browser's success callback and not the webhook payload
// alone, is what payment finalization ultimately trusts for
// amount/currency/order/status.
export async function fetchRazorpayPayment(paymentId: string): Promise<RazorpayPayment> {
  if (!/^pay_[A-Za-z0-9]+$/.test(paymentId)) {
    throw new RazorpayError("invalid_input", "Invalid Razorpay payment id.");
  }
  return request<RazorpayPayment>(`/payments/${paymentId}`, { method: "GET" });
}
