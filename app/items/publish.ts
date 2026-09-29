// Plain synchronous helpers for the item "Storefront" field, split out of
// actions.ts because a "use server" file may only export async functions.

export const PUBLISH_FIELD = "is_published";

// Returns undefined when the field was not submitted (e.g. a STOCK user's
// form, which never renders it), true/false for the two valid values, and
// null for anything else — a tampered value is rejected, never coerced.
export function parsePublishField(formData: FormData): boolean | null | undefined {
  const raw = formData.get(PUBLISH_FIELD);
  if (raw === null) return undefined;
  if (raw === "published") return true;
  if (raw === "hidden") return false;
  return null;
}

const PUBLISH_DENIED_PATTERN = /only an owner or admin can publish/i;

export function isPublishDeniedError(message: string | null | undefined): boolean {
  return PUBLISH_DENIED_PATTERN.test(message ?? "");
}

export const PUBLISH_DENIED_MESSAGE =
  "Only an owner or admin can publish or hide items on the storefront.";
