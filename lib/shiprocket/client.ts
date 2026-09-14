import { getShiprocketConfig } from "./env";
import { getShiprocketToken, invalidateShiprocketToken, fetchWithTimeout } from "./auth";
import { ShiprocketError } from "./errors";

// Server-only. Never import from a Client Component.
//
// Thin wrapper around fetch for authenticated, read-only Shiprocket calls.
// Handles: base URL + auth header, timeout, one 401 -> re-auth -> retry
// cycle, and turning any non-2xx response into a ShiprocketError. Callers
// get back parsed JSON (`unknown`) and normalize it themselves against the
// specific verified contract for that endpoint (see serviceability.ts,
// pickup.ts) — this file has no opinion on any endpoint's shape.

async function requestOnce(
  path: string,
  token: string,
  method: "GET" | "POST",
  body?: unknown,
): Promise<Response> {
  const config = getShiprocketConfig();
  return fetchWithTimeout(`${config.baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function request(path: string, method: "GET" | "POST", body?: unknown): Promise<unknown> {
  let token = await getShiprocketToken();
  let res = await requestOnce(path, token, method, body);

  if (res.status === 401) {
    // Verified live (GET path only — see auth.ts): an invalid/expired token
    // gets HTTP 401 with body { error_id, message, status_code, timestamp }.
    // Since no expiry is ever returned at login, this is the only signal we
    // have that the cached token has gone stale — re-authenticate once and
    // retry, rather than looping. Applied identically to POST: a stale
    // token is a stale token regardless of verb, and re-sending an
    // unauthenticated mutation (never one that already reached Shiprocket's
    // business logic) is safe — the 401 happens at the auth layer, before
    // any order/shipment mutation is attempted server-side by Shiprocket.
    invalidateShiprocketToken();
    token = await getShiprocketToken();
    res = await requestOnce(path, token, method, body);
  }

  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ShiprocketError("api_error", "Shiprocket returned an unparseable response.", {
      httpStatus: res.status,
    });
  }

  if (!res.ok) {
    if (res.status === 401) {
      throw new ShiprocketError("unauthorized", "Shiprocket rejected the request as unauthorized.", {
        httpStatus: res.status,
      });
    }
    throw new ShiprocketError("api_error", "Shiprocket returned an error response.", {
      httpStatus: res.status,
    });
  }

  return json;
}

export async function shiprocketGet(path: string): Promise<unknown> {
  return request(path, "GET");
}

// Mutation calls (order/AWB creation) reuse the exact same auth/retry/
// timeout/error-normalization path as shiprocketGet — nothing about
// KANTIRA's side of the contract differs for a POST; only the verified
// response *shape* per endpoint differs, and that's each caller's own
// responsibility (see order.ts), exactly like shiprocketGet already
// delegates shape-normalization to serviceability.ts/pickup.ts.
export async function shiprocketPost(path: string, body: unknown): Promise<unknown> {
  return request(path, "POST", body);
}
