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

async function requestOnce(path: string, token: string): Promise<Response> {
  const config = getShiprocketConfig();
  return fetchWithTimeout(`${config.baseUrl}${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function shiprocketGet(path: string): Promise<unknown> {
  let token = await getShiprocketToken();
  let res = await requestOnce(path, token);

  if (res.status === 401) {
    // Verified live: an invalid/expired token gets HTTP 401 with body
    // { error_id, message, status_code, timestamp }. Since no expiry is
    // ever returned at login (see auth.ts), this is the only signal we
    // have that the cached token has gone stale — re-authenticate once and
    // retry, rather than looping.
    invalidateShiprocketToken();
    token = await getShiprocketToken();
    res = await requestOnce(path, token);
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
