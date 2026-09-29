"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/actions/auth";
import { canToggleStorefront } from "@/lib/storefront/permissions";
import { parseStorefrontEnabled, storefrontToggleErrorMessage } from "./validation";

export type StorefrontToggleState = { error: string | null; enabled?: boolean };

export type SetStorefrontEnabledDeps = {
  requireOrgContext: typeof requireOrgContext;
};

const realDeps: SetStorefrontEnabledDeps = { requireOrgContext };

type OrgSupabaseClient = NonNullable<Awaited<ReturnType<typeof requireOrgContext>>["supabase"]>;

// Testable core (same deps-injection pattern as
// app/stores/[id]/shipping/actions.ts). The role check here only shapes the
// message; set_storefront_enabled() (migration 0032) re-derives the
// organization from the session and re-checks OWNER server-side, and it
// takes no organization parameter at all.
export async function setStorefrontEnabledCore(
  formData: FormData,
  deps: SetStorefrontEnabledDeps = realDeps,
): Promise<StorefrontToggleState> {
  const ctx = await deps.requireOrgContext();
  if (ctx.error || !ctx.supabase) return { error: ctx.error ?? "Not authenticated." };
  const { supabase, profile } = ctx;

  if (!canToggleStorefront(profile.role)) {
    return { error: "Only the organization owner can turn the storefront on or off." };
  }

  const enabled = parseStorefrontEnabled(formData);
  if (enabled === null) {
    return { error: "Invalid storefront request." };
  }

  const { data, error } = await (supabase as OrgSupabaseClient).rpc("set_storefront_enabled", {
    p_enabled: enabled,
  });

  if (error) return { error: storefrontToggleErrorMessage(error.message) };

  return { error: null, enabled: data === true };
}

export async function setStorefrontEnabled(
  _prevState: StorefrontToggleState,
  formData: FormData,
): Promise<StorefrontToggleState> {
  const result = await setStorefrontEnabledCore(formData);
  if (!result.error) {
    revalidatePath("/storefront");
    revalidatePath("/items");
  }
  return result;
}
