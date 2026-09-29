// Pure helpers describing storefront visibility for Business OS screens.
// Mirrors the database rule (migration 0032, items_select_public): a
// customer can see an item only when the organization's storefront is ON
// AND the item is active AND the item is published. Stock is deliberately
// NOT part of visibility — checkout validates stock.

export type ItemStorefrontStatus =
  | "PUBLISHED"
  | "HIDDEN"
  | "PUBLISHED_INACTIVE";

export function itemStorefrontStatus(item: {
  is_active: boolean | null;
  is_published: boolean | null;
}): ItemStorefrontStatus {
  if (!item.is_published) return "HIDDEN";
  return item.is_active ? "PUBLISHED" : "PUBLISHED_INACTIVE";
}

export const ITEM_STOREFRONT_STATUS_LABEL: Record<ItemStorefrontStatus, string> = {
  PUBLISHED: "Published",
  HIDDEN: "Hidden",
  PUBLISHED_INACTIVE: "Published (inactive — not visible)",
};

export function isVisibleToCustomers(options: {
  storefrontEnabled: boolean;
  isActive: boolean | null;
  isPublished: boolean | null;
}): boolean {
  return options.storefrontEnabled && options.isActive === true && options.isPublished === true;
}

// Counts product_media rows per item from an already org-scoped list
// (one query for the whole page, never one query per item).
export function countImagesByItem(rows: { item_id: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.item_id, (counts.get(row.item_id) ?? 0) + 1);
  }
  return counts;
}
