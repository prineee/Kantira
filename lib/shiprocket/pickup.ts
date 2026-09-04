import { shiprocketGet } from "./client";
import { ShiprocketError } from "./errors";
import type { ShiprocketPickupLocation } from "./types";

// Server-only. Never import from a Client Component.
//
// Verified live against GET {baseUrl}/settings/company/pickup: HTTP 200,
// body { data: { shipping_address: [ { id, pickup_location, city, state,
// country, pin_code, status, phone_verified, ...many other business/PII
// fields (address, phone, email, gstin, ...) } ] } }.
//
// CORRECTION (Phase 5B-8E, 2026-09-03): the array is nested one level
// deeper than originally implemented here — `data.shipping_address`, not
// `data` itself. The original Phase 5B-8B implementation assumed `data` was
// the array directly; that was never actually exercised against the live
// endpoint (only a standalone verification script was, and that script
// already defensively handled both shapes — this module did not). It went
// undetected because this module's own unit tests mocked the wrong shape
// too. Discovered and fixed via a real end-to-end UAT run in Phase 5B-8E —
// see lib/shiprocket/pickup.test.ts for the corrected mock shape.
//
// Only the fields KANTIRA actually needs for pickup-location selection are
// surfaced here — the rest (address lines, phone, email, gstin, lat/long,
// etc.) are read but intentionally dropped rather than plumbed further,
// since no feature needs them yet and they're more sensitive than a
// nickname/city/state.
//
// This module only reads the account's existing pickup locations. It never
// creates, updates, or deletes one — Shiprocket pickup-location mapping to
// a KANTIRA store is a separate, not-yet-authorized step (see
// PHASE_5B-8B docs: "PICKUP MAPPING REQUIRED BEFORE LIVE ORDER CREATION").

type RawPickupLocation = {
  id: number;
  pickup_location: string;
  city: string;
  state: string;
  country: string;
  pin_code: string;
  status: number;
  phone_verified: number;
};

export async function listPickupLocations(): Promise<ShiprocketPickupLocation[]> {
  const json = await shiprocketGet("/settings/company/pickup");

  const data = (json as { data?: { shipping_address?: unknown } } | null)?.data
    ?.shipping_address;
  if (!Array.isArray(data)) {
    throw new ShiprocketError("api_error", "Shiprocket pickup-location response was malformed.");
  }

  return (data as RawPickupLocation[]).map((loc) => ({
    id: loc.id,
    nickname: loc.pickup_location,
    city: loc.city,
    state: loc.state,
    country: loc.country,
    pinCode: loc.pin_code,
    status: loc.status,
    phoneVerified: loc.phone_verified === 1,
  }));
}
