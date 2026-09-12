import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StorefrontShell } from "@/components/storefront/storefront-shell";
import { ProductGrid } from "@/components/storefront/product-grid";
import { PaginationNav } from "@/components/storefront/pagination-nav";
import {
  fetchStorefrontItemsPage,
  getStorefrontOrgId,
  listStorefrontCategories,
} from "@/lib/data/storefront-items";
import { getPrimaryImageUrls } from "@/lib/data/storefront-images";
import { isValidUuid, parsePageParam } from "@/lib/data/storefront-catalog";
import type { StorefrontProductCardData } from "@/components/storefront/product-card";

export default async function ShopPage({
  searchParams,
}: {
  searchParams: { category?: string; page?: string };
}) {
  const supabase = createClient();
  const organizationId = await getStorefrontOrgId(supabase);
  const page = parsePageParam(searchParams.page);
  const categoryId =
    searchParams.category && isValidUuid(searchParams.category)
      ? searchParams.category
      : undefined;

  const [categories, itemsPage] = await Promise.all([
    listStorefrontCategories(supabase, organizationId),
    fetchStorefrontItemsPage(supabase, { organizationId, categoryId, page }),
  ]);

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

  const activeCategory = categories.find((c) => c.id === categoryId);

  return (
    <StorefrontShell>
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-kantira-navy-900">
            {activeCategory ? activeCategory.name : "Shop"}
          </h1>
          <p className="mt-1 text-sm text-brand-slate">
            {itemsPage.totalCount} product{itemsPage.totalCount === 1 ? "" : "s"}
          </p>
        </div>

        {categories.length > 0 ? (
          <div className="mb-8 flex flex-wrap gap-2">
            <Link
              href="/shop"
              className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                !categoryId
                  ? "bg-brand-royal text-white"
                  : "bg-white text-kantira-navy-700 hover:bg-kantira-navy-50"
              }`}
            >
              All
            </Link>
            {categories.map((category) => (
              <Link
                key={category.id}
                href={`/shop?category=${category.id}`}
                className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                  category.id === categoryId
                    ? "bg-brand-royal text-white"
                    : "bg-white text-kantira-navy-700 hover:bg-kantira-navy-50"
                }`}
              >
                {category.name}
              </Link>
            ))}
          </div>
        ) : null}

        <ProductGrid
          products={products}
          emptyTitle={
            !organizationId ? "Catalog coming soon" : "No products found"
          }
          emptyDescription={
            !organizationId
              ? "We're setting up our storefront. Please check back shortly."
              : "There are no products in this category yet."
          }
        />

        <PaginationNav
          basePath="/shop"
          currentPage={itemsPage.currentPage}
          totalPages={itemsPage.totalPages}
          extraParams={{ category: categoryId }}
        />
      </div>
    </StorefrontShell>
  );
}
