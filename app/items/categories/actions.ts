"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/actions/auth";

type ActionState = { error: string | null; success?: boolean };

const WRITE_ROLES = ["OWNER", "ADMIN", "STOCK"] as const;

export async function createCategory(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireOrgContext();
  if (ctx.error) return { error: ctx.error };
  const { supabase, profile } = ctx;

  if (!WRITE_ROLES.includes(profile.role as (typeof WRITE_ROLES)[number])) {
    return { error: "You do not have permission to manage categories." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const parent_category_id = String(formData.get("parent_category_id") ?? "").trim();

  if (!name) return { error: "Category name is required." };

  const { error } = await supabase.from("product_categories").insert({
    name,
    parent_category_id: parent_category_id || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/items/categories");
  revalidatePath("/items");
  return { error: null, success: true };
}

export async function createUnit(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireOrgContext();
  if (ctx.error) return { error: ctx.error };
  const { supabase, profile } = ctx;

  if (!WRITE_ROLES.includes(profile.role as (typeof WRITE_ROLES)[number])) {
    return { error: "You do not have permission to manage units." };
  }

  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();

  if (!code) return { error: "Unit code is required." };
  if (!name) return { error: "Unit name is required." };

  const { error } = await supabase
    .from("units_of_measurement")
    .insert({ code, name });

  if (error) return { error: error.message };

  revalidatePath("/items/categories");
  revalidatePath("/items");
  return { error: null, success: true };
}
