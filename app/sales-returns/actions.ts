"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrgContext } from "@/lib/actions/auth";

type ActionState = { error: string | null };

const WRITE_ROLES = ["OWNER", "ADMIN", "SALES"] as const;

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

export async function createSalesReturn(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireOrgContext();
  if (ctx.error) return { error: ctx.error };
  const { supabase, profile } = ctx;

  if (!WRITE_ROLES.includes(profile.role as (typeof WRITE_ROLES)[number])) {
    return { error: "You do not have permission to create sales returns." };
  }

  const originalSaleId = String(formData.get("original_sale_id") ?? "");
  const storeId = String(formData.get("store_id") ?? "");
  const customerId = String(formData.get("customer_id") ?? "").trim();
  const returnDate = String(formData.get("return_date") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();

  if (!originalSaleId || !storeId) {
    return { error: "Missing original sale details." };
  }
  if (!returnDate) return { error: "Return date is required." };

  const lines = parseLines(String(formData.get("lines") ?? ""));
  if (!lines) return { error: "Enter a return quantity for at least one line item." };

  const { data: returnNumber, error: seqError } = await supabase.rpc(
    "next_document_number",
    { p_store_id: storeId, p_sequence_type: "SALE_RETURN" },
  );
  if (seqError || !returnNumber) {
    return { error: seqError?.message ?? "Could not generate a return number." };
  }

  const { data: salesReturn, error: insertError } = await supabase
    .from("sales_returns")
    .insert({
      store_id: storeId,
      customer_id: customerId || null,
      original_sale_id: originalSaleId,
      return_number: returnNumber,
      return_date: returnDate,
      notes: notes || null,
    })
    .select("id")
    .single();

  if (insertError || !salesReturn) {
    return { error: insertError?.message ?? "Could not create sales return." };
  }

  const { error: linesError } = await supabase.from("sales_return_lines").insert(
    lines.map((line, index) => ({
      sales_return_id: salesReturn.id,
      // Overwritten by the assign_line_no trigger on insert; required by
      // the generated Insert type only because the column has no DB default.
      line_no: index + 1,
      original_sale_line_id: line.original_line_id as string,
      item_id: line.item_id,
      uom_id: line.uom_id,
      quantity: line.quantity,
      selling_rate: line.rate,
      discount_amount: line.discount_amount,
      tax_amount: line.tax_amount,
    })),
  );

  if (linesError) {
    return { error: linesError.message };
  }

  revalidatePath("/sales-returns");
  redirect(`/sales-returns/${salesReturn.id}`);
}

export async function postSalesReturn(salesReturnId: string) {
  const ctx = await requireOrgContext();
  if (ctx.error || !ctx.supabase) return { error: ctx.error };

  const { error } = await ctx.supabase.rpc("post_sales_return", {
    p_sales_return_id: salesReturnId,
  });
  if (error) return { error: error.message };

  revalidatePath("/sales-returns");
  revalidatePath(`/sales-returns/${salesReturnId}`);
  return { error: null };
}

export async function cancelSalesReturn(salesReturnId: string, reason: string) {
  const ctx = await requireOrgContext();
  if (ctx.error || !ctx.supabase || !ctx.profile) return { error: ctx.error };

  const { error } = await ctx.supabase
    .from("sales_returns")
    .update({
      status: "CANCELLED",
      cancellation_reason: reason || null,
      cancelled_at: new Date().toISOString(),
      cancelled_by: ctx.profile.id,
    })
    .eq("id", salesReturnId);
  if (error) return { error: error.message };

  revalidatePath("/sales-returns");
  revalidatePath(`/sales-returns/${salesReturnId}`);
  return { error: null };
}
