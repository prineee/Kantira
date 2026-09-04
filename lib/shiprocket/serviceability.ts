import { shiprocketGet } from "./client";
import { ShiprocketError } from "./errors";
import type { ShippingOption, ShippingQuoteInput, ShippingQuoteResult } from "./types";

// Server-only. Never import from a Client Component.
//
// Verified live (2026-09-02) against
// GET {baseUrl}/courier/serviceability/?pickup_postcode=&delivery_postcode=&weight=&cod=(0|1):
//
//   - success: HTTP 200, body has top-level `data.available_courier_companies`
//     (array) plus `data.recommended_courier_company_id`. Each courier item's
//     fields actually observed and used below: courier_company_id,
//     courier_name, is_surface, charge_weight, freight_charge, cod_charges,
//     rate, estimated_delivery_days, etd, rating, blocked, surge (array of
//     { charge, cod_surge, ... }).
//
//     Confirmed by direct arithmetic on live responses: rate ==
//     freight_charge + cod_charges in both the cod=0 case (cod_charges=0)
//     and the cod=1 case. This is the source for ShippingOption.shippingTotal
//     — never independently recomputed. Note `surge` is a further charge
//     Shiprocket returns separately from `rate`; it is surfaced as
//     rawSurgeCharge but NOT folded into shippingTotal (open business
//     decision, not this phase's call to make).
//
//   - "no courier"/invalid-pincode failures come back as HTTP 200 (not a
//     4xx) with NO `data` key at all — instead `{ status: 404 | 400,
//     message: "..." }`. This was verified for two concrete cases: an
//     unassigned-but-well-formed destination pincode (status 404, "No
//     courier service available between X and Y") and a malformed pincode
//     (status 400, "Invalid Delivery Pincode"). Both are treated as
//     `{ serviceable: false }` here, not thrown as errors — this is an
//     expected business outcome, not a system failure.

const PINCODE_RE = /^[1-9][0-9]{5}$/; // Indian 6-digit pincode, first digit non-zero

export function validateShippingQuoteInput(input: ShippingQuoteInput): string | null {
  if (!PINCODE_RE.test(input.pickupPostcode)) return "Invalid pickup pincode.";
  if (!PINCODE_RE.test(input.deliveryPostcode)) return "Invalid delivery pincode.";
  if (!Number.isFinite(input.weightKg) || input.weightKg <= 0) {
    return "Package weight must be a positive number.";
  }
  if (input.weightKg > 50) {
    // Sanity bound, not a Shiprocket-verified limit — guards against an
    // obviously-wrong client-supplied value reaching the API at all.
    return "Package weight looks too large to be valid.";
  }
  return null;
}

type RawCourier = {
  courier_company_id: number;
  courier_name: string;
  is_surface: boolean;
  charge_weight: number;
  freight_charge: number;
  cod_charges: number;
  rate: number;
  estimated_delivery_days: string | null;
  etd: string | null;
  rating: number | null;
  blocked: number;
  surge?: { charge: number; cod_surge: number }[];
};

function normalizeCourier(raw: RawCourier): ShippingOption {
  const surgeTotal = Array.isArray(raw.surge)
    ? raw.surge.reduce((sum, s) => sum + (s.charge ?? 0), 0)
    : null;

  return {
    courierId: raw.courier_company_id,
    courierName: raw.courier_name,
    isSurface: raw.is_surface,
    chargeableWeightKg: raw.charge_weight,
    freightCharge: raw.freight_charge,
    codCharge: raw.cod_charges,
    shippingTotal: raw.freight_charge + raw.cod_charges,
    rawSurgeCharge: surgeTotal,
    estimatedDeliveryDays: raw.estimated_delivery_days || null,
    estimatedDeliveryDate: raw.etd || null,
    ratingOutOf5: raw.rating,
    isBlocked: raw.blocked === 1,
  };
}

export async function getShippingQuote(input: ShippingQuoteInput): Promise<ShippingQuoteResult> {
  const validationError = validateShippingQuoteInput(input);
  if (validationError) {
    throw new ShiprocketError("invalid_input", validationError);
  }

  const params = new URLSearchParams({
    pickup_postcode: input.pickupPostcode,
    delivery_postcode: input.deliveryPostcode,
    weight: String(input.weightKg),
    cod: input.cod ? "1" : "0",
  });

  const json = (await shiprocketGet(`/courier/serviceability/?${params.toString()}`)) as {
    data?: { available_courier_companies?: RawCourier[]; recommended_courier_company_id?: number };
    status?: number;
    message?: string;
  };

  if (!json.data) {
    // Verified business-level "not serviceable" shape — not a thrown error.
    return { serviceable: false, reason: json.message ?? "Not serviceable." };
  }

  const list = json.data.available_courier_companies;
  if (!Array.isArray(list)) {
    throw new ShiprocketError("api_error", "Shiprocket serviceability response was malformed.");
  }

  return {
    serviceable: true,
    recommendedCourierId: json.data.recommended_courier_company_id ?? null,
    options: list.map(normalizeCourier),
  };
}
