// Pure, DB-agnostic helpers for the Phase 4A public storefront catalog.
// Deliberately holds no Supabase client and issues no query itself — every
// app/ page under /shop, /categories, /search, /products queries
// `public.items` / `public.product_categories` / `public.units_of_measurement`
// directly (same pattern as app/items/page.tsx), always through the
// explicit safe column lists below, and always scoped to
// `organization_id = <primary_storefront_org_id()>`. Keeping the logic here
// pure means it can be unit-tested without a live Supabase/Postgres
// instance, which this repo's `npm test` does not have available.
//
// Column choice: a strict subset of what migrations 0018/0021/0022 already
// grant `anon`/`authenticated` on `items`/`product_media` — cost_price,
// created_by, reorder_level, track_inventory, hsn_code, barcode, and
// weight_kg are all excluded here even though some are within the DB grant,
// because Phase 4A's brief only calls for id/sku/name/description/category/
// uom/selling_price/is_active/media on the public catalog surface. Nothing
// below ever needs to be stripped in JavaScript — each column is either
// requested or not.
export const STOREFRONT_ITEM_SELECT =
  "id, sku, name, description, selling_price, tax_rate_percent, is_active, created_at, category_id, product_categories(id, name), units_of_measurement(id, code, name)";

export const STOREFRONT_CATEGORY_SELECT = "id, name, parent_category_id";

export const STOREFRONT_MEDIA_SELECT =
  "id, item_id, storage_path, alt_text, is_primary, sort_order";

export const STOREFRONT_PAGE_SIZE = 24;

export const STOREFRONT_SIGNED_URL_TTL_SECONDS = 3600;

// Postgres ILIKE's default escape character is backslash. Without escaping,
// a search term containing `%` or `_` would act as a wildcard rather than a
// literal character, and while RLS still bounds every possible result to
// the public storefront's own active rows (so this is a correctness fix,
// not a tenant-isolation one), an unescaped term can still return
// surprising matches for a "search for exactly this" user expectation.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Guards a route param before it ever reaches a query. A malformed id
// (not a UUID) would otherwise surface as a Postgres "invalid input syntax
// for type uuid" error from PostgREST rather than a clean "not found" —
// this keeps the product detail page's not-found branch as the only
// outcome for a bad id, never a raw database error.
export function isValidUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function escapeIlikePattern(term: string): string {
  return term.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export function buildIlikePattern(term: string): string {
  return `%${escapeIlikePattern(term.trim())}%`;
}

export type CategoryOption = {
  id: string;
  name: string;
  parent_category_id: string | null;
};

export type CategoryNode = CategoryOption & { children: CategoryNode[] };

// Groups a flat, active-only category list (as returned by
// product_categories_select_public) into a parent/child tree for category
// browsing. Categories whose parent isn't present in the input list (e.g.
// the parent was deactivated) are treated as top-level rather than dropped,
// so a category never silently disappears from browsing.
export function buildCategoryTree(categories: CategoryOption[]): CategoryNode[] {
  const nodesById = new Map<string, CategoryNode>();
  for (const category of categories) {
    nodesById.set(category.id, { ...category, children: [] });
  }

  const roots: CategoryNode[] = [];
  for (const category of categories) {
    const node = nodesById.get(category.id)!;
    const parent = category.parent_category_id
      ? nodesById.get(category.parent_category_id)
      : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const byName = (a: CategoryNode, b: CategoryNode) => a.name.localeCompare(b.name);
  const sortTree = (nodes: CategoryNode[]) => {
    nodes.sort(byName);
    for (const node of nodes) sortTree(node.children);
  };
  sortTree(roots);

  return roots;
}

// Clamps an arbitrary `?page=` search param to a safe, positive integer.
// Next.js typed searchParams as string | string[] | undefined; a search
// param is client-suppliable input, so this never trusts it beyond "which
// page of already-authorized rows to show."
export function parsePageParam(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return parsed;
}

export function paginationRange(
  page: number,
  pageSize: number = STOREFRONT_PAGE_SIZE,
): { from: number; to: number } {
  const from = (page - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}

export function totalPagesFor(
  totalCount: number,
  pageSize: number = STOREFRONT_PAGE_SIZE,
): number {
  return Math.max(1, Math.ceil(totalCount / pageSize));
}

// Merges several already RLS-scoped result lists (e.g. name/sku/description
// matches fetched as separate ilike queries to avoid building a raw
// PostgREST `or=` filter string out of user input) into one deduplicated,
// name-sorted list.
export function dedupeById<T extends { id: string; name: string }>(
  ...lists: T[][]
): T[] {
  const byId = new Map<string, T>();
  for (const list of lists) {
    for (const item of list) {
      if (!byId.has(item.id)) byId.set(item.id, item);
    }
  }
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}
