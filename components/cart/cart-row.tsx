"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Trash2 } from "lucide-react";
import { ProductImage } from "@/components/storefront/product-image";
import { CART_MAX_QUANTITY } from "@/lib/data/cart";
import { removeCartItemAction, updateCartItemQuantityAction } from "@/lib/actions/cart";
import type { CartLine } from "@/lib/data/cart";

// Client component because a cart row needs local pending/error state and
// an immediate refresh after a mutation — everything it sends the server
// is {cartItemId, quantity} or just {cartItemId}; the authoritative price
// used to render `line.lineTotal`/`line.unitPrice` was already computed
// server-side (app/cart/page.tsx via lib/data/cart-queries.ts) from a live
// items read, never from anything this component holds.
export function CartRow({ line }: { line: CartLine }) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(line.quantity);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleUpdateQuantity(next: number) {
    setError(null);
    startTransition(async () => {
      const result = await updateCartItemQuantityAction(line.cartItemId, next);
      if (result.error) {
        setError(result.error);
        return;
      }
      setQuantity(next);
      router.refresh();
    });
  }

  function handleRemove() {
    setError(null);
    startTransition(async () => {
      const result = await removeCartItemAction(line.cartItemId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center">
      <div className="flex flex-1 items-center gap-4">
        <ProductImage
          url={line.imageUrl}
          alt={line.name ?? "Product"}
          className="h-20 w-20 flex-shrink-0 rounded-lg"
        />
        <div className="min-w-0">
          {!line.available ? (
            <p className="flex items-center gap-1.5 text-sm font-semibold text-red-600">
              <AlertTriangle size={14} />
              No longer available
            </p>
          ) : (
            <>
              {line.categoryName ? (
                <p className="text-xs font-medium uppercase tracking-wide text-brand-slate">
                  {line.categoryName}
                </p>
              ) : null}
              <p className="truncate font-semibold text-kantira-navy-900">{line.name}</p>
              <p className="text-xs text-brand-slate">SKU {line.sku}</p>
              <p className="mt-1 text-sm text-kantira-navy-700">
                &#8377;{line.unitPrice!.toFixed(2)}
                {line.uomCode ? <span> / {line.uomCode}</span> : null}
              </p>
            </>
          )}
          {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
        </div>
      </div>

      <div className="flex items-center gap-4 sm:gap-6">
        {line.available ? (
          <label className="flex items-center gap-2 text-sm text-brand-slate">
            Qty
            <input
              type="number"
              min={1}
              max={CART_MAX_QUANTITY}
              value={quantity}
              disabled={isPending}
              onChange={(e) => setQuantity(Number(e.target.value))}
              onBlur={(e) => {
                const next = Number(e.target.value);
                if (Number.isInteger(next) && next >= 1 && next <= CART_MAX_QUANTITY) {
                  handleUpdateQuantity(next);
                }
              }}
              className="w-20 rounded-lg border border-kantira-navy-200 px-2 py-1.5 text-sm focus:border-brand-royal focus:outline-none focus:ring-1 focus:ring-brand-royal"
            />
          </label>
        ) : (
          <span className="text-sm text-brand-slate">Qty {line.quantity}</span>
        )}

        <p className="w-24 text-right text-sm font-semibold text-kantira-navy-900">
          {line.available ? `₹${line.lineTotal!.toFixed(2)}` : "—"}
        </p>

        <button
          type="button"
          onClick={handleRemove}
          disabled={isPending}
          aria-label="Remove item"
          className="rounded-lg p-2 text-kantira-navy-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </li>
  );
}
