"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrgContext } from "@/lib/actions/auth";

type ActionState = { error: string | null };

const WRITE_ROLES = ["OWNER", "ADMIN", "SALES", "ACCOUNTANT"] as const;

function readCustomerFields(formData: FormData) {
  return {
    customer_code: String(formData.get("customer_code") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    gstin: String(formData.get("gstin") ?? "").trim(),
    billing_address: String(formData.get("billing_address") ?? "").trim(),
  };
}

function validate(fields: ReturnType<typeof readCustomerFields>): string | null {
  if (!fields.customer_code) return "Customer code is required.";
  if (!fields.name) return "Customer name is required.";
  return null;
}

export async function createCustomer(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireOrgContext();
  if (ctx.error) return { error: ctx.error };
  const { supabase, profile } = ctx;

  if (!WRITE_ROLES.includes(profile.role as (typeof WRITE_ROLES)[number])) {
    return { error: "You do not have permission to create customers." };
  }

  const fields = readCustomerFields(formData);
  const validationError = validate(fields);
  if (validationError) return { error: validationError };

  const { error } = await supabase.from("customers").insert({
    customer_code: fields.customer_code,
    name: fields.name,
    phone: fields.phone || null,
    email: fields.email || null,
    gstin: fields.gstin || null,
    billing_address: fields.billing_address || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/customers");
  redirect("/customers");
}

export async function updateCustomer(
  id: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireOrgContext();
  if (ctx.error) return { error: ctx.error };
  const { supabase, profile } = ctx;

  if (!WRITE_ROLES.includes(profile.role as (typeof WRITE_ROLES)[number])) {
    return { error: "You do not have permission to edit customers." };
  }

  const fields = readCustomerFields(formData);
  const validationError = validate(fields);
  if (validationError) return { error: validationError };

  const is_active = formData.get("is_active") === "on";

  const { error } = await supabase
    .from("customers")
    .update({
      customer_code: fields.customer_code,
      name: fields.name,
      phone: fields.phone || null,
      email: fields.email || null,
      gstin: fields.gstin || null,
      billing_address: fields.billing_address || null,
      is_active,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/customers");
  revalidatePath(`/customers/${id}/edit`);
  redirect("/customers");
}
