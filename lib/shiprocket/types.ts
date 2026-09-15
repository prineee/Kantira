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

// ============================================================
// Order/shipment creation (Phase 5A-2) — UNVERIFIED CONTRACT.
//
// Unlike everything above (auth, pickup, serviceability — each verified
// live against a real account per this file's header), NOTHING below this
// line has been exercised against a live Shiprocket account from this
// repository. It is built from Shiprocket's published external API v1
// documentation (POST /orders/create/adhoc, POST /courier/assign/awb) as
// of implementation time, following the exact same field-naming
// conventions already confirmed live for serviceability/pickup (snake_case
// wire format, mapped to camelCase KANTIRA types). Field names, required-
// ness, and response shape MUST be re-confirmed against a real sandbox
// call (Phase 5A-2 Step 10, CTO-authorized only) before this is trusted —
// do not treat any type below as verified. Where the public docs are
// themselves ambiguous, the more conservative/defensive reading is used
// and called out below.
// ============================================================

export type CreateOrderLineInput = {
  name: string;
  sku: string;
  units: number;
  sellingPrice: number;
  /** Per Shiprocket's docs this is a per-unit discount amount, not a
   * percentage — unverified live. */
  discount: number;
  /** Per Shiprocket's docs this is the line's tax amount — unverified
   * whether per-unit or per-line total; KANTIRA passes online_order_lines'
   * own line-level tax_amount as-is. */
  tax: number;
  hsn: string | null;
};

export type CreateOrderInput = {
  /** KANTIRA's own online_orders.order_number — sent as Shiprocket's
   * `order_id` (their "channel order id"). This is the deterministic
   * reference reconciliation (getOrderByChannelId below) is keyed on —
   * never a freshly-generated value per attempt, so a retry after an
   * uncertain result can look up the SAME reference rather than risk a
   * second provider-side order. */
  channelOrderId: string;
  orderDate: string; // "YYYY-MM-DD HH:mm"
  pickupLocationNickname: string;
  paymentMethod: "Prepaid" | "COD";
  subTotal: number;
  billing: {
    customerName: string;
    lastName: string;
    address: string;
    address2: string | null;
    city: string;
    state: string;
    pincode: string;
    country: string;
    email: string;
    phone: string;
  };
  lines: CreateOrderLineInput[];
  /** Package dimensions/weight. KANTIRA does not model per-item physical
   * dimensions today (only weight_kg) — length/breadth/height below are a
   * placeholder default, not derived from real product data. Flagged as a
   * known gap, not silently invented as if accurate. */
  weightKg: number;
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
};

export type CreateOrderResult =
  | {
      ok: true;
      providerOrderId: string;
      providerShipmentId: string;
      /** Shiprocket's own inner status string for the created order
       * (observed field name from docs: `status`), e.g. "NEW". Persisted
       * as-is, not mapped to a KANTIRA shipment status here — order.ts's
       * caller decides that. */
      providerStatus: string | null;
      /** Present only when Shiprocket auto-assigns a courier at order-
       * creation time (not guaranteed) — otherwise assignAwb() is a
       * separate follow-up call. */
      awbCode: string | null;
      courierCompanyId: number | null;
    }
  | { ok: false; reason: string };

export type AssignAwbResult =
  | {
      ok: true;
      awbCode: string;
      courierCompanyId: number;
      courierName: string | null;
    }
  | { ok: false; reason: string };

/** Reconciliation lookup — "did a create request KANTIRA already sent
 * actually take effect on Shiprocket's side?", keyed by the same
 * channelOrderId used in CreateOrderInput. Endpoint/shape per Shiprocket's
 * published "Get order details" filtered-by-channel-order-id contract —
 * unverified live, same caveat as above.
 *
 * Three-way, deliberately: a well-formed response with no matching row is
 * a genuine, actionable "not_found" (safe to resolve back to PENDING). A
 * response that cannot be recognized at all (missing/wrong-shaped `data`,
 * or a matching row missing the fields needed to trust it) is "unknown" —
 * NEVER collapsed into "not_found", because a false not_found could let a
 * human retry into a duplicate real Shiprocket order. Only "found" and
 * "not_found" may ever resolve the shipment; "unknown" must leave it
 * ATTEMPTED for manual reconciliation (see app/orders/actions.ts's
 * reconcileShipmentAttempt). A thrown ShiprocketError (network/timeout/
 * api_error) is a distinct, separate case — never turned into any of
 * these three — handled by the caller's own try/catch. */
export type OrderLookupResult =
  | {
      status: "found";
      providerOrderId: string;
      providerShipmentId: string | null;
      providerStatus: string | null;
      awbCode: string | null;
      courierCompanyId: number | null;
      courierName: string | null;
    }
  | { status: "not_found" }
  | { status: "unknown"; reason: string };
