"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/actions/auth";
import { calculateTotalShipmentWeightKg } from "@/lib/shipping/weight";
import { createShiprocketOrder, assignAwb, getOrderByChannelId } from "@/lib/shiprocket/order";
import { ShiprocketError } from "@/lib/shiprocket/errors";

// Every mutation here just calls an existing SECURITY DEFINER RPC
// (0015/0026/0028) and surfaces its error message — role/org/store-access
// authorization is re-verified inside each RPC itself, never re-implemented
// here (mirrors app/sales/actions.ts's postSale/cancelSale). The Shiprocket
// calls in createShipment/reconcileShipmentAttempt are the one place this
// file talks to an external service — see that function's own comment for
// why no DB transaction ever spans them (Architectural Rule #4).
type ActionState = { error: string | null };

export async function advanceOrderStatus(
  orderId: string,
  newStatus: string,
): Promise<ActionState> {
  const ctx = await requireOrgContext();
  if (ctx.error || !ctx.supabase) return { error: ctx.error };

  const { error } = await ctx.supabase.rpc("advance_online_order_status", {
    p_order_id: orderId,
    p_new_status: newStatus,
  });
  if (error) return { error: error.message };

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  return { error: null };
}

export async function assignOrderStore(
  orderId: string,
  storeId: string,
): Promise<ActionState> {
  const ctx = await requireOrgContext();
  if (ctx.error || !ctx.supabase) return { error: ctx.error };
  if (!storeId) return { error: "Select a store." };

  const { error } = await ctx.supabase.rpc("assign_online_order_store", {
    p_order_id: orderId,
    p_store_id: storeId,
  });
  if (error) return { error: error.message };

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  return { error: null };
}

export async function resolveStalledOrder(
  orderId: string,
  storeId: string,
): Promise<ActionState> {
  const ctx = await requireOrgContext();
  if (ctx.error || !ctx.supabase) return { error: ctx.error };
  if (!storeId) return { error: "Select a store." };

  const { error } = await ctx.supabase.rpc(
    "complete_stalled_order_fulfillment",
    { p_order_id: orderId, p_store_id: storeId },
  );
  if (error) return { error: error.message };

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  return { error: null };
}

// ============================================================
// createShipment — the real production Shiprocket path.
//
// Sequence (Architectural Rule #4: never hold a DB transaction open across
// the external call):
//   1. create_shipment_pending — commits a PENDING shipment row (or reuses
//      the existing one). Its own transaction, already committed by the
//      time this function's next line runs.
//   2. Re-read every field the Shiprocket payload needs directly from the
//      DB, server-side (order, lines, item sku/hsn, customer, shipping
//      address, store's pickup mapping) — never from a browser argument.
//      This function takes only orderId; nothing else.
//   3. mark_shipment_attempted — a SEPARATE, already-committed transaction
//      that records "an attempt is in flight" BEFORE the HTTP call below.
//      If the process crashes between here and step 4, the shipment is
//      left in ATTEMPTED, not silently lost as PENDING — exactly the state
//      reconcileShipmentAttempt() below exists to resolve.
//   4. createShiprocketOrder() — the actual external call, outside any DB
//      transaction.
//   5. Depending on outcome:
//      - definite success -> record_shipment_result(success=true, ...real
//        provider ids...) -> shipment CREATED, order auto-advances to
//        SHIPPED (inside that RPC, unchanged from 0026).
//      - definite failure (Shiprocket rejected the request) ->
//        record_shipment_result(success=false, ...) -> shipment FAILED,
//        safely retryable from PENDING.
//      - timeout/network error (uncertain — Rule #5) -> NEITHER RPC is
//        called. The shipment stays ATTEMPTED, exactly where step 3 left
//        it, and the UI must surface "reconciliation needed" rather than
//        silently retrying or silently failing.
// ============================================================

export type CreateShipmentResult =
  | { outcome: "created" }
  | { outcome: "failed"; error: string }
  | { outcome: "uncertain" }
  | { outcome: "error"; error: string };

export async function createShipment(orderId: string): Promise<CreateShipmentResult> {
  const ctx = await requireOrgContext();
  if (ctx.error || !ctx.supabase) return { outcome: "error", error: ctx.error ?? "Not authenticated." };
  const { supabase } = ctx;

  const { data: shipmentId, error: pendingError } = await supabase.rpc("create_shipment_pending", {
    p_order_id: orderId,
  });
  if (pendingError || !shipmentId) {
    return { outcome: "error", error: pendingError?.message ?? "Could not start a shipment." };
  }

  const { data: order } = await supabase
    .from("online_orders")
    .select(
      "id, order_number, subtotal, payment_status, shipping_address_id, fulfillment_store_id, customers(name, email, phone)",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (!order || !order.fulfillment_store_id) {
    return { outcome: "error", error: "Order or fulfillment store not found." };
  }

  const { data: address } = await supabase
    .from("customer_addresses")
    .select("recipient_name, line1, line2, city, state, postal_code, country, phone")
    .eq("id", order.shipping_address_id)
    .maybeSingle();
  if (!address) return { outcome: "error", error: "Shipping address not found." };

  const { data: store } = await supabase
    .from("store_shipping_config")
    .select("provider_location_name")
    .eq("store_id", order.fulfillment_store_id)
    .eq("provider", "SHIPROCKET")
    .eq("active", true)
    .maybeSingle();
  if (!store?.provider_location_name) {
    return { outcome: "error", error: "This store has no active Shiprocket pickup mapping." };
  }

  const { data: lines } = await supabase
    .from("online_order_lines")
    .select("item_id, item_name_snapshot, quantity, unit_price, tax_amount, discount_amount")
    .eq("order_id", orderId);
  if (!lines || lines.length === 0) {
    return { outcome: "error", error: "Order has no line items." };
  }

  const itemIds = lines.map((l) => l.item_id);
  const { data: items } = await supabase
    .from("items")
    .select("id, sku, hsn_code, weight_kg")
    .in("id", itemIds);
  const itemById = new Map((items ?? []).map((i) => [i.id, i]));

  const weightResult = calculateTotalShipmentWeightKg(
    lines.map((l) => ({ weightKg: itemById.get(l.item_id)?.weight_kg ?? null, quantity: Math.round(l.quantity) })),
  );
  if (!weightResult.ok) {
    return { outcome: "error", error: weightResult.reason };
  }

  const { error: attemptError } = await supabase.rpc("mark_shipment_attempted", {
    p_shipment_id: shipmentId,
  });
  if (attemptError) {
    return { outcome: "error", error: attemptError.message };
  }

  const [firstName, ...rest] = address.recipient_name.trim().split(/\s+/);

  try {
    const result = await createShiprocketOrder({
      channelOrderId: order.order_number,
      orderDate: "",
      pickupLocationNickname: store.provider_location_name,
      paymentMethod: order.payment_status === "PAID" ? "Prepaid" : "COD",
      subTotal: order.subtotal,
      billing: {
        customerName: firstName || order.customers?.name || "Customer",
        lastName: rest.join(" ") || "",
        address: address.line1,
        address2: address.line2,
        city: address.city,
        state: address.state,
        pincode: address.postal_code,
        country: address.country,
        email: order.customers?.email ?? "",
        phone: address.phone || order.customers?.phone || "",
      },
      lines: lines.map((l) => ({
        name: l.item_name_snapshot,
        sku: itemById.get(l.item_id)?.sku ?? l.item_id,
        units: Math.round(l.quantity),
        sellingPrice: l.unit_price,
        discount: l.discount_amount,
        tax: l.tax_amount,
        hsn: itemById.get(l.item_id)?.hsn_code ?? null,
      })),
      weightKg: weightResult.totalWeightKg,
      // KANTIRA does not model per-item physical dimensions today — see
      // lib/shiprocket/types.ts's CreateOrderInput comment. Conservative
      // placeholder, not derived from real product data.
      lengthCm: 10,
      breadthCm: 10,
      heightCm: 10,
    });

    if (!result.ok) {
      const { error } = await supabase.rpc("record_shipment_result", {
        p_shipment_id: shipmentId,
        p_success: false,
        p_error_message: result.reason,
      });
      if (error) return { outcome: "error", error: error.message };
      revalidatePath(`/orders/${orderId}`);
      return { outcome: "failed", error: result.reason };
    }

    let awb = result.awbCode;
    let courierId: number | null = result.courierCompanyId;
    let courierName: string | null = null;

    if (!awb) {
      const awbResult = await assignAwb(result.providerShipmentId);
      if (awbResult.ok) {
        awb = awbResult.awbCode;
        courierId = awbResult.courierCompanyId;
        courierName = awbResult.courierName;
      }
      // AWB assignment failing does not undo a real, successful order
      // creation — the shipment is still genuinely provider-created.
      // Known limitation: record_shipment_result's success branch always
      // clears last_error, so an AWB-assignment failure after a successful
      // order isn't distinctly surfaced today (see PR report).
    }

    const { error } = await supabase.rpc("record_shipment_result", {
      p_shipment_id: shipmentId,
      p_success: true,
      p_provider_order_id: result.providerOrderId,
      p_provider_shipment_id: result.providerShipmentId,
      p_awb: awb ?? undefined,
      p_courier_id: courierId !== null ? String(courierId) : undefined,
      p_courier_name: courierName ?? undefined,
    });
    if (error) return { outcome: "error", error: error.message };

    revalidatePath("/orders");
    revalidatePath(`/orders/${orderId}`);
    return { outcome: "created" };
  } catch (err) {
    if (err instanceof ShiprocketError && (err.kind === "timeout" || err.kind === "network")) {
      // Uncertain — Architectural Rule #5. The shipment stays ATTEMPTED
      // (already committed above); do not guess an outcome either way.
      revalidatePath(`/orders/${orderId}`);
      return { outcome: "uncertain" };
    }
    const message = err instanceof ShiprocketError ? err.message : "Unexpected error creating the shipment.";
    const { error } = await supabase.rpc("record_shipment_result", {
      p_shipment_id: shipmentId,
      p_success: false,
      p_error_message: message,
    });
    if (error) return { outcome: "error", error: error.message };
    revalidatePath(`/orders/${orderId}`);
    return { outcome: "failed", error: message };
  }
}

// ============================================================
// reconcileShipmentAttempt — the human-triggered reconciliation path for a
// shipment left ATTEMPTED (an uncertain result). Looks up Shiprocket's own
// record of the order by the same deterministic channelOrderId
// (online_orders.order_number) that createShipment sent. Never blindly
// retries — either resolves to the provider's real, confirmed state, or
// (only if genuinely not found there) hands back to PENDING so a fresh
// attempt is safe.
// ============================================================

export type ReconcileResult =
  | { outcome: "found_created" }
  | { outcome: "confirmed_not_created" }
  | { outcome: "error"; error: string };

export async function reconcileShipmentAttempt(
  shipmentId: string,
  orderId: string,
  orderNumber: string,
): Promise<ReconcileResult> {
  const ctx = await requireOrgContext();
  if (ctx.error || !ctx.supabase) return { outcome: "error", error: ctx.error ?? "Not authenticated." };
  const { supabase } = ctx;

  let lookup;
  try {
    lookup = await getOrderByChannelId(orderNumber);
  } catch (err) {
    const message = err instanceof ShiprocketError ? err.message : "Could not reach Shiprocket to reconcile.";
    return { outcome: "error", error: message };
  }

  if (lookup.found) {
    const { error } = await supabase.rpc("record_shipment_result", {
      p_shipment_id: shipmentId,
      p_success: true,
      p_provider_order_id: lookup.providerOrderId,
      p_provider_shipment_id: lookup.providerShipmentId ?? undefined,
      p_awb: lookup.awbCode ?? undefined,
      p_courier_name: lookup.courierName ?? undefined,
    });
    if (error) return { outcome: "error", error: error.message };
    revalidatePath("/orders");
    revalidatePath(`/orders/${orderId}`);
    return { outcome: "found_created" };
  }

  const { error } = await supabase.rpc("resolve_shipment_attempt_as_retryable", {
    p_shipment_id: shipmentId,
  });
  if (error) return { outcome: "error", error: error.message };

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  return { outcome: "confirmed_not_created" };
}

// ============================================================
// recordShipmentResult — MANUAL OVERRIDE, for UAT/debugging only. This is
// explicitly NOT the production path (createShipment above is) and must
// never be presented as equivalent to a real provider response — the UI
// gates this behind an unmistakable warning label. Kept because a UAT/
// debugging fallback was explicitly permitted, separated, by the approved
// scope.
// ============================================================

export async function recordShipmentResult(
  shipmentId: string,
  orderId: string,
  success: boolean,
  fields: {
    providerOrderId: string;
    providerShipmentId: string;
    awb: string;
    courierId: string;
    courierName: string;
    errorMessage: string;
  },
): Promise<ActionState> {
  const ctx = await requireOrgContext();
  if (ctx.error || !ctx.supabase) return { error: ctx.error };

  const { error } = await ctx.supabase.rpc("record_shipment_result", {
    p_shipment_id: shipmentId,
    p_success: success,
    p_provider_order_id: fields.providerOrderId || undefined,
    p_provider_shipment_id: fields.providerShipmentId || undefined,
    p_awb: fields.awb || undefined,
    p_courier_id: fields.courierId || undefined,
    p_courier_name: fields.courierName || undefined,
    p_error_message: fields.errorMessage || undefined,
  });
  if (error) return { error: error.message };

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  return { error: null };
}

export async function markShipmentDelivered(
  orderId: string,
  provider: string,
  providerShipmentId: string,
): Promise<ActionState> {
  const ctx = await requireOrgContext();
  if (ctx.error || !ctx.supabase) return { error: ctx.error };

  const { error } = await ctx.supabase.rpc("record_shipment_delivered", {
    p_provider: provider,
    p_provider_shipment_id: providerShipmentId,
  });
  if (error) return { error: error.message };

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  return { error: null };
}
