"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/actions/auth";

// Every mutation here just calls an existing SECURITY DEFINER RPC
// (0015/0026) and surfaces its error message — role/org/store-access
// authorization is re-verified inside each RPC itself, never re-implemented
// here (mirrors app/sales/actions.ts's postSale/cancelSale).
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

export async function createShipment(orderId: string): Promise<ActionState> {
  const ctx = await requireOrgContext();
  if (ctx.error || !ctx.supabase) return { error: ctx.error };

  const { error } = await ctx.supabase.rpc("create_shipment_pending", {
    p_order_id: orderId,
  });
  if (error) return { error: error.message };

  revalidatePath(`/orders/${orderId}`);
  return { error: null };
}

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
