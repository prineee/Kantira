"use server";

import { requireCustomerContext } from "@/lib/actions/customer-auth";
import { calculateTotalShipmentWeightKg } from "@/lib/shipping/weight";
import { resolveFulfillmentStore, resolveActivePickupMapping } from "@/lib/shipping/fulfillment";
import { getShippingQuote } from "@/lib/shiprocket/serviceability";
import { ShiprocketError, toSafeClientMessage } from "@/lib/shiprocket/errors";

// Customer-facing checkout shipping quote. Unlike every other action in
// this codebase (all internal-staff CRUD forms bound to useFormState /
// FormData), this is the first action called with plain structured
// arguments from a future customer-facing client, so it returns a
// discriminated `{ ok: true/false }` result instead of the `{ error }`
// form-action convention — the shape those other actions use doesn't fit a
// non-form caller, but the same rule they follow still applies: never trust
// client-supplied price/weight, and never leak an internal error verbatim.
//
// This function's job stops at "produce a shipping quote". It does not
// create an order, does not touch Shiprocket beyond the read-only
// serviceability/rate call already implemented in lib/shiprocket, and does
// not compute an item subtotal/tax (no reusable, non-mutating authoritative
// subtotal/tax calculation exists outside of create_online_order() itself,
// so this action does not duplicate that logic here — unchanged since
// Phase 5B-8C).
//
// getCheckoutShippingQuoteCore() takes its collaborators as parameters
// (defaulted to the real ones) purely so tests can exercise the full
// orchestration without a module-mocking setup. Application code should
// only ever call the exported getCheckoutShippingQuote() Server Action
// below, which always uses the real dependencies.

const PINCODE_RE = /^[1-9][0-9]{5}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CartLineInput = { itemId: string; quantity: number };

export type CheckoutShippingQuoteInput = {
  addressId: string;
  itemLines: CartLineInput[];
  paymentMethod: "PREPAID" | "COD";
};

export type CheckoutShippingOption = {
  courierId: number;
  courierName: string;
  isSurface: boolean;
  chargeableWeightKg: number;
  freightCharge: number;
  codCharge: number;
  /** Equals Shiprocket's own `rate` (freight_charge + cod_charges), verified
   * live across multiple couriers/routes/weights in Phase 5B-8B.1. Never
   * includes Shiprocket's separate `surge` charge — that field is not
   * exposed to the customer at all, not merely excluded from this total. */
  shippingTotal: number;
  estimatedDeliveryDays: string | null;
  estimatedDeliveryDate: string | null;
  ratingOutOf5: number | null;
};

export type CheckoutShippingQuoteResult =
  | { ok: true; recommendedCourierId: number | null; options: CheckoutShippingOption[] }
  | { ok: false; error: string };

export function validateInput(input: CheckoutShippingQuoteInput): string | null {
  if (!UUID_RE.test(input.addressId)) return "Invalid delivery address.";
  if (input.paymentMethod !== "PREPAID" && input.paymentMethod !== "COD") {
    return "Invalid payment method.";
  }
  if (!Array.isArray(input.itemLines) || input.itemLines.length === 0) {
    return "Your cart is empty.";
  }
  for (const line of input.itemLines) {
    if (!UUID_RE.test(line.itemId)) return "Invalid item in cart.";
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      return "Invalid quantity in cart.";
    }
  }
  return null;
}

type CustomerSupabaseClient = NonNullable<
  Awaited<ReturnType<typeof requireCustomerContext>>["supabase"]
>;

type CoreDeps = {
  requireCustomerContext: typeof requireCustomerContext;
  calculateTotalShipmentWeightKg: typeof calculateTotalShipmentWeightKg;
  resolveFulfillmentStore: typeof resolveFulfillmentStore;
  resolveActivePickupMapping: typeof resolveActivePickupMapping;
  getShippingQuote: typeof getShippingQuote;
};

const realDeps: CoreDeps = {
  requireCustomerContext,
  calculateTotalShipmentWeightKg,
  resolveFulfillmentStore,
  resolveActivePickupMapping,
  getShippingQuote,
};

async function loadAuthoritativeItemWeights(
  supabase: CustomerSupabaseClient,
  organizationId: string,
  itemIds: string[],
): Promise<{ id: string; weight_kg: number | null }[] | null> {
  const { data } = await supabase
    .from("items")
    .select("id, weight_kg")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .in("id", itemIds);

  return data as { id: string; weight_kg: number | null }[] | null;
}

export async function getCheckoutShippingQuoteCore(
  input: CheckoutShippingQuoteInput,
  deps: CoreDeps = realDeps,
): Promise<CheckoutShippingQuoteResult> {
  const ctx = await deps.requireCustomerContext();
  if (ctx.error) return { ok: false, error: ctx.error };
  const { supabase, customer } = ctx;

  const validationError = validateInput(input);
  if (validationError) return { ok: false, error: validationError };

  const { data: address } = await supabase
    .from("customer_addresses")
    .select("id, postal_code")
    .eq("id", input.addressId)
    .eq("customer_id", customer.id)
    .maybeSingle();

  if (!address) return { ok: false, error: "Delivery address not found." };
  if (!PINCODE_RE.test(address.postal_code)) {
    return { ok: false, error: "The saved delivery address has an invalid pincode." };
  }

  const itemIds = input.itemLines.map((l) => l.itemId);
  const items = await loadAuthoritativeItemWeights(supabase, customer.organization_id, itemIds);

  const itemsById = new Map((items ?? []).map((i) => [i.id, i]));
  if (itemIds.some((id) => !itemsById.has(id))) {
    return { ok: false, error: "One or more items in your cart are no longer available." };
  }

  const weightResult = deps.calculateTotalShipmentWeightKg(
    input.itemLines.map((line) => ({
      weightKg: itemsById.get(line.itemId)!.weight_kg,
      quantity: line.quantity,
    })),
  );
  if (!weightResult.ok) {
    return { ok: false, error: weightResult.reason };
  }

  const storeResult = await deps.resolveFulfillmentStore(supabase, customer.organization_id);
  if (!storeResult.ok) {
    return { ok: false, error: "FULFILLMENT CONFIGURATION REQUIRED: " + storeResult.reason };
  }

  const pickupResult = await deps.resolveActivePickupMapping(
    supabase,
    customer.organization_id,
    storeResult.storeId,
  );
  if (!pickupResult.ok) {
    return { ok: false, error: "PICKUP MAPPING REQUIRED: " + pickupResult.reason };
  }

  try {
    const quote = await deps.getShippingQuote({
      pickupPostcode: pickupResult.pickupPostcode,
      deliveryPostcode: address.postal_code,
      weightKg: weightResult.totalWeightKg,
      cod: input.paymentMethod === "COD",
    });

    if (!quote.serviceable) {
      return { ok: false, error: "Delivery is not currently available for this address." };
    }

    return {
      ok: true,
      recommendedCourierId: quote.recommendedCourierId,
      options: quote.options
        .filter((o) => !o.isBlocked)
        .map((o) => ({
          courierId: o.courierId,
          courierName: o.courierName,
          isSurface: o.isSurface,
          chargeableWeightKg: o.chargeableWeightKg,
          freightCharge: o.freightCharge,
          codCharge: o.codCharge,
          shippingTotal: o.shippingTotal,
          estimatedDeliveryDays: o.estimatedDeliveryDays,
          estimatedDeliveryDate: o.estimatedDeliveryDate,
          ratingOutOf5: o.ratingOutOf5,
        })),
    };
  } catch (err) {
    if (err instanceof ShiprocketError) {
      return { ok: false, error: toSafeClientMessage(err) };
    }
    return { ok: false, error: "Unable to calculate shipping right now. Please try again." };
  }
}

export async function getCheckoutShippingQuote(
  input: CheckoutShippingQuoteInput,
): Promise<CheckoutShippingQuoteResult> {
  return getCheckoutShippingQuoteCore(input);
}
