import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowRight, ShoppingCart } from "lucide-react";
import { requireCustomerContext } from "@/lib/actions/customer-auth";
import { StorefrontShell } from "@/components/storefront/storefront-shell";
import { CartRow } from "@/components/cart/cart-row";
import { ClearCartButton } from "@/components/cart/clear-cart-button";
import { getCustomerCartSummary } from "@/lib/data/cart-queries";

// /cart is deliberately NOT in the public storefront route allowlist
// (lib/auth/public-routes.ts) — middleware already redirects an
// unauthenticated visitor to /login before this page ever runs, which is
// the "login boundary for cart operations" the brief asks for. The
// requireCustomerContext() check below then separates a signed-in
// STAFF/unresolved identity (redirected to /dashboard, same pattern as
// app/account/page.tsx) from an actual customer.
export default async function CartPage() {
  const ctx = await requireCustomerContext();

  if (ctx.error) {
    redirect("/dashboard");
  }

  const summary = await getCustomerCartSummary(ctx.supabase);

  return (
    <StorefrontShell>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-6 flex items-center gap-2 text-2xl font-bold text-kantira-navy-900">
          <ShoppingCart size={22} className="text-brand-royal" />
          Your Cart
        </h1>

        {summary.lines.length === 0 ? (
          <div className="rounded-card border border-dashed border-kantira-navy-200 bg-white px-6 py-16 text-center">
            <p className="text-base font-semibold text-kantira-navy-900">
              Your cart is empty
            </p>
            <p className="mt-2 text-sm text-brand-slate">
              Browse the catalog and add something you like.
            </p>
            <Link
              href="/shop"
              className="mt-6 inline-flex items-center gap-2 rounded-card bg-brand-royal px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0f4fd6]"
            >
              Start shopping
              <ArrowRight size={16} />
            </Link>
          </div>
        ) : (
          <div className="rounded-card border border-kantira-navy-100 bg-white p-6 shadow-sm">
            {summary.hasUnavailableItems ? (
              <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                <p>
                  One or more items in your cart are no longer available and
                  have been excluded from your total. Remove them to
                  continue.
                </p>
              </div>
            ) : null}

            <ul className="divide-y divide-kantira-navy-100">
              {summary.lines.map((line) => (
                <CartRow key={line.cartItemId} line={line} />
              ))}
            </ul>

            <div className="mt-6 flex flex-col gap-4 border-t border-kantira-navy-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
              <ClearCartButton />
              <div className="text-right">
                <p className="text-sm text-brand-slate">Subtotal</p>
                <p className="text-2xl font-bold text-kantira-navy-900">
                  &#8377;{summary.subtotal.toFixed(2)}
                </p>
              </div>
            </div>

            <div className="mt-6 border-t border-kantira-navy-100 pt-6">
              <button
                type="button"
                disabled
                title="Checkout is coming soon"
                className="w-full rounded-card bg-kantira-navy-100 px-5 py-3 text-sm font-semibold text-kantira-navy-400 cursor-not-allowed"
              >
                Checkout — coming soon
              </button>
            </div>
          </div>
        )}
      </div>
    </StorefrontShell>
  );
}
