"use server";

import { revalidatePath } from "next/cache";
import { requireCustomerContext } from "@/lib/actions/customer-auth";
import { isValidUuid } from "@/lib/data/storefront-catalog";
import { parseCartQuantity } from "@/lib/data/cart";

export type CartActionResult = { error: string | null };

// Every action below resolves the customer strictly from the authenticated
// session (requireCustomerContext -> customers.auth_user_id = auth.uid()),
// exactly like every other customer-facing write in this codebase — never
// from a client-supplied customer/organization id. Quantity is validated
// here for a friendly error message, but the real, non-bypassable
// enforcement is the database: migration 0023's CHECK constraint on
// cart_items.quantity and add_to_cart_item()'s own range check, plus RLS
// ownership on every table these hit.

export async function addToCartAction(
  itemId: string,
  formData: FormData,
): Promise<CartActionResult> {
  if (!isValidUuid(itemId)) {
    return { error: "That product could not be found." };
  }

  const ctx = await requireCustomerContext();
  if (ctx.error) return { error: ctx.error };

  const quantity = parseCartQuantity(formData.get("quantity") ?? 1);
  if (quantity === null) {
    return { error: "Enter a quantity between 1 and 9999." };
  }

  // add_to_cart_item (migration 0023) is a SECURITY DEFINER RPC precisely
  // because "find or create this customer's cart, then upsert-with-
  // increment the cart_item" is a multi-step operation that needs to be
  // atomic against a concurrent duplicate add — see the migration's own
  // comment. It re-validates item visibility/activeness and quantity
  // range itself; nothing here is trusted beyond "which item, how many."
  const { error } = await ctx.supabase.rpc("add_to_cart_item", {
    p_item_id: itemId,
    p_quantity: quantity,
  });

  if (error) {
    return { error: "This product could not be added to your cart." };
  }

  revalidatePath("/", "layout");
  return { error: null };
}

// Plain <form action={...}> (used by AddToCartForm for a quick-add that
// needs no client JS) can only bind to a function returning void/Promise
// <void> — it has no useFormState wrapper to read a returned error out of.
// A failure here is an edge case (the item became invalid between page
// render and submit) rather than a normal-use path, so it's surfaced via
// the nearest error.tsx boundary instead of a silently-swallowed no-op.
export async function addToCartFormAction(itemId: string, formData: FormData): Promise<void> {
  const result = await addToCartAction(itemId, formData);
  if (result.error) {
    throw new Error(result.error);
  }
}

export async function updateCartItemQuantityAction(
  cartItemId: string,
  quantity: number,
): Promise<CartActionResult> {
  if (!isValidUuid(cartItemId)) {
    return { error: "That cart item could not be found." };
  }

  const parsed = parseCartQuantity(quantity);
  if (parsed === null) {
    return { error: "Enter a quantity between 1 and 9999." };
  }

  const ctx = await requireCustomerContext();
  if (ctx.error) return { error: ctx.error };

  // Plain RLS-guarded UPDATE — cart_items_update_self (0023) already
  // restricts this to a row belonging to the caller's own cart, so a
  // cartItemId for another customer's row simply matches zero rows here
  // rather than erroring or leaking anything.
  const { error } = await ctx.supabase
    .from("cart_items")
    .update({ quantity: parsed })
    .eq("id", cartItemId);

  if (error) {
    return { error: "Could not update quantity." };
  }

  revalidatePath("/", "layout");
  return { error: null };
}

export async function removeCartItemAction(cartItemId: string): Promise<CartActionResult> {
  if (!isValidUuid(cartItemId)) {
    return { error: "That cart item could not be found." };
  }

  const ctx = await requireCustomerContext();
  if (ctx.error) return { error: ctx.error };

  const { error } = await ctx.supabase.from("cart_items").delete().eq("id", cartItemId);
  if (error) {
    return { error: "Could not remove this item." };
  }

  revalidatePath("/", "layout");
  return { error: null };
}

export async function clearCartAction(): Promise<CartActionResult> {
  const ctx = await requireCustomerContext();
  if (ctx.error) return { error: ctx.error };

  const { data: cart } = await ctx.supabase
    .from("carts")
    .select("id")
    .eq("customer_id", ctx.customer.id)
    .maybeSingle();

  if (cart) {
    const { error } = await ctx.supabase.from("cart_items").delete().eq("cart_id", cart.id);
    if (error) {
      return { error: "Could not clear your cart." };
    }
  }

  revalidatePath("/", "layout");
  return { error: null };
}
