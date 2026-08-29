"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrgContext } from "@/lib/actions/auth";
import type { Database } from "@/types/database";

type ActionState = { error: string | null };
type PaymentMethod = Database["public"]["Enums"]["payment_method"];
const PAYMENT_METHODS: PaymentMethod[] = ["CASH", "BANK", "UPI", "CARD"];

export async function createPayment(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireOrgContext();
  if (ctx.error) return { error: ctx.error };
  const { supabase } = ctx;

  const supplierId = String(formData.get("supplier_id") ?? "");
  const storeId = String(formData.get("store_id") ?? "");
  const amount = Number(formData.get("amount") ?? 0);
  const paymentMethod = String(formData.get("payment_method") ?? "CASH");
  const referenceNumber = String(formData.get("reference_number") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const paymentDate = String(formData.get("payment_date") ?? "");

  if (!supplierId) return { error: "Select a supplier." };
  if (!storeId) return { error: "Select a store." };
  if (!amount || amount <= 0) return { error: "Amount must be greater than zero." };
  if (!PAYMENT_METHODS.includes(paymentMethod as PaymentMethod)) {
    return { error: "Select a valid payment method." };
  }

  const { error } = await supabase.rpc("create_supplier_payment", {
    p_supplier_id: supplierId,
    p_store_id: storeId,
    p_amount: amount,
    p_payment_method: paymentMethod as PaymentMethod,
    p_reference_number: referenceNumber || undefined,
    p_notes: notes || undefined,
    p_payment_date: paymentDate || undefined,
  });

  if (error) return { error: error.message };

  revalidatePath("/payments");
  redirect("/payments");
}

export async function cancelPayment(paymentId: string, reason: string) {
  const ctx = await requireOrgContext();
  if (ctx.error || !ctx.supabase) return { error: ctx.error };

  const { error } = await ctx.supabase.rpc("cancel_supplier_payment", {
    p_payment_id: paymentId,
    p_reason: reason || "Cancelled",
  });
  if (error) return { error: error.message };

  revalidatePath("/payments");
  return { error: null };
}
