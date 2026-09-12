import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { StorefrontShell } from "@/components/storefront/storefront-shell";
import { getStorefrontOrgId, listStorefrontCategories } from "@/lib/data/storefront-items";
import { buildCategoryTree, type CategoryNode } from "@/lib/data/storefront-catalog";

function CategoryList({ nodes, depth = 0 }: { nodes: CategoryNode[]; depth?: number }) {
  return (
    <ul className={depth === 0 ? "space-y-3" : "mt-3 space-y-2 border-l border-kantira-navy-100 pl-4"}>
      {nodes.map((node) => (
        <li key={node.id}>
          <Link
            href={`/shop?category=${node.id}`}
            className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-kantira-navy-800 hover:bg-white hover:text-brand-royal"
          >
            {node.name}
          </Link>
          {node.children.length > 0 ? (
            <CategoryList nodes={node.children} depth={depth + 1} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export default async function CategoriesPage() {
  const supabase = createClient();
  const organizationId = await getStorefrontOrgId(supabase);
  const categories = await listStorefrontCategories(supabase, organizationId);
  const tree = buildCategoryTree(categories);

  return (
    <StorefrontShell>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold text-kantira-navy-900">
          <LayoutGrid size={22} className="text-brand-royal" />
          Categories
        </h1>
        <p className="mb-8 text-sm text-brand-slate">
          Browse products by category.
        </p>

        {tree.length > 0 ? (
          <div className="rounded-card border border-kantira-navy-100 bg-brand-gray p-4">
            <CategoryList nodes={tree} />
          </div>
        ) : (
          <div className="rounded-card border border-dashed border-kantira-navy-200 bg-white px-6 py-16 text-center">
            <p className="text-base font-semibold text-kantira-navy-900">
              No categories yet
            </p>
            <p className="mt-2 text-sm text-brand-slate">
              Please check back shortly, or{" "}
              <Link href="/shop" className="font-medium text-brand-royal">
                browse all products
              </Link>
              .
            </p>
          </div>
        )}
      </div>
    </StorefrontShell>
  );
}
