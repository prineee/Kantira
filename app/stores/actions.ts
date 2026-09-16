"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrgContext } from "@/lib/actions/auth";
import { readStoreFields, validate, type StoreType } from "./validation";

type ActionState = { error: string | null };

// Mirrors stores_insert_admin / stores_update_admin RLS (0001_phase1_foundation.sql).
const STORE_WRITE_ROLES = ["OWNER", "ADMIN"] as const;

export async function createStore(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireOrgContext();
  if (ctx.error) return { error: ctx.error };
  const { supabase, profile } = ctx;

  if (!STORE_WRITE_ROLES.includes(profile.role as (typeof STORE_WRITE_ROLES)[number])) {
    return { error: "You do not have permission to create stores." };
  }

  const fields = readStoreFields(formData);
  const validationError = validate(fields);
  if (validationError) return { error: validationError };

  // organization_id is derived from the authenticated profile, never from
  // the form — RLS (stores_insert_admin) independently re-checks it against
  // current_org_id() regardless of what's sent here.
  const { error } = await supabase.from("stores").insert({
    organization_id: profile.organization_id,
    store_code: fields.store_code,
    store_name: fields.store_name,
    type: fields.type as StoreType, // validate() above already confirmed this is a valid store_type
    phone: fields.phone || null,
    city: fields.city || null,
    address: fields.address || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/stores");
  revalidatePath("/dashboard");
  redirect("/stores");
}

export async function updateStore(
  id: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireOrgContext();
  if (ctx.error) return { error: ctx.error };
  const { supabase, profile } = ctx;

  if (!STORE_WRITE_ROLES.includes(profile.role as (typeof STORE_WRITE_ROLES)[number])) {
    return { error: "You do not have permission to edit stores." };
  }

  const fields = readStoreFields(formData);
  const validationError = validate(fields);
  if (validationError) return { error: validationError };

  const is_active = formData.get("is_active") === "on";

  // .eq("id", id) plus stores_update_admin's own organization_id = current_org_id()
  // check means this can never touch a store belonging to another organization,
  // and organization_id itself is never part of the update payload.
  const { error } = await supabase
    .from("stores")
    .update({
      store_code: fields.store_code,
      store_name: fields.store_name,
      type: fields.type as StoreType, // validate() above already confirmed this is a valid store_type
      phone: fields.phone || null,
      city: fields.city || null,
      address: fields.address || null,
      is_active,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/stores");
  revalidatePath(`/stores/${id}/edit`);
  revalidatePath("/dashboard");
  redirect("/stores");
}
