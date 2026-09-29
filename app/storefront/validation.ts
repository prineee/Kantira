// Plain synchronous parsing, split out of actions.ts because a "use server"
// file may only export async functions (same convention as
// app/stores/validation.ts).

// The toggle form submits exactly "true" or "false". Anything else is
// rejected rather than coerced, so a malformed or tampered request can never
// silently flip the storefront.
export function parseStorefrontEnabled(formData: FormData): boolean | null {
  const raw = formData.get("enabled");
  if (raw === "true") return true;
  if (raw === "false") return false;
  return null;
}

const OTHER_STOREFRONT_PATTERN = /another organization is already configured as the public storefront/i;
const NOT_OWNER_PATTERN = /only the organization owner/i;

// Maps a database error to a user-facing message. Never returns the raw
// database message (internal errors must not be exposed).
export function storefrontToggleErrorMessage(dbMessage: string | null | undefined): string {
  const message = dbMessage ?? "";
  if (OTHER_STOREFRONT_PATTERN.test(message)) {
    return "Another organization is already the public KANTIRA storefront, so this one cannot be enabled.";
  }
  if (NOT_OWNER_PATTERN.test(message)) {
    return "Only the organization owner can turn the storefront on or off.";
  }
  return "Could not update the storefront setting. Please try again.";
}
