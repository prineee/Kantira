"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/actions/auth";
import { calculateTotalShipmentWeightKg } from "@/lib/shipping/weight";
import { validatePackageData, type PackageDataInput } from "@/lib/shipping/package";
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
//   2. get_shipment_package_data — read whatever actual packed-parcel data
//      (weight off a scale, dimensions off the real box) is already
//      persisted on this shipment. If none exists yet, `packageData` is
//      required, validated (lib/shipping/package.ts), and persisted via
//      set_shipment_package_data BEFORE anything else happens — a
//      validation failure here returns an error with NO RPC call beyond
//      create_shipment_pending, no ATTEMPTED state, no order-state change
//      (Phase 5A-2 package-data architecture; NEVER a 10x10x10 or
//      computed-weight placeholder). If package data already exists (a
//      retry), it is reused exactly as stored — never re-prompted,
//      re-read from a fresher source, or recalculated.
//   3. Re-read every other field the Shiprocket payload needs directly
//      from the DB, server-side (order, lines, item sku/hsn, customer,
//      shipping address, store's pickup mapping) — never from a browser
//      argument.
//   4. mark_shipment_attempted — a SEPARATE, already-committed transaction
//      that records "an attempt is in flight" BEFORE the HTTP call below.
//      If the process crashes between here and step 5, the shipment is
//      left in ATTEMPTED, not silently lost as PENDING — exactly the state
//      reconcileShipmentAttempt() below exists to resolve.
//   5. createShiprocketOrder() — the actual external call, outside any DB
//      transaction, using the package data resolved in step 2.
//   6. Depending on outcome:
//      - definite success -> record_shipment_result(success=true, ...real
//        provider ids...) -> shipment CREATED, order auto-advances to
//        SHIPPED (inside that RPC, unchanged from 0026).
//      - definite failure (Shiprocket rejected the request) ->
//        record_shipment_result(success=false, ...) -> shipment FAILED,
//        safely retryable from PENDING (package data stays persisted).
//      - timeout/network error (uncertain — Rule #5) -> NEITHER RPC is
//        called. The shipment stays ATTEMPTED, exactly where step 4 left
//        it, and the UI must surface "reconciliation needed" rather than
//        silently retrying or silently failing.
// ============================================================

export type CreateShipmentResult =
  | { outcome: "created" }
  | { outcome: "failed"; error: string }
  | { outcome: "uncertain" }
  | { outcome: "error"; error: string };

// Estimate only — a pre-fill convenience for the "Create Shipment" form,
// computed the same way checkout's own shipping quote is (authoritative
// items.weight_kg x quantity). NEVER the value actually sent to Shiprocket
// — that is always the staff-confirmed figure persisted via
// set_shipment_package_data (see createShipment below). Staff sees this
// clearly labeled as an estimate in the UI and can override it.
export type EstimatedWeightResult = { ok: true; weightKg: number } | { ok: false; reason: string };

export async function getEstimatedPackageWeight(orderId: string): Promise<EstimatedWeightResult> {
  const ctx = await requireOrgContext();
  if (ctx.error || !ctx.supabase) return { ok: false, reason: ctx.error ?? "Not authenticated." };
  const { supabase } = ctx;

  const { data: lines } = await supabase
    .from("online_order_lines")
    .select("item_id, quantity")
    .eq("order_id", orderId);
  if (!lines || lines.length === 0) {
    return { ok: false, reason: "Order has no line items." };
  }

  const itemIds = lines.map((l) => l.item_id);
  const { data: items } = await supabase.from("items").select("id, weight_kg").in("id", itemIds);
  const weightById = new Map((items ?? []).map((i) => [i.id, i.weight_kg as number | null]));

  const result = calculateTotalShipmentWeightKg(
    lines.map((l) => ({ weightKg: weightById.get(l.item_id) ?? null, quantity: Math.round(l.quantity) })),
  );
  if (!result.ok) return { ok: false, reason: result.reason };
  return { ok: true, weightKg: result.totalWeightKg };
}

export async function createShipment(
  orderId: string,
  packageData?: PackageDataInput,
): Promise<CreateShipmentResult> {
  const ctx = await requireOrgContext();
  if (ctx.error || !ctx.supabase) return { outcome: "error", error: ctx.error ?? "Not authenticated." };
  const { supabase } = ctx;

  const { data: shipmentId, error: pendingError } = await supabase.rpc("create_shipment_pending", {
    p_order_id: orderId,
  });
  if (pendingError || !shipmentId) {
    return { outcome: "error", error: pendingError?.message ?? "Could not start a shipment." };
  }

  // Package data (actual packed weight/dimensions) must exist on the
  // shipment row BEFORE any Shiprocket attempt — so a timeout/reconcile
  // retry always reuses the exact facts staff already confirmed, never a
  // re-prompt or a silently recalculated value (Phase 5A-2 package-data
  // architecture). Always read the persisted values fresh from the
  // database via the SECURITY DEFINER accessor — never trust a caller's
  // in-memory argument as the value actually sent to the provider.
  const { data: existingRows, error: existingError } = await supabase.rpc("get_shipment_package_data", {
    p_shipment_id: shipmentId,
  });
  if (existingError) return { outcome: "error", error: existingError.message };
  const existing = existingRows?.[0];

  let finalPackage: { deadWeightKg: number; lengthCm: number; breadthCm: number; heightCm: number };

  if (
    existing &&
    existing.package_dead_weight_kg !== null &&
    existing.package_length_cm !== null &&
    existing.package_breadth_cm !== null &&
    existing.package_height_cm !== null
  ) {
    // A retry of an already-packaged shipment (e.g. FAILED -> retry, or a
    // reconciliation-confirmed PENDING) — reuse the stored facts exactly,
    // never re-read/recalculate them, per the approved architecture.
    finalPackage = {
      deadWeightKg: existing.package_dead_weight_kg,
      lengthCm: existing.package_length_cm,
      breadthCm: existing.package_breadth_cm,
      heightCm: existing.package_height_cm,
    };
  } else {
    // First-time capture for this shipment — package data is mandatory.
    // Validation failure here must NOT create an ATTEMPTED state, call
    // Shiprocket, or alter order state — the shipment simply stays
    // PENDING (already true at this point) and nothing further happens.
    if (!packageData) {
      return {
        outcome: "error",
        error: "Package weight and dimensions are required before creating this shipment.",
      };
    }
    const validated = validatePackageData(packageData);
    if (!validated.ok) {
      return { outcome: "error", error: validated.reason };
    }
    const { error: setError } = await supabase.rpc("set_shipment_package_data", {
      p_shipment_id: shipmentId,
      p_package_dead_weight_kg: validated.data.deadWeightKg,
      p_package_length_cm: validated.data.lengthCm,
      p_package_breadth_cm: validated.data.breadthCm,
      p_package_height_cm: validated.data.heightCm,
    });
    if (setError) return { outcome: "error", error: setError.message };
    finalPackage = validated.data;
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
      // Actual staff-confirmed packed-parcel data (Phase 5A-2 package-data
      // architecture) — never a computed estimate or a placeholder. See
      // finalPackage's own resolution above: either freshly validated and
      // persisted this call, or reused unchanged from a prior attempt.
      weightKg: finalPackage.deadWeightKg,
      lengthCm: finalPackage.lengthCm,
      breadthCm: finalPackage.breadthCm,
      heightCm: finalPackage.heightCm,
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
  | { outcome: "unknown"; reason: string }
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

  if (lookup.status === "found") {
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

  if (lookup.status === "unknown") {
    // CRITICAL SAFETY RULE: an unrecognized/ambiguous provider response
    // must NEVER be treated as "not found". Resolving it to PENDING here
    // would let a subsequent retry create a second, real Shiprocket order
    // if the original request actually did succeed. Leave the shipment
    // exactly where it is (ATTEMPTED) — no RPC call, no state change —
    // and require a human to resolve it (e.g. via the manual override,
    // after checking Shiprocket's own dashboard directly).
    return { outcome: "unknown", reason: lookup.reason };
  }

  // lookup.status === "not_found" — the ONLY status permitted to proceed
  // to the existing retryable path.
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
