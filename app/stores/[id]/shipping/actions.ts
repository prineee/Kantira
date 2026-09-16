"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/actions/auth";
import { listPickupLocations } from "@/lib/shiprocket/pickup";
import type { ShiprocketPickupLocation } from "@/lib/shiprocket/types";

// Mirrors store_shipping_config_select_staff RLS (0015) — pickup-location
// mapping is store configuration, not a per-shipment operational action,
// so this is deliberately narrower than STOCK-with-store-access.
const WRITE_ROLES = ["OWNER", "ADMIN"] as const;

type StoresSupabaseClient = NonNullable<Awaited<ReturnType<typeof requireOrgContext>>["supabase"]>;

export type SetStorePickupMappingDeps = {
  requireOrgContext: typeof requireOrgContext;
  listPickupLocations: typeof listPickupLocations;
};

const realDeps: SetStorePickupMappingDeps = { requireOrgContext, listPickupLocations };

export type SetStorePickupMappingResult = { error: string | null; success?: boolean };

// setStorePickupMappingCore() takes its collaborators as parameters
// (defaulted to the real ones) purely so tests can exercise authorization/
// cross-org/validation behavior without a live Supabase instance or a real
// Shiprocket account — same pattern as app/checkout/actions.ts's
// getCheckoutShippingQuoteCore() and the webhook routes' "Core" functions.
// Application code should only ever call the exported
// setStorePickupMapping() Server Action below.
export async function setStorePickupMappingCore(
  storeId: string,
  providerLocationId: string,
  deps: SetStorePickupMappingDeps = realDeps,
): Promise<SetStorePickupMappingResult> {
  const ctx = await deps.requireOrgContext();
  if (ctx.error || !ctx.supabase) return { error: ctx.error ?? "Not authenticated." };
  const { supabase, profile } = ctx;

  if (!WRITE_ROLES.includes(profile.role as (typeof WRITE_ROLES)[number])) {
    return { error: "You do not have permission to manage Shiprocket pickup mapping." };
  }

  // stores_select RLS scopes this read to the caller's own organization —
  // a store belonging to another organization (or one that doesn't exist)
  // simply returns no row, exactly like app/stores/[id]/edit/page.tsx's own
  // lookup. Never distinguish "doesn't exist" from "not yours" in the
  // error message.
  const { data: store } = await (supabase as StoresSupabaseClient)
    .from("stores")
    .select("id")
    .eq("id", storeId)
    .maybeSingle();

  if (!store) {
    return { error: "Store not found in your organization." };
  }

  if (!providerLocationId) {
    return { error: "Select a pickup location." };
  }

  let locations: ShiprocketPickupLocation[];
  try {
    locations = await deps.listPickupLocations();
  } catch {
    return { error: "Could not load Shiprocket pickup locations. Try again." };
  }

  // Never trust the client-supplied id alone — it must actually be present
  // in Shiprocket's own current pickup-location list, read fresh here, so
  // a mapping can never point at a nonexistent or stale location.
  const match = locations.find((loc) => String(loc.id) === providerLocationId);
  if (!match) {
    return { error: "Selected pickup location is no longer available in Shiprocket." };
  }

  const { error } = await (supabase as StoresSupabaseClient).rpc("set_store_pickup_mapping", {
    p_store_id: storeId,
    p_provider_location_id: String(match.id),
    p_provider_location_name: match.nickname,
  });
  if (error) return { error: error.message };

  return { error: null, success: true };
}

// revalidatePath() requires a real Next.js request context and cannot run
// inside setStorePickupMappingCore() (which tests call directly as a plain
// function) — it lives only in this thin wrapper, the actual exported
// Server Action, exactly like every other mutating action in this codebase
// keeps its revalidatePath call outside the testable core.
export async function setStorePickupMapping(
  storeId: string,
  providerLocationId: string,
): Promise<SetStorePickupMappingResult> {
  const result = await setStorePickupMappingCore(storeId, providerLocationId);
  if (result.success) {
    revalidatePath(`/stores/${storeId}/shipping`);
  }
  return result;
}

// Read-side helper for the page: relies on the same live Shiprocket lookup
// used by validation above, never a second, divergent implementation.
export async function getAvailablePickupLocations(): Promise<
  { ok: true; locations: ShiprocketPickupLocation[] } | { ok: false; error: string }
> {
  try {
    const locations = await listPickupLocations();
    return { ok: true, locations };
  } catch {
    return { ok: false, error: "Could not load Shiprocket pickup locations." };
  }
}
