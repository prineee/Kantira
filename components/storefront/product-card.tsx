import Link from "next/link";
import { ProductImage } from "./product-image";
import { AddToCartForm, LoginToAddToCart } from "./add-to-cart-form";
import type { CartAffordance } from "@/lib/auth/resolve-identity";

export type { CartAffordance };

export type StorefrontProductCardData = {
  id: string;
  sku: string;
  name: string;
  sellingPrice: number;
  categoryName: string | null;
  imageUrl: string | null;
};

export function ProductCard({
  product,
  cartAffordance = "none",
}: {
  product: StorefrontProductCardData;
  cartAffordance?: CartAffordance;
}) {
  return (
    <div className="group flex flex-col overflow-hidden rounded-card border border-kantira-navy-100 bg-white shadow-sm transition hover:shadow-md">
      <Link
        href={`/products/${product.id}`}
        className="flex flex-1 flex-col focus:outline-none focus:ring-2 focus:ring-brand-royal"
      >
        <ProductImage
          url={product.imageUrl}
          alt={product.name}
          className="aspect-square w-full"
        />
        <div className="flex flex-1 flex-col gap-1 p-4 pb-2">
          {product.categoryName ? (
            <p className="text-xs font-medium uppercase tracking-wide text-brand-slate">
              {product.categoryName}
            </p>
          ) : null}
          <h3 className="text-sm font-semibold text-kantira-navy-900 group-hover:text-brand-royal">
            {product.name}
          </h3>
          <p className="text-xs text-brand-slate">SKU {product.sku}</p>
          <p className="mt-auto pt-2 text-base font-bold text-kantira-navy-900">
            &#8377;{product.sellingPrice.toFixed(2)}
          </p>
        </div>
      </Link>
      {cartAffordance === "none" ? null : (
        <div className="px-4 pb-4">
          {cartAffordance === "add" ? (
            <AddToCartForm itemId={product.id} compact />
          ) : (
            <LoginToAddToCart compact />
          )}
        </div>
      )}
    </div>
  );
}
