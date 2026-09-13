"use server";

import { requireCustomerContext } from "@/lib/actions/customer-auth";
import { isValidUuid } from "@/lib/data/storefront-catalog";

export type PlaceCodOrderResult =
  | { ok: true; orderId: string; orderNumber: string }
  | { ok: false; error: string };

// Decision 2 (Phase 4D): COD auto-confirms on placement, no staff review.
// All the actual work — ownership, payment-method gating, atomic order +
// line creation, best-effort inventory reservation — happens inside
// place_cod_order() (migration 0024), which is idempotent by construction:
// calling this twice for the same checkout session (double-click, refresh)
// always returns the same order.
export async function placeCodOrderAction(checkoutSessionId: string): Promise<PlaceCodOrderResult> {
  if (!isValidUuid(checkoutSessionId)) {
    return { ok: false, error: "Invalid checkout session." };
  }

  const ctx = await requireCustomerContext();
  if (ctx.error) return { ok: false, error: ctx.error };

  const { data, error } = await ctx.supabase.rpc("place_cod_order", {
    p_checkout_session_id: checkoutSessionId,
  });

  if (error || !data || data.length === 0) {
    return { ok: false, error: "Could not place your order. Please try again." };
  }

  const row = data[0]!;
  return { ok: true, orderId: row.out_order_id, orderNumber: row.out_order_number };
}
