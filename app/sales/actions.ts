"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrgContext } from "@/lib/actions/auth";
import type { Database } from "@/types/database";

type ActionState = { error: string | null };
type PaymentMethod = Database["public"]["Enums"]["payment_method"];

const WRITE_ROLES = ["OWNER", "ADMIN", "SALES"] as const;
const PAYMENT_METHODS: PaymentMethod[] = ["CASH", "BANK", "UPI", "CARD", "CREDIT"];

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

export async function createSale(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireOrgContext();
  if (ctx.error) return { error: ctx.error };
  const { supabase, profile } = ctx;

  if (!WRITE_ROLES.includes(profile.role as (typeof WRITE_ROLES)[number])) {
    return { error: "You do not have permission to create sales." };
  }

  const storeId = String(formData.get("store_id") ?? "");
  const customerId = String(formData.get("customer_id") ?? "").trim();
  const customerName = String(formData.get("customer_name") ?? "").trim();
  const invoiceDate = String(formData.get("invoice_date") ?? "");
  const paymentMethod = String(formData.get("payment_method") ?? "CASH");
  const amountPaid = Number(formData.get("amount_paid") ?? 0) || 0;
  const notes = String(formData.get("notes") ?? "").trim();
  const discountAmount = Number(formData.get("discount_amount") ?? 0) || 0;
  const taxAmount = Number(formData.get("tax_amount") ?? 0) || 0;

  if (!storeId) return { error: "Select a store." };
  if (!customerId && !customerName) {
    return { error: "Select a registered customer or enter a walk-in customer name." };
  }
  if (!invoiceDate) return { error: "Invoice date is required." };
  if (!PAYMENT_METHODS.includes(paymentMethod as PaymentMethod)) {
    return { error: "Select a valid payment method." };
  }

  const lines = parseLines(String(formData.get("lines") ?? ""));
  if (!lines) return { error: "Add at least one line item." };

  const { data: invoiceNumber, error: seqError } = await supabase.rpc(
    "next_document_number",
    { p_store_id: storeId, p_sequence_type: "SALE" },
  );
  if (seqError || !invoiceNumber) {
    return { error: seqError?.message ?? "Could not generate an invoice number." };
  }

  const { data: sale, error: insertError } = await supabase
    .from("sales")
    .insert({
      store_id: storeId,
      customer_id: customerId || null,
      customer_name: customerId ? null : customerName,
      invoice_number: invoiceNumber,
      invoice_date: invoiceDate,
      payment_method: paymentMethod as PaymentMethod,
      amount_paid: amountPaid,
      notes: notes || null,
      discount_amount: discountAmount,
      tax_amount: taxAmount,
    })
    .select("id")
    .single();

  if (insertError || !sale) {
    return { error: insertError?.message ?? "Could not create sale." };
  }

  const { error: linesError } = await supabase.from("sale_lines").insert(
    lines.map((line, index) => ({
      sale_id: sale.id,
      // Overwritten by the assign_line_no trigger on insert; required by
      // the generated Insert type only because the column has no DB default.
      line_no: index + 1,
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

  revalidatePath("/sales");
  redirect(`/sales/${sale.id}`);
}

export async function postSale(saleId: string) {
  const ctx = await requireOrgContext();
  if (ctx.error || !ctx.supabase) return { error: ctx.error };

  const { error } = await ctx.supabase.rpc("post_sale", { p_sale_id: saleId });
  if (error) return { error: error.message };

  revalidatePath("/sales");
  revalidatePath(`/sales/${saleId}`);
  return { error: null };
}

export async function cancelSale(saleId: string, reason: string) {
  const ctx = await requireOrgContext();
  if (ctx.error || !ctx.supabase || !ctx.profile) return { error: ctx.error };

  const { error } = await ctx.supabase
    .from("sales")
    .update({
      status: "CANCELLED",
      cancellation_reason: reason || null,
      cancelled_at: new Date().toISOString(),
      cancelled_by: ctx.profile.id,
    })
    .eq("id", saleId);
  if (error) return { error: error.message };

  revalidatePath("/sales");
  revalidatePath(`/sales/${saleId}`);
  return { error: null };
}
