import { PackageSearch } from "lucide-react";
import { ProductCard, type CartAffordance, type StorefrontProductCardData } from "./product-card";

export function ProductGrid({
  products,
  emptyTitle,
  emptyDescription,
  cartAffordance = "none",
}: {
  products: StorefrontProductCardData[];
  emptyTitle: string;
  emptyDescription: string;
  cartAffordance?: CartAffordance;
}) {
  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-kantira-navy-200 bg-white px-6 py-16 text-center">
        <PackageSearch size={32} className="text-kantira-navy-300" />
        <p className="text-base font-semibold text-kantira-navy-900">
          {emptyTitle}
        </p>
        <p className="max-w-sm text-sm text-brand-slate">{emptyDescription}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} cartAffordance={cartAffordance} />
      ))}
    </div>
  );
}
