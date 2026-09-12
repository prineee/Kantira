import type { createClient } from "@/lib/supabase/server";
import { STOREFRONT_ITEM_SELECT } from "./storefront-catalog";
import { getPrimaryImageUrls } from "./storefront-images";
import {
  buildCartSummary,
  sumCartQuantities,
  type CartCatalogItem,
  type CartSummary,
} from "./cart";

type StorefrontSupabaseClient = ReturnType<typeof createClient>;

type CatalogItemRow = {
  id: string;
  sku: string;
  name: string;
  selling_price: number;
  product_categories: { name: string } | null;
  units_of_measurement: { code: string } | null;
};

// Reads the caller's own cart — RLS (cart_items_select_self, migration
// 0023) already scopes this to exactly one customer's rows, so there is
// no organization/customer filter to apply here; the query is only ever
// as broad as the authenticated session's own ownership allows.
export async function getCustomerCartSummary(
  supabase: StorefrontSupabaseClient,
): Promise<CartSummary> {
  const { data: cartItems } = await supabase
    .from("cart_items")
    .select("id, item_id, quantity")
    .order("created_at", { ascending: true });

  const rows = cartItems ?? [];
  if (rows.length === 0) {
    return { lines: [], subtotal: 0, itemCount: 0, hasUnavailableItems: false };
  }

  const itemIds = rows.map((row) => row.item_id);

  const { data: items } = await supabase
    .from("items")
    .select(STOREFRONT_ITEM_SELECT)
    .in("id", itemIds);

  const itemsById = new Map<string, CartCatalogItem>(
    (items ?? []).map((row) => {
      const item = row as unknown as CatalogItemRow;
      return [
        item.id,
        {
          sku: item.sku,
          name: item.name,
          sellingPrice: item.selling_price,
          categoryName: item.product_categories?.name ?? null,
          uomCode: item.units_of_measurement?.code ?? null,
        },
      ];
    }),
  );

  const imageUrls = await getPrimaryImageUrls(supabase, itemIds);

  return buildCartSummary(rows, itemsById, imageUrls);
}

// Lightweight count for the storefront nav badge — same "sum of
// quantities" semantic as getCustomerCartSummary's itemCount, without
// fetching item/media details this call site doesn't need.
export async function getCartItemCount(
  supabase: StorefrontSupabaseClient,
): Promise<number> {
  const { data } = await supabase.from("cart_items").select("quantity");
  return sumCartQuantities(data ?? []);
}
