"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrgContext } from "@/lib/actions/auth";
import type { Database } from "@/types/database";

type ActionState = { error: string | null };
type MovementType = Database["public"]["Enums"]["stock_movement_type"];
type AdjustmentReason = Database["public"]["Enums"]["stock_adjustment_reason"];

const MOVEMENT_TYPES: MovementType[] = ["ADJUSTMENT_IN", "ADJUSTMENT_OUT", "DAMAGE"];
const ADJUSTMENT_REASONS: AdjustmentReason[] = ["DAMAGE", "LOSS", "FOUND", "RECOUNT", "OTHER"];

export async function createStockAdjustment(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireOrgContext();
  if (ctx.error) return { error: ctx.error };
  const { supabase } = ctx;

  const storeId = String(formData.get("store_id") ?? "");
  const itemId = String(formData.get("item_id") ?? "");
  const movementType = String(formData.get("movement_type") ?? "");
  const adjustmentReason = String(formData.get("adjustment_reason") ?? "");
  const quantity = Number(formData.get("quantity") ?? 0);
  const unitCostRaw = String(formData.get("unit_cost") ?? "").trim();
  const reference = String(formData.get("reference") ?? "").trim();
  const transactionDate = String(formData.get("transaction_date") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();

  if (!storeId) return { error: "Select a store." };
  if (!itemId) return { error: "Select an item." };
  if (!MOVEMENT_TYPES.includes(movementType as MovementType)) {
    return { error: "Select a valid adjustment type." };
  }
  if (!ADJUSTMENT_REASONS.includes(adjustmentReason as AdjustmentReason)) {
    return { error: "Select a valid reason." };
  }
  if (!quantity || quantity <= 0) return { error: "Quantity must be greater than zero." };

  const { error } = await supabase.rpc("post_stock_adjustment", {
    p_store_id: storeId,
    p_item_id: itemId,
    p_movement_type: movementType as MovementType,
    p_quantity: quantity,
    p_adjustment_reason: adjustmentReason as AdjustmentReason,
    p_unit_cost: unitCostRaw ? Number(unitCostRaw) : undefined,
    p_reference: reference || undefined,
    p_transaction_date: transactionDate || undefined,
    p_notes: notes || undefined,
  });

  if (error) return { error: error.message };

  revalidatePath("/stock/adjustments");
  revalidatePath("/stock");
  redirect("/stock/adjustments");
}
