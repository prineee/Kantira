"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrgContext } from "@/lib/actions/auth";

type ActionState = { error: string | null };

const ITEM_WRITE_ROLES = ["OWNER", "ADMIN", "STOCK"] as const;

function parseNumber(raw: FormDataEntryValue | null, fallback: number): number {
  if (raw === null) return fallback;
  const s = String(raw).trim();
  if (s === "") return fallback;
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

// weight_kg is nullable (matches the items.weight_kg column, migration 0019):
// an empty field means "not configured yet", not zero.
function parseNullableNumber(raw: FormDataEntryValue | null): number | null {
  if (raw === null) return null;
  const s = String(raw).trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function readItemFields(formData: FormData) {
  const sku = String(formData.get("sku") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const uom_id = String(formData.get("uom_id") ?? "").trim();
  const category_id = String(formData.get("category_id") ?? "").trim();
  const barcode = String(formData.get("barcode") ?? "").trim();
  const hsn_code = String(formData.get("hsn_code") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const cost_price = parseNumber(formData.get("cost_price"), 0);
  const selling_price = parseNumber(formData.get("selling_price"), 0);
  const tax_rate_percent = parseNumber(formData.get("tax_rate_percent"), 0);
  const reorder_level = parseNumber(formData.get("reorder_level"), 0);
  const weight_kg = parseNullableNumber(formData.get("weight_kg"));
  const track_inventory = formData.get("track_inventory") === "on";

  return {
    sku,
    name,
    uom_id,
    category_id,
    barcode,
    hsn_code,
    description,
    cost_price,
    selling_price,
    tax_rate_percent,
    reorder_level,
    weight_kg,
    track_inventory,
  };
}

function validateItemFields(
  fields: ReturnType<typeof readItemFields>,
): string | null {
  if (!fields.sku) return "SKU is required.";
  if (!fields.name) return "Item name is required.";
  if (!fields.uom_id) return "Unit of measurement is required.";
  if (
    fields.cost_price < 0 ||
    fields.selling_price < 0 ||
    fields.tax_rate_percent < 0 ||
    fields.reorder_level < 0
  ) {
    return "Numeric fields cannot be negative.";
  }
  if (fields.weight_kg !== null && fields.weight_kg < 0) {
    return "Weight cannot be negative.";
  }
  return null;
}

export async function createItem(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireOrgContext();
  if (ctx.error) return { error: ctx.error };
  const { supabase, profile } = ctx;

  if (!ITEM_WRITE_ROLES.includes(profile.role as (typeof ITEM_WRITE_ROLES)[number])) {
    return { error: "You do not have permission to create items." };
  }

  const fields = readItemFields(formData);
  const validationError = validateItemFields(fields);
  if (validationError) return { error: validationError };

  const { error } = await supabase.from("items").insert({
    sku: fields.sku,
    name: fields.name,
    uom_id: fields.uom_id,
    category_id: fields.category_id || null,
    barcode: fields.barcode || null,
    hsn_code: fields.hsn_code || null,
    description: fields.description || null,
    cost_price: fields.cost_price,
    selling_price: fields.selling_price,
    tax_rate_percent: fields.tax_rate_percent,
    reorder_level: fields.reorder_level,
    weight_kg: fields.weight_kg,
    track_inventory: fields.track_inventory,
  });

  if (error) return { error: error.message };

  revalidatePath("/items");
  redirect("/items");
}

export async function updateItem(
  id: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireOrgContext();
  if (ctx.error) return { error: ctx.error };
  const { supabase, profile } = ctx;

  if (!ITEM_WRITE_ROLES.includes(profile.role as (typeof ITEM_WRITE_ROLES)[number])) {
    return { error: "You do not have permission to edit items." };
  }

  const fields = readItemFields(formData);
  const validationError = validateItemFields(fields);
  if (validationError) return { error: validationError };

  const is_active = formData.get("is_active") === "on";

  const { error } = await supabase
    .from("items")
    .update({
      sku: fields.sku,
      name: fields.name,
      uom_id: fields.uom_id,
      category_id: fields.category_id || null,
      barcode: fields.barcode || null,
      hsn_code: fields.hsn_code || null,
      description: fields.description || null,
      cost_price: fields.cost_price,
      selling_price: fields.selling_price,
      tax_rate_percent: fields.tax_rate_percent,
      reorder_level: fields.reorder_level,
      weight_kg: fields.weight_kg,
      track_inventory: fields.track_inventory,
      is_active,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/items");
  revalidatePath(`/items/${id}/edit`);
  redirect("/items");
}
