"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrgContext } from "@/lib/actions/auth";
import type { Database } from "@/types/database";

type ActionState = { error: string | null };
type PaymentMethod = Database["public"]["Enums"]["payment_method"];
const PAYMENT_METHODS: PaymentMethod[] = ["CASH", "BANK", "UPI", "CARD"];

export async function createReceipt(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireOrgContext();
  if (ctx.error) return { error: ctx.error };
  const { supabase } = ctx;

  const customerId = String(formData.get("customer_id") ?? "");
  const storeId = String(formData.get("store_id") ?? "");
  const amount = Number(formData.get("amount") ?? 0);
  const paymentMethod = String(formData.get("payment_method") ?? "CASH");
  const referenceNumber = String(formData.get("reference_number") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const receiptDate = String(formData.get("receipt_date") ?? "");

  if (!customerId) return { error: "Select a customer." };
  if (!storeId) return { error: "Select a store." };
  if (!amount || amount <= 0) return { error: "Amount must be greater than zero." };
  if (!PAYMENT_METHODS.includes(paymentMethod as PaymentMethod)) {
    return { error: "Select a valid payment method." };
  }

  const { error } = await supabase.rpc("create_customer_receipt", {
    p_customer_id: customerId,
    p_store_id: storeId,
    p_amount: amount,
    p_payment_method: paymentMethod as PaymentMethod,
    p_reference_number: referenceNumber || undefined,
    p_notes: notes || undefined,
    p_receipt_date: receiptDate || undefined,
  });

  if (error) return { error: error.message };

  revalidatePath("/receipts");
  redirect("/receipts");
}

export async function cancelReceipt(receiptId: string, reason: string) {
  const ctx = await requireOrgContext();
  if (ctx.error || !ctx.supabase) return { error: ctx.error };

  const { error } = await ctx.supabase.rpc("cancel_customer_receipt", {
    p_receipt_id: receiptId,
    p_reason: reason || "Cancelled",
  });
  if (error) return { error: error.message };

  revalidatePath("/receipts");
  return { error: null };
}
