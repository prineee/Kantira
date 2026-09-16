// Plain synchronous validation, split out of actions.ts because a "use
// server" file may only export async functions — this module intentionally
// has no "use server" directive.

export function readStoreFields(formData: FormData) {
  return {
    store_code: String(formData.get("store_code") ?? "").trim(),
    store_name: String(formData.get("store_name") ?? "").trim(),
    type: String(formData.get("type") ?? "COMPANY").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    city: String(formData.get("city") ?? "").trim(),
    address: String(formData.get("address") ?? "").trim(),
  };
}

export type StoreType = "COMPANY" | "FRANCHISE";

function isStoreType(value: string): value is StoreType {
  return value === "COMPANY" || value === "FRANCHISE";
}

export function validate(fields: ReturnType<typeof readStoreFields>): string | null {
  if (!fields.store_code) return "Store code is required.";
  if (!fields.store_name) return "Store name is required.";
  if (!isStoreType(fields.type)) return "Invalid store type.";
  return null;
}
