"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrgContext } from "@/lib/actions/auth";

type ActionState = { error: string | null };

const WRITE_ROLES = ["OWNER", "ADMIN", "ACCOUNTANT", "STOCK"] as const;

function readSupplierFields(formData: FormData) {
  return {
    supplier_code: String(formData.get("supplier_code") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    gstin: String(formData.get("gstin") ?? "").trim(),
    billing_address: String(formData.get("billing_address") ?? "").trim(),
  };
}

function validate(fields: ReturnType<typeof readSupplierFields>): string | null {
  if (!fields.supplier_code) return "Supplier code is required.";
  if (!fields.name) return "Supplier name is required.";
  return null;
}

export async function createSupplier(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireOrgContext();
  if (ctx.error) return { error: ctx.error };
  const { supabase, profile } = ctx;

  if (!WRITE_ROLES.includes(profile.role as (typeof WRITE_ROLES)[number])) {
    return { error: "You do not have permission to create suppliers." };
  }

  const fields = readSupplierFields(formData);
  const validationError = validate(fields);
  if (validationError) return { error: validationError };

  const { error } = await supabase.from("suppliers").insert({
    supplier_code: fields.supplier_code,
    name: fields.name,
    phone: fields.phone || null,
    email: fields.email || null,
    gstin: fields.gstin || null,
    billing_address: fields.billing_address || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/suppliers");
  redirect("/suppliers");
}

export async function updateSupplier(
  id: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireOrgContext();
  if (ctx.error) return { error: ctx.error };
  const { supabase, profile } = ctx;

  if (!WRITE_ROLES.includes(profile.role as (typeof WRITE_ROLES)[number])) {
    return { error: "You do not have permission to edit suppliers." };
  }

  const fields = readSupplierFields(formData);
  const validationError = validate(fields);
  if (validationError) return { error: validationError };

  const is_active = formData.get("is_active") === "on";

  const { error } = await supabase
    .from("suppliers")
    .update({
      supplier_code: fields.supplier_code,
      name: fields.name,
      phone: fields.phone || null,
      email: fields.email || null,
      gstin: fields.gstin || null,
      billing_address: fields.billing_address || null,
      is_active,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${id}/edit`);
  redirect("/suppliers");
}
