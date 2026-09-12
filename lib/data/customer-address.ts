// Pure, DB-agnostic validation for customer delivery addresses (Phase 4C).
// No Supabase client here — see storefront-catalog.ts for why this repo
// keeps that split. The DB-calling counterpart is lib/actions/customer-addresses.ts.
//
// Reuses the existing `public.customer_addresses` table as-is (migration
// 0015, Phase 3B/5A) — recipient_name/line1/line2 naming, not the brief's
// full_name/address_line_1/address_line_2 — since an equivalent schema
// already exists and the brief explicitly says not to duplicate one.
// `landmark` has no column on that table and is intentionally not added
// here (out of scope: the accepted table doesn't have it, and adding a
// column is a schema change this phase doesn't need for anything else).

// Indian PIN codes are exactly 6 digits and never start with 0. This is a
// FORMAT check only — it says nothing about whether Shiprocket can
// actually deliver to this pincode (that's the separate, live
// serviceability call in app/checkout/actions.ts).
const INDIAN_PINCODE_RE = /^[1-9][0-9]{5}$/;

// Accepts a bare 10-digit Indian mobile number or one with a +91/91/0
// prefix, digits only after stripping spaces/hyphens. Deliberately
// permissive about formatting punctuation, strict about the digit shape.
const PHONE_RE = /^(?:\+?91[-\s]?|0)?[6-9]\d{9}$/;

export type CustomerAddressInput = {
  recipientName: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
};

export type CustomerAddressFieldErrors = Partial<
  Record<keyof CustomerAddressInput, string>
>;

// Only India is served today (Shiprocket, GST, INR are all India-specific
// throughout this codebase) — the table's own `country` column already
// defaults to 'IN' (migration 0015). Validating it strictly rather than
// silently accepting other values avoids quietly collecting addresses this
// platform cannot actually ship to.
export function validateCustomerAddress(
  input: CustomerAddressInput,
): CustomerAddressFieldErrors {
  const errors: CustomerAddressFieldErrors = {};

  if (!input.recipientName.trim()) {
    errors.recipientName = "Enter the recipient's full name.";
  }
  if (!PHONE_RE.test(input.phone.replace(/[\s-]/g, ""))) {
    errors.phone = "Enter a valid 10-digit Indian mobile number.";
  }
  if (!input.line1.trim()) {
    errors.line1 = "Enter the address.";
  }
  if (!input.city.trim()) {
    errors.city = "Enter the city.";
  }
  if (!input.state.trim()) {
    errors.state = "Enter the state.";
  }
  if (!INDIAN_PINCODE_RE.test(input.postalCode.trim())) {
    errors.postalCode = "Enter a valid 6-digit Indian PIN code.";
  }
  if (input.country.trim().toUpperCase() !== "IN") {
    errors.country = "Only delivery addresses within India are supported today.";
  }

  return errors;
}

export function hasFieldErrors(errors: CustomerAddressFieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

// Used by the address create/edit pages' optional `?redirect=` param (e.g.
// checkout linking here when the customer has no saved address yet, then
// back to /checkout after saving). Only ever allows a same-origin,
// path-only redirect — never a full URL or a protocol-relative `//host`
// path — to avoid turning this into an open redirect.
export function sanitizeInternalRedirect(
  raw: string | string[] | undefined,
  fallback: string,
): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

// Normalizes phone into the shape stored/displayed everywhere else in this
// codebase's customer-facing surfaces: digits only, no country-code
// prefix, since Shiprocket and every UI here already assume a bare
// 10-digit number.
export function normalizeIndianPhone(phone: string): string {
  const digitsOnly = phone.replace(/[\s-]/g, "").replace(/^(\+?91|0)/, "");
  return digitsOnly;
}

// Checkout's address-selection rule: an explicitly requested id (the
// ?address= query param) wins if it's actually one of this customer's own
// addresses, else the customer's default, else their most recent. `list`
// must already be scoped to the caller's own addresses (RLS —
// customer_addresses_select_self) before this ever runs; this function
// only picks among rows it's handed, it never widens access.
export function selectCheckoutAddress<T extends { id: string; isDefault: boolean }>(
  list: T[],
  requestedId: string | undefined,
): T | null {
  if (requestedId) {
    const requested = list.find((a) => a.id === requestedId);
    if (requested) return requested;
  }
  return list.find((a) => a.isDefault) ?? list[0] ?? null;
}
