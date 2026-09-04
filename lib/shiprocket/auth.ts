import { getShiprocketConfig } from "./env";
import { ShiprocketError } from "./errors";
import type { ShiprocketAuthProfile } from "./types";

// Server-only. Never import from a Client Component.
//
// Verified live (2026-09-02) against POST {baseUrl}/auth/login:
//   - success: HTTP 200, body { token, id, first_name, last_name, email,
//     company_id, created_at }. `token` is a JWT. NO expiry field is
//     returned anywhere in this response — confirmed by inspecting every
//     top-level key, not assumed absent.
//   - failure (bad credentials): HTTP 403, body { message, status_code }.
//
// Because no expiry is ever returned, this module does NOT guess a TTL and
// proactively expire the cached token. Instead it caches the token for the
// life of the server process and only re-authenticates reactively, when a
// downstream call reports 401 (see client.ts). This is the one caching
// strategy that doesn't require inventing an undocumented expiry value.
//
// Caching is a module-level variable, i.e. per server process/instance —
// consistent with this being a long-lived Node server (next start), not
// edge/serverless functions. If KANTIRA later deploys to a serverless
// platform where each invocation gets a fresh module scope, this cache
// becomes a no-op (every call re-authenticates) rather than silently
// incorrect — that is a known limitation to revisit at that time, not
// something this phase should solve by inventing external infrastructure
// (e.g. storing the token in a database), which the phase instructions
// explicitly rule out.

let cachedToken: string | null = null;

let TIMEOUT_MS = 15_000;

/** Test-only: overrides the default request timeout so a test can exercise
 * real abort behavior without waiting out the production timeout. Not used
 * by any production code path. */
export function _setTimeoutMsForTests(ms: number): void {
  TIMEOUT_MS = ms;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new ShiprocketError("timeout", "Shiprocket request timed out.", { cause: err });
    }
    throw new ShiprocketError("network", "Could not reach Shiprocket.", { cause: err });
  } finally {
    clearTimeout(timer);
  }
}

async function authenticate(): Promise<string> {
  const config = getShiprocketConfig();

  const res = await fetchWithTimeout(`${config.baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: config.email, password: config.password }),
  });

  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(text);
  } catch {
    // fall through to the !json branch below
  }

  if (!res.ok || !json || typeof json.token !== "string" || json.token.length === 0) {
    // Deliberately do not include `text`/`json` in the thrown error — the
    // failure body's only observed shape ({ message, status_code }) is
    // already non-secret, but keeping this generic avoids ever depending on
    // Shiprocket's wording for KANTIRA's own error messaging.
    throw new ShiprocketError("auth_failed", "Shiprocket authentication failed.", {
      httpStatus: res.status,
    });
  }

  cachedToken = json.token;
  return cachedToken;
}

export async function getShiprocketToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  return authenticate();
}

/** Call when a downstream request comes back 401 even with a cached token
 * present, then retry once with the freshly re-authenticated token. */
export function invalidateShiprocketToken(): void {
  cachedToken = null;
}

/** Re-authenticates and returns the auth profile without exposing the
 * token — useful only for a future admin/diagnostics surface, not needed by
 * the quote path itself. */
export async function getShiprocketAuthProfile(): Promise<ShiprocketAuthProfile> {
  const config = getShiprocketConfig();
  const res = await fetchWithTimeout(`${config.baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: config.email, password: config.password }),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok || typeof json.token !== "string") {
    throw new ShiprocketError("auth_failed", "Shiprocket authentication failed.", {
      httpStatus: res.status,
    });
  }
  cachedToken = json.token;
  return {
    id: json.id as number,
    companyId: json.company_id as number,
    firstName: json.first_name as string,
    lastName: json.last_name as string,
    createdAt: json.created_at as string,
  };
}

export { fetchWithTimeout, TIMEOUT_MS };
