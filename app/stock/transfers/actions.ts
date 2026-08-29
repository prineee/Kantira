"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrgContext } from "@/lib/actions/auth";

type ActionState = { error: string | null };

export async function createStockTransfer(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireOrgContext();
  if (ctx.error) return { error: ctx.error };
  const { supabase } = ctx;

  const fromStoreId = String(formData.get("from_store_id") ?? "");
  const toStoreId = String(formData.get("to_store_id") ?? "");
  const itemId = String(formData.get("item_id") ?? "");
  const quantity = Number(formData.get("quantity") ?? 0);
  const reference = String(formData.get("reference") ?? "").trim();
  const transactionDate = String(formData.get("transaction_date") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();

  if (!fromStoreId || !toStoreId) return { error: "Select both stores." };
  if (fromStoreId === toStoreId) return { error: "Source and destination stores must differ." };
  if (!itemId) return { error: "Select an item." };
  if (!quantity || quantity <= 0) return { error: "Quantity must be greater than zero." };

  const { error } = await supabase.rpc("create_stock_transfer", {
    p_from_store_id: fromStoreId,
    p_to_store_id: toStoreId,
    p_item_id: itemId,
    p_quantity: quantity,
    p_reference: reference || undefined,
    p_transaction_date: transactionDate || undefined,
    p_notes: notes || undefined,
  });

  if (error) return { error: error.message };

  revalidatePath("/stock/transfers");
  revalidatePath("/stock");
  redirect("/stock/transfers");
}
