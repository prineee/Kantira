import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, LayoutGrid, ShoppingBag } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { cartAffordanceForIdentity, resolveIdentity } from "@/lib/auth/resolve-identity";
import { StorefrontShell } from "@/components/storefront/storefront-shell";
import { ProductGrid } from "@/components/storefront/product-grid";
import {
  fetchStorefrontItemsPage,
  getStorefrontOrgId,
  listStorefrontCategories,
} from "@/lib/data/storefront-items";
import { getPrimaryImageUrls } from "@/lib/data/storefront-images";
import type { StorefrontProductCardData } from "@/components/storefront/product-card";

const HOMEPAGE_PRODUCT_COUNT = 8;
const HOMEPAGE_CATEGORY_COUNT = 6;

// Staff (has a profiles row) and "unresolved" identities keep landing on
// /dashboard exactly as before this phase — only a customer or an
// unauthenticated visitor sees the storefront homepage. This preserves
// existing internal Business OS behavior; nothing here changes what a
// staff member's root URL does.
export default async function RootPage() {
  const identity = await resolveIdentity();
  if (identity.kind === "staff" || identity.kind === "unresolved") {
    redirect("/dashboard");
  }

  const supabase = createClient();
  const organizationId = await getStorefrontOrgId(supabase);

  const [categories, itemsPage] = await Promise.all([
    listStorefrontCategories(supabase, organizationId),
    fetchStorefrontItemsPage(supabase, { organizationId, page: 1 }),
  ]);

  const featuredItems = itemsPage.items.slice(0, HOMEPAGE_PRODUCT_COUNT);
  const imageUrls = await getPrimaryImageUrls(
    supabase,
    featuredItems.map((i) => i.id),
  );

  const products: StorefrontProductCardData[] = featuredItems.map((item) => ({
    id: item.id,
    sku: item.sku,
    name: item.name,
    sellingPrice: item.sellingPrice,
    categoryName: item.categoryName,
    imageUrl: imageUrls.get(item.id) ?? null,
  }));

  const topCategories = categories.slice(0, HOMEPAGE_CATEGORY_COUNT);

  return (
    <StorefrontShell>
      <section className="bg-kantira-navy-900">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-6 py-16 sm:py-20">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-teal">
            Welcome to KANTIRA
          </p>
          <h1 className="max-w-2xl text-3xl font-bold text-white sm:text-4xl">
            Everything you need, in one store.
          </h1>
          <p className="max-w-xl text-base text-kantira-navy-200">
            Browse our full catalog, discover products by category, and find
            exactly what you&apos;re looking for.
          </p>
          <Link
            href="/shop"
            className="inline-flex items-center gap-2 rounded-card bg-brand-royal px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#0f4fd6]"
          >
            <ShoppingBag size={18} />
            Start shopping
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {organizationId && topCategories.length > 0 ? (
        <section className="mx-auto max-w-6xl px-6 py-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold text-kantira-navy-900">
              <LayoutGrid size={20} className="text-brand-royal" />
              Shop by category
            </h2>
            <Link href="/categories" className="text-sm font-medium text-brand-royal">
              View all →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {topCategories.map((category) => (
              <Link
                key={category.id}
                href={`/shop?category=${category.id}`}
                className="rounded-card border border-kantira-navy-100 bg-white px-4 py-5 text-center text-sm font-medium text-kantira-navy-800 shadow-sm transition hover:border-brand-royal hover:text-brand-royal"
              >
                {category.name}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-kantira-navy-900">
            Featured products
          </h2>
          <Link href="/shop" className="text-sm font-medium text-brand-royal">
            Browse all →
          </Link>
        </div>
        <ProductGrid
          products={products}
          emptyTitle="Catalog coming soon"
          emptyDescription="We're setting up our storefront. Please check back shortly."
          cartAffordance={cartAffordanceForIdentity(identity)}
        />
      </section>
    </StorefrontShell>
  );
}
