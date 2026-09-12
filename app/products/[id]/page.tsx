import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { cartAffordanceForIdentity, resolveIdentity } from "@/lib/auth/resolve-identity";
import { StorefrontShell } from "@/components/storefront/storefront-shell";
import { ProductImage } from "@/components/storefront/product-image";
import { AddToCartForm, LoginToAddToCart } from "@/components/storefront/add-to-cart-form";
import { getStorefrontItem, getStorefrontOrgId } from "@/lib/data/storefront-items";
import { getItemGalleryUrls } from "@/lib/data/storefront-images";
import { isValidUuid } from "@/lib/data/storefront-catalog";

export default async function ProductDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const organizationId = await getStorefrontOrgId(supabase);
  const item =
    organizationId && isValidUuid(params.id)
      ? await getStorefrontItem(supabase, organizationId, params.id)
      : null;

  if (!item) {
    return (
      <StorefrontShell>
        <div className="mx-auto max-w-3xl px-6 py-16 text-center">
          <p className="text-lg font-semibold text-kantira-navy-900">
            Product not found
          </p>
          <p className="mt-2 text-sm text-brand-slate">
            This product may no longer be available.
          </p>
          <Link
            href="/shop"
            className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-brand-royal"
          >
            <ArrowLeft size={16} />
            Back to shop
          </Link>
        </div>
      </StorefrontShell>
    );
  }

  const gallery = await getItemGalleryUrls(supabase, item.id);
  const primaryImage = gallery[0] ?? null;
  const identity = await resolveIdentity();
  const cartAffordance = cartAffordanceForIdentity(identity);

  return (
    <StorefrontShell>
      <div className="mx-auto max-w-5xl px-6 py-10">
        <Link
          href="/shop"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-brand-royal"
        >
          <ArrowLeft size={16} />
          Back to shop
        </Link>

        <div className="grid gap-8 sm:grid-cols-2">
          <div>
            <ProductImage
              url={primaryImage?.url ?? null}
              alt={primaryImage?.altText ?? item.name}
              className="aspect-square w-full rounded-card"
            />
            {gallery.length > 1 ? (
              <div className="mt-3 grid grid-cols-4 gap-2">
                {gallery.slice(1).map((media, index) => (
                  <ProductImage
                    key={index}
                    url={media.url}
                    alt={media.altText ?? item.name}
                    className="aspect-square w-full rounded-lg"
                  />
                ))}
              </div>
            ) : null}
          </div>

          <div>
            {item.categoryName ? (
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-slate">
                {item.categoryName}
              </p>
            ) : null}
            <h1 className="mt-1 text-2xl font-bold text-kantira-navy-900">
              {item.name}
            </h1>
            <p className="mt-1 text-sm text-brand-slate">SKU {item.sku}</p>

            <p className="mt-4 text-3xl font-bold text-kantira-navy-900">
              &#8377;{item.sellingPrice.toFixed(2)}
              {item.uomCode ? (
                <span className="ml-1 text-base font-normal text-brand-slate">
                  / {item.uomCode}
                </span>
              ) : null}
            </p>

            <div className="mt-6">
              {cartAffordance === "add" ? (
                <AddToCartForm itemId={item.id} showQuantityInput />
              ) : cartAffordance === "login" ? (
                <LoginToAddToCart />
              ) : null}
            </div>

            {item.description ? (
              <div className="mt-6">
                <h2 className="text-sm font-semibold text-kantira-navy-900">
                  Description
                </h2>
                <p className="mt-2 whitespace-pre-line text-sm text-brand-slate">
                  {item.description}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </StorefrontShell>
  );
}
