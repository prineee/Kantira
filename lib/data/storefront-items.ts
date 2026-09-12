import type { createClient } from "@/lib/supabase/server";
import {
  STOREFRONT_CATEGORY_SELECT,
  STOREFRONT_ITEM_SELECT,
  STOREFRONT_PAGE_SIZE,
  buildIlikePattern,
  dedupeById,
  paginationRange,
  totalPagesFor,
  type CategoryOption,
} from "./storefront-catalog";

type StorefrontSupabaseClient = ReturnType<typeof createClient>;

export type StorefrontListItem = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  sellingPrice: number;
  categoryId: string | null;
  categoryName: string | null;
  uomCode: string | null;
};

type StorefrontItemRow = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  selling_price: number;
  category_id: string | null;
  product_categories: { id: string; name: string } | null;
  units_of_measurement: { id: string; code: string; name: string } | null;
};

function mapItemRow(row: StorefrontItemRow): StorefrontListItem {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    description: row.description,
    sellingPrice: row.selling_price,
    categoryId: row.category_id,
    categoryName: row.product_categories?.name ?? null,
    uomCode: row.units_of_measurement?.code ?? null,
  };
}

// Resolves the single organization Phase 4A's storefront may read from.
// Returns null when no OWNER has flagged one yet (Decision 13.3 in
// docs/architecture/PHASE_5_ARCHITECTURE_DECISIONS.md) — every caller below
// treats that as "empty catalog," never as an error, matching the brief's
// "professional empty state, not fabricated products" instruction.
export async function getStorefrontOrgId(
  supabase: StorefrontSupabaseClient,
): Promise<string | null> {
  const { data } = await supabase.rpc("primary_storefront_org_id");
  return data ?? null;
}

export async function listStorefrontCategories(
  supabase: StorefrontSupabaseClient,
  organizationId: string | null,
): Promise<CategoryOption[]> {
  if (!organizationId) return [];
  const { data } = await supabase
    .from("product_categories")
    .select(STOREFRONT_CATEGORY_SELECT)
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("name");
  return data ?? [];
}

export type StorefrontItemsPage = {
  items: StorefrontListItem[];
  currentPage: number;
  totalPages: number;
  totalCount: number;
};

const EMPTY_PAGE: StorefrontItemsPage = {
  items: [],
  currentPage: 1,
  totalPages: 1,
  totalCount: 0,
};

// Basic database-backed search/browse for the Phase 4A catalog foundation.
// A search term is matched against name/sku/description directly, plus
// category name indirectly (matching categories first, then their items) —
// via separate ilike() calls merged in JS rather than one hand-built
// PostgREST `or=` filter string, so a search term containing `,`/`(`/`)`
// can never be interpreted as extra filter syntax (see
// storefront-catalog.ts's escapeIlikePattern for the wildcard-escaping
// half of this same concern).
export async function fetchStorefrontItemsPage(
  supabase: StorefrontSupabaseClient,
  options: {
    organizationId: string | null;
    categoryId?: string;
    search?: string;
    page: number;
  },
): Promise<StorefrontItemsPage> {
  const { organizationId, categoryId, search, page } = options;
  if (!organizationId) return EMPTY_PAGE;

  const trimmedSearch = search?.trim();

  if (trimmedSearch) {
    return fetchSearchResultsPage(supabase, {
      organizationId,
      categoryId,
      search: trimmedSearch,
      page,
    });
  }

  let query = supabase
    .from("items")
    .select(STOREFRONT_ITEM_SELECT, { count: "exact" })
    .eq("organization_id", organizationId)
    .eq("is_active", true);

  if (categoryId) {
    query = query.eq("category_id", categoryId);
  }

  const { from, to } = paginationRange(page);
  const { data, count } = await query
    .order("name", { ascending: true })
    .range(from, to);

  const totalCount = count ?? 0;
  const totalPages = totalPagesFor(totalCount);

  return {
    items: (data ?? []).map((row) => mapItemRow(row as unknown as StorefrontItemRow)),
    currentPage: Math.min(page, totalPages),
    totalPages,
    totalCount,
  };
}

const SEARCH_MATCH_LIMIT = 200;

async function fetchSearchResultsPage(
  supabase: StorefrontSupabaseClient,
  options: { organizationId: string; categoryId?: string; search: string; page: number },
): Promise<StorefrontItemsPage> {
  const { organizationId, categoryId, search, page } = options;
  const pattern = buildIlikePattern(search);

  const { data: matchingCategories } = await supabase
    .from("product_categories")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .ilike("name", pattern);

  const matchingCategoryIds = (matchingCategories ?? []).map((c) => c.id);

  const baseQuery = () =>
    supabase
      .from("items")
      .select(STOREFRONT_ITEM_SELECT)
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .limit(SEARCH_MATCH_LIMIT);

  const queries = [
    baseQuery().ilike("name", pattern),
    baseQuery().ilike("sku", pattern),
    baseQuery().ilike("description", pattern),
  ];
  if (matchingCategoryIds.length > 0) {
    queries.push(baseQuery().in("category_id", matchingCategoryIds));
  }

  const results = await Promise.all(queries);
  const lists = results.map((r) =>
    (r.data ?? []).map((row) => mapItemRow(row as unknown as StorefrontItemRow)),
  );

  let merged = dedupeById(...lists);
  if (categoryId) {
    merged = merged.filter((item) => item.categoryId === categoryId);
  }

  const totalCount = merged.length;
  const totalPages = totalPagesFor(totalCount);
  const currentPage = Math.min(page, totalPages);
  const { from, to } = paginationRange(currentPage);

  return {
    items: merged.slice(from, to + 1),
    currentPage,
    totalPages,
    totalCount,
  };
}

export async function getStorefrontItem(
  supabase: StorefrontSupabaseClient,
  organizationId: string | null,
  itemId: string,
): Promise<StorefrontListItem | null> {
  if (!organizationId) return null;
  const { data } = await supabase
    .from("items")
    .select(STOREFRONT_ITEM_SELECT)
    .eq("organization_id", organizationId)
    .eq("id", itemId)
    .eq("is_active", true)
    .maybeSingle();
  return data ? mapItemRow(data as unknown as StorefrontItemRow) : null;
}

export { STOREFRONT_PAGE_SIZE };
