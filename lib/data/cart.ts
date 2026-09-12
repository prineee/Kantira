// Pure, DB-agnostic cart logic for Phase 4B. No Supabase client here (see
// storefront-catalog.ts for why this repo keeps that split) — the
// DB-calling counterpart is lib/data/cart-queries.ts, and the mutating
// counterpart is lib/actions/cart.ts.
//
// cart_items never stores a price (Phase 4B brief, section 3 & 9): every
// line total here is computed from a live, customer-safe items lookup
// (itemsById) that the caller must have already fetched through the same
// RLS/column-grant boundary Phase 4A established — never from a
// client-supplied value.
export const CART_MAX_QUANTITY = 9999;

// Integer, > 0, <= CART_MAX_QUANTITY — mirrors migration 0023's
// `cart_items_quantity_range` CHECK constraint exactly, so invalid input
// is rejected with a friendly message before it ever reaches the
// database (the CHECK constraint is what actually makes this
// non-bypassable, not this function).
export function parseCartQuantity(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return null;
  if (parsed < 1 || parsed > CART_MAX_QUANTITY) return null;
  return parsed;
}

export type CartItemRow = {
  id: string;
  item_id: string;
  quantity: number;
};

export type CartCatalogItem = {
  sku: string;
  name: string;
  sellingPrice: number;
  categoryName: string | null;
  uomCode: string | null;
};

export type CartLine = {
  cartItemId: string;
  itemId: string;
  quantity: number;
  available: boolean;
  sku: string | null;
  name: string | null;
  categoryName: string | null;
  uomCode: string | null;
  unitPrice: number | null;
  lineTotal: number | null;
  imageUrl: string | null;
};

export type CartSummary = {
  lines: CartLine[];
  subtotal: number;
  itemCount: number;
  hasUnavailableItems: boolean;
};

// Merges raw cart_items rows with a live customer-safe items lookup and an
// image-url map. An item_id present in `cartItems` but absent from
// `itemsById` means the product failed the same visibility check
// items_select_public enforces everywhere else (deactivated, or no longer
// part of the public storefront) — the brief's "stale products" section —
// and is surfaced as `available: false` with no price, never silently
// dropped or priced at 0, and always excluded from `subtotal`.
export function buildCartSummary(
  cartItems: CartItemRow[],
  itemsById: Map<string, CartCatalogItem>,
  imageUrlsByItemId: Map<string, string>,
): CartSummary {
  let subtotal = 0;
  let itemCount = 0;
  let hasUnavailableItems = false;

  const lines: CartLine[] = cartItems.map((row) => {
    itemCount += row.quantity;
    const item = itemsById.get(row.item_id);

    if (!item) {
      hasUnavailableItems = true;
      return {
        cartItemId: row.id,
        itemId: row.item_id,
        quantity: row.quantity,
        available: false,
        sku: null,
        name: null,
        categoryName: null,
        uomCode: null,
        unitPrice: null,
        lineTotal: null,
        imageUrl: null,
      };
    }

    const lineTotal = item.sellingPrice * row.quantity;
    subtotal += lineTotal;

    return {
      cartItemId: row.id,
      itemId: row.item_id,
      quantity: row.quantity,
      available: true,
      sku: item.sku,
      name: item.name,
      categoryName: item.categoryName,
      uomCode: item.uomCode,
      unitPrice: item.sellingPrice,
      lineTotal,
      imageUrl: imageUrlsByItemId.get(row.item_id) ?? null,
    };
  });

  return { lines, subtotal, itemCount, hasUnavailableItems };
}

// Same "sum of quantities" semantic buildCartSummary uses for itemCount,
// exposed standalone so the nav badge (which doesn't need full line data)
// stays numerically consistent with the cart page without re-deriving the
// rule in two places.
export function sumCartQuantities(cartItems: { quantity: number }[]): number {
  return cartItems.reduce((sum, row) => sum + row.quantity, 0);
}
