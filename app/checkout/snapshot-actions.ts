"use server";

import { requireCustomerContext } from "@/lib/actions/customer-auth";
import { getCustomerCartSummary } from "@/lib/data/cart-queries";
import { isValidUuid } from "@/lib/data/storefront-catalog";
import { calculateTotalShipmentWeightKg } from "@/lib/shipping/weight";
import { resolveFulfillmentStore, resolveActivePickupMapping } from "@/lib/shipping/fulfillment";
import { getShippingQuote } from "@/lib/shiprocket/serviceability";
import { ShiprocketError, toSafeClientMessage } from "@/lib/shiprocket/errors";

// The checkout snapshot boundary (Phase 4D). Re-derives every financially
// relevant value server-side immediately before locking the snapshot:
//
//  - cart contents/prices: Phase 4B's getCustomerCartSummary (live,
//    RLS-scoped items join — never the browser's idea of its own cart)
//  - fulfillment store: the same customer-safe resolveFulfillmentStore()
//    app/checkout/actions.ts already uses (never hard-coded, never
//    client-supplied)
//  - shipping charge: a FRESH Shiprocket quote, re-fetched here rather than
//    trusting whatever quote the customer saw on the review step earlier —
//    the customer's courier *selection* (an id) is browser-supplied, but
//    the *amount* for that courier is always read from this fresh quote,
//    and the request is rejected outright if that courier isn't present in
//    it anymore (the "staleness rule").
//
// The actual price/tax formula still lives in SQL
// (create_checkout_session, migration 0024) — this file's job stops at
// "what shipping option, at what amount, is this customer actually
// allowed to lock in right now."

export type CreateCheckoutSessionResult =
  | { ok: true; checkoutSessionId: string; grandTotal: number; currency: string }
  | { ok: false; error: string };

export async function createCheckoutSessionAction(params: {
  addressId: string;
  courierId: string;
  paymentMethod: "COD" | "RAZORPAY";
  idempotencyKey: string;
}): Promise<CreateCheckoutSessionResult> {
  const { addressId, courierId, paymentMethod, idempotencyKey } = params;

  if (!isValidUuid(addressId)) return { ok: false, error: "Invalid delivery address." };
  if (!courierId) return { ok: false, error: "Select a shipping option." };
  if (paymentMethod !== "COD" && paymentMethod !== "RAZORPAY") {
    return { ok: false, error: "Invalid payment method." };
  }
  if (!idempotencyKey) return { ok: false, error: "Missing request identifier." };

  const ctx = await requireCustomerContext();
  if (ctx.error) return { ok: false, error: ctx.error };
  const { supabase, customer } = ctx;

  const summary = await getCustomerCartSummary(supabase);
  if (summary.lines.length === 0) {
    return { ok: false, error: "Your cart is empty." };
  }
  if (summary.hasUnavailableItems) {
    return { ok: false, error: "Your cart has items that are no longer available. Please review your cart." };
  }

  const { data: address } = await supabase
    .from("customer_addresses")
    .select("id, postal_code")
    .eq("id", addressId)
    .eq("customer_id", customer.id)
    .maybeSingle();

  if (!address) return { ok: false, error: "Delivery address not found." };

  const storeResult = await resolveFulfillmentStore(supabase, customer.organization_id);
  if (!storeResult.ok) {
    return { ok: false, error: `Delivery is not currently available: ${storeResult.reason}` };
  }

  const pickupResult = await resolveActivePickupMapping(supabase, customer.organization_id, storeResult.storeId);
  if (!pickupResult.ok) {
    return { ok: false, error: `Delivery is not currently available: ${pickupResult.reason}` };
  }

  const itemIds = summary.lines.map((line) => line.itemId);
  const { data: items } = await supabase
    .from("items")
    .select("id, weight_kg")
    .eq("organization_id", customer.organization_id)
    .eq("is_active", true)
    .in("id", itemIds);

  const weightById = new Map((items ?? []).map((item) => [item.id, item.weight_kg as number | null]));

  const weightResult = calculateTotalShipmentWeightKg(
    summary.lines.map((line) => ({ weightKg: weightById.get(line.itemId) ?? null, quantity: line.quantity })),
  );
  if (!weightResult.ok) {
    return { ok: false, error: weightResult.reason };
  }

  let freshShippingTotal: number;
  try {
    const quote = await getShippingQuote({
      pickupPostcode: pickupResult.pickupPostcode,
      deliveryPostcode: address.postal_code,
      weightKg: weightResult.totalWeightKg,
      cod: paymentMethod === "COD",
    });

    if (!quote.serviceable) {
      return { ok: false, error: "Delivery is not currently available for this address." };
    }

    const selected = quote.options.find(
      (option) => String(option.courierId) === courierId && !option.isBlocked,
    );

    if (!selected) {
      return {
        ok: false,
        error: "Your selected shipping option is no longer available. Please choose again.",
      };
    }

    freshShippingTotal = selected.shippingTotal;
  } catch (err) {
    if (err instanceof ShiprocketError) return { ok: false, error: toSafeClientMessage(err) };
    return { ok: false, error: "Unable to calculate shipping right now. Please try again." };
  }

  const { data, error } = await supabase.rpc("create_checkout_session", {
    p_shipping_address_id: addressId,
    p_fulfillment_store_id: storeResult.storeId,
    p_courier_id: courierId,
    p_shipping_total: freshShippingTotal,
    p_payment_method: paymentMethod,
    p_idempotency_key: idempotencyKey,
  });

  if (error || !data || data.length === 0) {
    return { ok: false, error: "Could not start checkout. Please try again." };
  }

  const row = data[0]!;
  return {
    ok: true,
    checkoutSessionId: row.out_checkout_session_id,
    grandTotal: row.out_grand_total,
    currency: row.out_currency,
  };
}
