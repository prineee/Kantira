import type { CheckoutShippingQuoteInput } from "./actions";

// Plain synchronous validation, split out of actions.ts because a "use
// server" file may only export async functions — this module intentionally
// has no "use server" directive.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
