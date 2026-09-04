// Types for the KANTIRA <-> Shiprocket server-side integration.
//
// Field names/shapes here reflect ONLY what was actually observed from live
// read-only calls against apiv2.shiprocket.in on 2026-09-02 (auth/login,
// settings/company/pickup, courier/serviceability). Nothing here is a
// guess from public docs — where a field's presence or meaning wasn't
// confirmed live, it is omitted rather than assumed.

export type ShiprocketPickupLocation = {
  id: number;
  nickname: string;
  city: string;
  state: string;
  country: string;
  pinCode: string;
  /** Raw Shiprocket status code as returned (observed values: 1, 2 — exact
   * meaning of each value was not further verified). */
  status: number;
  phoneVerified: boolean;
};

export type ShippingQuoteInput = {
  pickupPostcode: string;
  deliveryPostcode: string;
  weightKg: number;
  cod: boolean;
};

export type ShippingOption = {
  courierId: number;
  courierName: string;
  isSurface: boolean;
  /** Chargeable weight Shiprocket actually billed against (may exceed the
   * requested weight due to volumetric rounding). */
  chargeableWeightKg: number;
  freightCharge: number;
  /** 0 when cod=false was requested; the actual Shiprocket-computed COD fee
   * when cod=true. Never independently recomputed — see serviceability.ts. */
  codCharge: number;
  /** freightCharge + codCharge, matching the verified `rate` field Shiprocket
   * itself returns (confirmed equal in live testing). Does NOT include the
   * separate `surge` line item Shiprocket also returns (see rawSurgeCharge). */
  shippingTotal: number;
  /** Seller-surge charge observed as a field separate from `rate`/freight
   * charge. Not folded into shippingTotal — whether KANTIRA should pass this
   * on to the customer is an open business decision (see PHASE_5B-8B docs). */
  rawSurgeCharge: number | null;
  estimatedDeliveryDays: string | null;
  estimatedDeliveryDate: string | null;
  ratingOutOf5: number | null;
  isBlocked: boolean;
};

export type ShippingQuoteResult =
  | { serviceable: true; recommendedCourierId: number | null; options: ShippingOption[] }
  | { serviceable: false; reason: string };

export type ShiprocketAuthProfile = {
  id: number;
  companyId: number;
  firstName: string;
  lastName: string;
  createdAt: string;
};
