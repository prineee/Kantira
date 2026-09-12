import Link from "next/link";
import { LogOut, Search, ShoppingBag, ShoppingCart, User } from "lucide-react";
import { resolveIdentity } from "@/lib/auth/resolve-identity";
import { signOut } from "@/app/dashboard/actions";
import { createClient } from "@/lib/supabase/server";
import { getCartItemCount } from "@/lib/data/cart-queries";

// Shared chrome for every public storefront page (/, /shop, /categories,
// /search, /products/[id]). Deliberately NOT KantiraShell — that shell's
// nav (Items, Stores, Accounts, Stock, ...) is internal Business OS
// surface a customer/anonymous shopper must never see (see
// app/account/page.tsx's own comment on this same split). Resolves
// identity only to decide what the account link/button says; it never
// gates page content — RLS is what actually scopes the data every child
// page queries.
export async function StorefrontShell({ children }: { children: React.ReactNode }) {
  const identity = await resolveIdentity();
  const isCustomer = identity.kind === "customer";

  // Cart count is a UX convenience only — never a security boundary. The
  // query itself is RLS-scoped to the caller's own cart_items regardless
  // of what this shell requests, so this is safe even if isCustomer were
  // ever wrong; it's skipped for non-customers purely to avoid a wasted
  // query on every storefront page view.
  const cartItemCount = isCustomer
    ? await getCartItemCount(createClient())
    : 0;

  return (
    <div className="flex min-h-screen flex-col bg-brand-gray">
      <header className="border-b border-kantira-navy-100 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <img
              src="/brand/logos/kantira_mark.svg"
              alt=""
              aria-hidden="true"
              className="h-8 w-8"
            />
            <span className="text-lg font-bold text-kantira-navy-900">
              KANTIRA
            </span>
          </Link>

          <nav
            aria-label="Storefront"
            className="flex flex-wrap items-center gap-1 text-sm font-medium text-kantira-navy-700"
          >
            <Link
              href="/"
              className="rounded-lg px-3 py-2 hover:bg-kantira-navy-50"
            >
              Home
            </Link>
            <Link
              href="/shop"
              className="rounded-lg px-3 py-2 hover:bg-kantira-navy-50"
            >
              Shop
            </Link>
            <Link
              href="/categories"
              className="rounded-lg px-3 py-2 hover:bg-kantira-navy-50"
            >
              Categories
            </Link>
            <Link
              href="/search"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 hover:bg-kantira-navy-50"
            >
              <Search size={15} />
              Search
            </Link>
          </nav>

          <div className="flex items-center gap-2">
            {isCustomer ? (
              <>
                <Link
                  href="/cart"
                  aria-label={`Cart, ${cartItemCount} item${cartItemCount === 1 ? "" : "s"}`}
                  className="relative inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-kantira-navy-700 hover:bg-kantira-navy-50"
                >
                  <ShoppingCart size={18} />
                  {cartItemCount > 0 ? (
                    <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-brand-royal px-1 text-[11px] font-bold text-white">
                      {cartItemCount > 99 ? "99+" : cartItemCount}
                    </span>
                  ) : null}
                </Link>
                <Link
                  href="/account"
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-kantira-navy-700 hover:bg-kantira-navy-50"
                >
                  <User size={16} />
                  My account
                </Link>
                <form action={signOut}>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-kantira-navy-600 hover:bg-kantira-navy-50"
                  >
                    <LogOut size={16} />
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-royal px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-[#0f4fd6]"
              >
                <User size={16} />
                Account
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-kantira-navy-100 bg-kantira-navy-900">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="flex items-center gap-2.5">
              <ShoppingBag size={18} className="text-kantira-navy-300" />
              <span className="text-sm font-semibold text-white">KANTIRA</span>
            </div>
            <nav
              aria-label="Storefront footer"
              className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-kantira-navy-300"
            >
              <Link href="/shop" className="hover:text-white">
                Shop
              </Link>
              <Link href="/categories" className="hover:text-white">
                Categories
              </Link>
              <Link href="/search" className="hover:text-white">
                Search
              </Link>
              <Link href="/account" className="hover:text-white">
                Account
              </Link>
            </nav>
          </div>
          <p className="mt-6 text-xs text-kantira-navy-400">
            &copy; {new Date().getFullYear()} KANTIRA. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
