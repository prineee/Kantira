// Pure helper for picking which product_media row represents an item on a
// listing surface (grid card, search result) where only one image is
// shown. Product detail pages show the full ordered gallery instead and
// don't need this. No Supabase client here — see storefront-catalog.ts for
// why this module stays DB-agnostic.
export type StorefrontMediaRow = {
  item_id: string;
  storage_path: string;
  is_primary: boolean;
  sort_order: number;
};

export function pickPrimaryMediaByItem(
  rows: StorefrontMediaRow[],
): Map<string, StorefrontMediaRow> {
  const byItem = new Map<string, StorefrontMediaRow>();
  for (const row of rows) {
    const current = byItem.get(row.item_id);
    if (!current) {
      byItem.set(row.item_id, row);
      continue;
    }
    const rowIsBetter =
      (row.is_primary && !current.is_primary) ||
      (row.is_primary === current.is_primary && row.sort_order < current.sort_order);
    if (rowIsBetter) byItem.set(row.item_id, row);
  }
  return byItem;
}
