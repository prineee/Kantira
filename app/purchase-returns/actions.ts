"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrgContext } from "@/lib/actions/auth";

type ActionState = { error: string | null };

const WRITE_ROLES = ["OWNER", "ADMIN", "STOCK"] as const;

type LinePayload = {
  item_id: string;
  uom_id: string;
  quantity: number;
  rate: number;
  discount_amount: number;
  tax_amount: number;
  original_line_id?: string;
};

function parseLines(raw: string): LinePayload[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    if (parsed.some((l: LinePayload) => !l.original_line_id)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function createPurchaseReturn(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireOrgContext();
  if (ctx.error) return { error: ctx.error };
  const { supabase, profile } = ctx;

  if (!WRITE_ROLES.includes(profile.role as (typeof WRITE_ROLES)[number])) {
    return { error: "You do not have permission to create purchase returns." };
  }

  const originalPurchaseId = String(formData.get("original_purchase_id") ?? "");
  const storeId = String(formData.get("store_id") ?? "");
  const supplierId = String(formData.get("supplier_id") ?? "");
  const returnDate = String(formData.get("return_date") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();

  if (!originalPurchaseId || !storeId || !supplierId) {
    return { error: "Missing original purchase details." };
  }
  if (!returnDate) return { error: "Return date is required." };

  const lines = parseLines(String(formData.get("lines") ?? ""));
  if (!lines) return { error: "Enter a return quantity for at least one line item." };

  const { data: returnNumber, error: seqError } = await supabase.rpc(
    "next_document_number",
    { p_store_id: storeId, p_sequence_type: "PURCHASE_RETURN" },
  );
  if (seqError || !returnNumber) {
    return { error: seqError?.message ?? "Could not generate a return number." };
  }

  const { data: purchaseReturn, error: insertError } = await supabase
    .from("purchase_returns")
    .insert({
      store_id: storeId,
      supplier_id: supplierId,
      original_purchase_id: originalPurchaseId,
      return_number: returnNumber,
      return_date: returnDate,
      notes: notes || null,
    })
    .select("id")
    .single();

  if (insertError || !purchaseReturn) {
    return { error: insertError?.message ?? "Could not create purchase return." };
  }

  const { error: linesError } = await supabase.from("purchase_return_lines").insert(
    lines.map((line, index) => ({
      purchase_return_id: purchaseReturn.id,
      // Overwritten by the assign_line_no trigger on insert; required by
      // the generated Insert type only because the column has no DB default.
      line_no: index + 1,
      original_purchase_line_id: line.original_line_id as string,
      item_id: line.item_id,
      uom_id: line.uom_id,
      quantity: line.quantity,
      purchase_rate: line.rate,
      discount_amount: line.discount_amount,
      tax_amount: line.tax_amount,
    })),
  );

  if (linesError) {
    return { error: linesError.message };
  }

  revalidatePath("/purchase-returns");
  redirect(`/purchase-returns/${purchaseReturn.id}`);
}

export async function postPurchaseReturn(purchaseReturnId: string) {
  const ctx = await requireOrgContext();
  if (ctx.error || !ctx.supabase) return { error: ctx.error };

  const { error } = await ctx.supabase.rpc("post_purchase_return", {
    p_purchase_return_id: purchaseReturnId,
  });
  if (error) return { error: error.message };

  revalidatePath("/purchase-returns");
  revalidatePath(`/purchase-returns/${purchaseReturnId}`);
  return { error: null };
}

export async function cancelPurchaseReturn(purchaseReturnId: string, reason: string) {
  const ctx = await requireOrgContext();
  if (ctx.error || !ctx.supabase || !ctx.profile) return { error: ctx.error };

  const { error } = await ctx.supabase
    .from("purchase_returns")
    .update({
      status: "CANCELLED",
      cancellation_reason: reason || null,
      cancelled_at: new Date().toISOString(),
      cancelled_by: ctx.profile.id,
    })
    .eq("id", purchaseReturnId);
  if (error) return { error: error.message };

  revalidatePath("/purchase-returns");
  revalidatePath(`/purchase-returns/${purchaseReturnId}`);
  return { error: null };
}
