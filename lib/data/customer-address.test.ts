import test from "node:test";
import assert from "node:assert/strict";
import {
  validateCustomerAddress,
  hasFieldErrors,
  normalizeIndianPhone,
  sanitizeInternalRedirect,
  selectCheckoutAddress,
  type CustomerAddressInput,
} from "./customer-address";

function validInput(overrides: Partial<CustomerAddressInput> = {}): CustomerAddressInput {
  return {
    recipientName: "Jane Doe",
    phone: "9876543210",
    line1: "123 Main Street",
    line2: "",
    city: "Bengaluru",
    state: "Karnataka",
    postalCode: "560001",
    country: "IN",
    isDefault: false,
    ...overrides,
  };
}

test("a fully valid address has no field errors", () => {
  assert.equal(hasFieldErrors(validateCustomerAddress(validInput())), false);
});

test("rejects an empty recipient name", () => {
  const errors = validateCustomerAddress(validInput({ recipientName: "  " }));
  assert.ok(errors.recipientName);
});

test("accepts a bare 10-digit mobile and common prefixed variants, rejects garbage", () => {
  assert.equal(hasFieldErrors(validateCustomerAddress(validInput({ phone: "9876543210" }))), false);
  assert.equal(hasFieldErrors(validateCustomerAddress(validInput({ phone: "+91 98765 43210" }))), false);
  assert.equal(hasFieldErrors(validateCustomerAddress(validInput({ phone: "09876543210" }))), false);
  assert.ok(validateCustomerAddress(validInput({ phone: "12345" })).phone);
  assert.ok(validateCustomerAddress(validInput({ phone: "1234567890" })).phone, "must start 6-9");
  assert.ok(validateCustomerAddress(validInput({ phone: "not-a-phone" })).phone);
});

test("rejects empty line1/city/state", () => {
  assert.ok(validateCustomerAddress(validInput({ line1: "" })).line1);
  assert.ok(validateCustomerAddress(validInput({ city: "" })).city);
  assert.ok(validateCustomerAddress(validInput({ state: "" })).state);
});

test("Indian PIN code validation: exactly 6 digits, never starting with 0", () => {
  assert.equal(hasFieldErrors(validateCustomerAddress(validInput({ postalCode: "560001" }))), false);
  assert.ok(validateCustomerAddress(validInput({ postalCode: "056001" })).postalCode);
  assert.ok(validateCustomerAddress(validInput({ postalCode: "12345" })).postalCode);
  assert.ok(validateCustomerAddress(validInput({ postalCode: "1234567" })).postalCode);
  assert.ok(validateCustomerAddress(validInput({ postalCode: "56000A" })).postalCode);
});

// A syntactically valid PIN code is a format check only — this module
// makes no deliverability claim, and never will (that's a live
// Shiprocket serviceability call elsewhere, not a regex).
test("a valid-format PIN code is not itself a deliverability claim", () => {
  const errors = validateCustomerAddress(validInput({ postalCode: "999999" }));
  assert.equal(hasFieldErrors(errors), false);
});

test("only India is accepted as a country today", () => {
  assert.equal(hasFieldErrors(validateCustomerAddress(validInput({ country: "IN" }))), false);
  assert.equal(hasFieldErrors(validateCustomerAddress(validInput({ country: "in" }))), false);
  assert.ok(validateCustomerAddress(validInput({ country: "US" })).country);
});

test("sanitizeInternalRedirect only allows a same-origin, path-only redirect", () => {
  assert.equal(sanitizeInternalRedirect("/checkout", "/account/addresses"), "/checkout");
  assert.equal(sanitizeInternalRedirect(undefined, "/account/addresses"), "/account/addresses");
  assert.equal(
    sanitizeInternalRedirect("https://evil.example.com", "/account/addresses"),
    "/account/addresses",
  );
  assert.equal(sanitizeInternalRedirect("//evil.example.com", "/account/addresses"), "/account/addresses");
  assert.equal(sanitizeInternalRedirect(["/checkout", "/other"], "/account/addresses"), "/checkout");
});

test("normalizeIndianPhone strips common prefixes down to a bare 10-digit number", () => {
  assert.equal(normalizeIndianPhone("9876543210"), "9876543210");
  assert.equal(normalizeIndianPhone("+91 98765 43210"), "9876543210");
  assert.equal(normalizeIndianPhone("919876543210"), "9876543210");
  assert.equal(normalizeIndianPhone("09876543210"), "9876543210");
});

const ADDR_1 = { id: "addr-1", isDefault: false };
const ADDR_2_DEFAULT = { id: "addr-2", isDefault: true };
const ADDR_3 = { id: "addr-3", isDefault: false };

test("selectCheckoutAddress prefers an explicitly requested id that belongs to the list", () => {
  const result = selectCheckoutAddress([ADDR_1, ADDR_2_DEFAULT, ADDR_3], "addr-3");
  assert.equal(result?.id, "addr-3");
});

test("selectCheckoutAddress falls back to the default address when no id is requested", () => {
  const result = selectCheckoutAddress([ADDR_1, ADDR_2_DEFAULT, ADDR_3], undefined);
  assert.equal(result?.id, "addr-2");
});

test("selectCheckoutAddress ignores a requested id that isn't in the list (never trusts it blindly)", () => {
  const result = selectCheckoutAddress([ADDR_1, ADDR_2_DEFAULT], "not-owned-by-this-customer");
  assert.equal(result?.id, "addr-2");
});

test("selectCheckoutAddress falls back to the first address when none is default", () => {
  const result = selectCheckoutAddress([ADDR_1, ADDR_3], undefined);
  assert.equal(result?.id, "addr-1");
});

test("selectCheckoutAddress returns null for an empty list", () => {
  assert.equal(selectCheckoutAddress([], undefined), null);
});
