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
};

function parseLines(raw: string): LinePayload[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function createPurchase(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireOrgContext();
  if (ctx.error) return { error: ctx.error };
  const { supabase, profile } = ctx;

  if (!WRITE_ROLES.includes(profile.role as (typeof WRITE_ROLES)[number])) {
    return { error: "You do not have permission to create purchases." };
  }

  const storeId = String(formData.get("store_id") ?? "");
  const supplierId = String(formData.get("supplier_id") ?? "");
  const documentDate = String(formData.get("document_date") ?? "");
  const referenceNumber = String(formData.get("reference_number") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const discountAmount = Number(formData.get("discount_amount") ?? 0) || 0;
  const taxAmount = Number(formData.get("tax_amount") ?? 0) || 0;

  if (!storeId) return { error: "Select a store." };
  if (!supplierId) return { error: "Select a supplier." };
  if (!documentDate) return { error: "Document date is required." };

  const lines = parseLines(String(formData.get("lines") ?? ""));
  if (!lines) return { error: "Add at least one line item." };

  const { data: documentNumber, error: seqError } = await supabase.rpc(
    "next_document_number",
    { p_store_id: storeId, p_sequence_type: "PURCHASE" },
  );
  if (seqError || !documentNumber) {
    return { error: seqError?.message ?? "Could not generate a document number." };
  }

  const { data: purchase, error: insertError } = await supabase
    .from("purchases")
    .insert({
      store_id: storeId,
      supplier_id: supplierId,
      document_number: documentNumber,
      document_date: documentDate,
      reference_number: referenceNumber || null,
      notes: notes || null,
      discount_amount: discountAmount,
      tax_amount: taxAmount,
    })
    .select("id")
    .single();

  if (insertError || !purchase) {
    return { error: insertError?.message ?? "Could not create purchase." };
  }

  const { error: linesError } = await supabase.from("purchase_lines").insert(
    lines.map((line, index) => ({
      purchase_id: purchase.id,
      // Overwritten by the assign_line_no trigger on insert; required by
      // the generated Insert type only because the column has no DB default.
      line_no: index + 1,
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

  revalidatePath("/purchases");
  redirect(`/purchases/${purchase.id}`);
}

export async function postPurchase(purchaseId: string) {
  const ctx = await requireOrgContext();
  if (ctx.error || !ctx.supabase) return { error: ctx.error };

  const { error } = await ctx.supabase.rpc("post_purchase", {
    p_purchase_id: purchaseId,
  });
  if (error) return { error: error.message };

  revalidatePath("/purchases");
  revalidatePath(`/purchases/${purchaseId}`);
  return { error: null };
}

export async function cancelPurchase(purchaseId: string, reason: string) {
  const ctx = await requireOrgContext();
  if (ctx.error || !ctx.supabase || !ctx.profile) return { error: ctx.error };

  const { error } = await ctx.supabase
    .from("purchases")
    .update({
      status: "CANCELLED",
      cancellation_reason: reason || null,
      cancelled_at: new Date().toISOString(),
      cancelled_by: ctx.profile.id,
    })
    .eq("id", purchaseId);
  if (error) return { error: error.message };

  revalidatePath("/purchases");
  revalidatePath(`/purchases/${purchaseId}`);
  return { error: null };
}
