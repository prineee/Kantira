import { createClient } from "@/lib/supabase/server";
import { cartAffordanceForIdentity, resolveIdentity } from "@/lib/auth/resolve-identity";
import { StorefrontShell } from "@/components/storefront/storefront-shell";
import { ProductGrid } from "@/components/storefront/product-grid";
import { PaginationNav } from "@/components/storefront/pagination-nav";
import { SearchForm } from "@/components/storefront/search-form";
import { fetchStorefrontItemsPage, getStorefrontOrgId } from "@/lib/data/storefront-items";
import { getPrimaryImageUrls } from "@/lib/data/storefront-images";
import { parsePageParam } from "@/lib/data/storefront-catalog";
import type { StorefrontProductCardData } from "@/components/storefront/product-card";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string; page?: string };
}) {
  const query = (searchParams.q ?? "").trim();
  const page = parsePageParam(searchParams.page);

  const supabase = createClient();
  const identity = await resolveIdentity();
  const organizationId = await getStorefrontOrgId(supabase);

  const itemsPage = query
    ? await fetchStorefrontItemsPage(supabase, { organizationId, search: query, page })
    : { items: [], currentPage: 1, totalPages: 1, totalCount: 0 };

  const imageUrls = await getPrimaryImageUrls(
    supabase,
    itemsPage.items.map((i) => i.id),
  );

  const products: StorefrontProductCardData[] = itemsPage.items.map((item) => ({
    id: item.id,
    sku: item.sku,
    name: item.name,
    sellingPrice: item.sellingPrice,
    categoryName: item.categoryName,
    imageUrl: imageUrls.get(item.id) ?? null,
  }));

  return (
    <StorefrontShell>
      <div className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="mb-6 text-2xl font-bold text-kantira-navy-900">
          Search
        </h1>
        <div className="mb-8 max-w-xl">
          <SearchForm defaultValue={query} />
        </div>

        {!query ? (
          <p className="text-sm text-brand-slate">
            Enter a product name, SKU, or category to search.
          </p>
        ) : (
          <>
            <p className="mb-4 text-sm text-brand-slate">
              {itemsPage.totalCount} result{itemsPage.totalCount === 1 ? "" : "s"}{" "}
              for &ldquo;{query}&rdquo;
            </p>
            <ProductGrid
              products={products}
              emptyTitle="No results found"
              emptyDescription={`We couldn't find any products matching "${query}". Try a different search term.`}
              cartAffordance={cartAffordanceForIdentity(identity)}
            />
            <PaginationNav
              basePath="/search"
              currentPage={itemsPage.currentPage}
              totalPages={itemsPage.totalPages}
              extraParams={{ q: query }}
            />
          </>
        )}
      </div>
    </StorefrontShell>
  );
}
