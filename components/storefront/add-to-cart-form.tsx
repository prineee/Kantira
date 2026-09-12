import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { addToCartFormAction } from "@/lib/actions/cart";
import { CART_MAX_QUANTITY } from "@/lib/data/cart";

// Server-renderable (no client JS required to submit) — works identically
// as a quick-add on a product card (no quantity field, defaults to 1 via
// addToCartAction's own fallback) and as the full control on the product
// detail page (with a visible quantity input). Only ever rendered for a
// resolved customer identity — see the "not signed in" / "staff" callers
// below, which render a different, non-cart affordance instead.
export function AddToCartForm({
  itemId,
  showQuantityInput = false,
  compact = false,
}: {
  itemId: string;
  showQuantityInput?: boolean;
  compact?: boolean;
}) {
  return (
    <form action={addToCartFormAction.bind(null, itemId)} className="flex items-center gap-2">
      {showQuantityInput ? (
        <label className="flex items-center gap-2 text-sm text-brand-slate">
          Qty
          <input
            type="number"
            name="quantity"
            defaultValue={1}
            min={1}
            max={CART_MAX_QUANTITY}
            className="w-20 rounded-lg border border-kantira-navy-200 px-2 py-1.5 text-sm focus:border-brand-royal focus:outline-none focus:ring-1 focus:ring-brand-royal"
          />
        </label>
      ) : null}
      <button
        type="submit"
        className={
          compact
            ? "inline-flex items-center gap-1.5 rounded-lg bg-brand-royal px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#0f4fd6]"
            : "inline-flex items-center gap-2 rounded-card bg-brand-royal px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0f4fd6]"
        }
      >
        <ShoppingCart size={compact ? 14 : 16} />
        Add to Cart
      </button>
    </form>
  );
}

// Anonymous shoppers never get a server cart (brief section 13) — this
// routes them to the existing login boundary instead of silently doing
// nothing or throwing.
export function LoginToAddToCart({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/login"
      className={
        compact
          ? "inline-flex items-center gap-1.5 rounded-lg border border-kantira-navy-200 px-3 py-1.5 text-xs font-medium text-kantira-navy-700 hover:bg-kantira-navy-50"
          : "inline-flex items-center gap-2 rounded-card border border-kantira-navy-200 px-5 py-2.5 text-sm font-semibold text-kantira-navy-700 hover:bg-kantira-navy-50"
      }
    >
      <ShoppingCart size={compact ? 14 : 16} />
      Log in to add to cart
    </Link>
  );
}
