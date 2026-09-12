"use server";

import { revalidatePath } from "next/cache";
import { requireCustomerContext } from "@/lib/actions/customer-auth";
import { isValidUuid } from "@/lib/data/storefront-catalog";
import {
  hasFieldErrors,
  normalizeIndianPhone,
  validateCustomerAddress,
  type CustomerAddressFieldErrors,
  type CustomerAddressInput,
} from "@/lib/data/customer-address";

export type AddressActionResult =
  | { error: string | null; fieldErrors?: CustomerAddressFieldErrors }
  | { error: null; addressId: string };

// Every write below derives customer_id/organization_id strictly from the
// authenticated session (requireCustomerContext), never from a
// client-supplied value — a browser can only ever send the address's own
// fields (name/phone/lines/city/state/pincode/country) and, for
// update/delete/setDefault, an address id. RLS (customer_addresses_*_self,
// migration 0015) re-enforces ownership regardless of what this layer
// does, and the enforce_single_default_address trigger (0015) atomically
// clears any previous default — verified against a live local Postgres
// instance this phase (see the session's own verification notes), not
// assumed.

function readAddressInput(formData: FormData): CustomerAddressInput {
  return {
    recipientName: String(formData.get("recipientName") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    line1: String(formData.get("line1") ?? "").trim(),
    line2: String(formData.get("line2") ?? "").trim(),
    city: String(formData.get("city") ?? "").trim(),
    state: String(formData.get("state") ?? "").trim(),
    postalCode: String(formData.get("postalCode") ?? "").trim(),
    country: String(formData.get("country") ?? "IN").trim() || "IN",
    isDefault: formData.get("isDefault") === "on",
  };
}

export async function createAddressAction(
  formData: FormData,
): Promise<AddressActionResult> {
  const ctx = await requireCustomerContext();
  if (ctx.error) return { error: ctx.error };

  const input = readAddressInput(formData);
  const fieldErrors = validateCustomerAddress(input);
  if (hasFieldErrors(fieldErrors)) {
    return { error: "Please fix the highlighted fields.", fieldErrors };
  }

  const { data, error } = await ctx.supabase
    .from("customer_addresses")
    .insert({
      organization_id: ctx.customer.organization_id,
      customer_id: ctx.customer.id,
      recipient_name: input.recipientName,
      phone: normalizeIndianPhone(input.phone),
      line1: input.line1,
      line2: input.line2 || null,
      city: input.city,
      state: input.state,
      postal_code: input.postalCode,
      country: input.country.toUpperCase(),
      is_default: input.isDefault,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: "Could not save this address. Please try again." };
  }

  revalidatePath("/account/addresses");
  revalidatePath("/checkout");
  return { error: null, addressId: data.id };
}

export async function updateAddressAction(
  addressId: string,
  formData: FormData,
): Promise<AddressActionResult> {
  if (!isValidUuid(addressId)) {
    return { error: "That address could not be found." };
  }

  const ctx = await requireCustomerContext();
  if (ctx.error) return { error: ctx.error };

  const input = readAddressInput(formData);
  const fieldErrors = validateCustomerAddress(input);
  if (hasFieldErrors(fieldErrors)) {
    return { error: "Please fix the highlighted fields.", fieldErrors };
  }

  // customer_addresses_update_self's WITH CHECK (migration 0015) re-verifies
  // ownership and organization_id server-side regardless of this filter —
  // this .eq() is the query scope, not the security boundary.
  const { error } = await ctx.supabase
    .from("customer_addresses")
    .update({
      recipient_name: input.recipientName,
      phone: normalizeIndianPhone(input.phone),
      line1: input.line1,
      line2: input.line2 || null,
      city: input.city,
      state: input.state,
      postal_code: input.postalCode,
      country: input.country.toUpperCase(),
      is_default: input.isDefault,
    })
    .eq("id", addressId);

  if (error) {
    return { error: "Could not update this address. Please try again." };
  }

  revalidatePath("/account/addresses");
  revalidatePath("/checkout");
  return { error: null, addressId };
}

export async function deleteAddressAction(
  addressId: string,
): Promise<{ error: string | null }> {
  if (!isValidUuid(addressId)) {
    return { error: "That address could not be found." };
  }

  const ctx = await requireCustomerContext();
  if (ctx.error) return { error: ctx.error };

  const { error } = await ctx.supabase
    .from("customer_addresses")
    .delete()
    .eq("id", addressId);

  if (error) {
    return { error: "Could not delete this address." };
  }

  revalidatePath("/account/addresses");
  revalidatePath("/checkout");
  return { error: null };
}

export async function setDefaultAddressAction(
  addressId: string,
): Promise<{ error: string | null }> {
  if (!isValidUuid(addressId)) {
    return { error: "That address could not be found." };
  }

  const ctx = await requireCustomerContext();
  if (ctx.error) return { error: ctx.error };

  // A plain UPDATE is sufficient and atomic: enforce_single_default_address
  // (migration 0015, SECURITY DEFINER trigger) clears any other default for
  // this customer inside the same statement/transaction before this one
  // commits — no separate RPC needed, verified live this phase.
  const { error } = await ctx.supabase
    .from("customer_addresses")
    .update({ is_default: true })
    .eq("id", addressId);

  if (error) {
    return { error: "Could not set this as your default address." };
  }

  revalidatePath("/account/addresses");
  revalidatePath("/checkout");
  return { error: null };
}
