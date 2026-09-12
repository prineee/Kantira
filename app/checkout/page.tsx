import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowLeft, ArrowRight, MapPin, Plus, Truck } from "lucide-react";
import { requireCustomerContext } from "@/lib/actions/customer-auth";
import { getCustomerCartSummary } from "@/lib/data/cart-queries";
import { listCustomerAddresses } from "@/lib/data/customer-address-queries";
import { isValidUuid } from "@/lib/data/storefront-catalog";
import { selectCheckoutAddress } from "@/lib/data/customer-address";
import { StorefrontShell } from "@/components/storefront/storefront-shell";
import { cardClass, badgeActiveClass } from "@/lib/ui/form-classes";
import { getCheckoutShippingQuote } from "./actions";

// COD is the only approved launch payment model
// (docs/architecture/PHASE_5_ARCHITECTURE_DECISIONS.md section 3.3) — this
// phase builds no payment-method selection (payment itself is explicitly
// out of scope), so the shipping estimate shown here is computed against
// the one model that's actually approved, not an invented default. This is
// display-only: no order, payment, inventory reservation, or Shiprocket
// shipment is created by loading this page.
const CHECKOUT_PAYMENT_METHOD = "COD" as const;

const NEW_ADDRESS_HREF = `/account/addresses/new?redirect=${encodeURIComponent("/checkout")}`;

// Same gating pattern as /cart and /account: middleware already sends an
// anonymous visitor to /login before this page runs (/checkout is not in
// the public storefront allowlist — lib/auth/public-routes.ts).
// requireCustomerContext() then separates a signed-in STAFF/unresolved
// identity from an actual customer, exactly like every other
// customer-only route in this app.
export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: { address?: string };
}) {
  const ctx = await requireCustomerContext();
  if (ctx.error) {
    redirect("/dashboard");
  }

  // Revalidates the cart from scratch on every checkout load — never trusts
  // anything the browser might already believe about prices/availability
  // (Phase 4B's getCustomerCartSummary always reads current, customer-safe
  // items data live).
  const [summary, addresses] = await Promise.all([
    getCustomerCartSummary(ctx.supabase),
    listCustomerAddresses(ctx.supabase),
  ]);

  if (summary.lines.length === 0) {
    return (
      <StorefrontShell>
        <div className="mx-auto max-w-2xl px-6 py-16 text-center">
          <p className="text-lg font-semibold text-kantira-navy-900">
            Your cart is empty
          </p>
          <p className="mt-2 text-sm text-brand-slate">
            Add something to your cart before checking out.
          </p>
          <Link
            href="/shop"
            className="mt-6 inline-flex items-center gap-2 rounded-card bg-brand-royal px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0f4fd6]"
          >
            Start shopping
            <ArrowRight size={16} />
          </Link>
        </div>
      </StorefrontShell>
    );
  }

  if (summary.hasUnavailableItems) {
    return (
      <StorefrontShell>
        <div className="mx-auto max-w-2xl px-6 py-16 text-center">
          <AlertTriangle className="mx-auto text-red-500" size={32} />
          <p className="mt-4 text-lg font-semibold text-kantira-navy-900">
            Your cart needs attention
          </p>
          <p className="mt-2 text-sm text-brand-slate">
            One or more items in your cart are no longer available. Remove
            them to continue to checkout.
          </p>
          <Link
            href="/cart"
            className="mt-6 inline-flex items-center gap-2 rounded-card bg-brand-royal px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0f4fd6]"
          >
            Review cart
          </Link>
        </div>
      </StorefrontShell>
    );
  }

  const requestedAddressId =
    searchParams.address && isValidUuid(searchParams.address)
      ? searchParams.address
      : undefined;

  // Falls back to the customer's default address, then their most recent
  // one — the ?address= param is never trusted as an id belonging to this
  // customer: getCheckoutShippingQuote (below) re-verifies ownership via
  // RLS the same way it always has, and `addresses` here already only
  // ever contains this customer's own rows (customer_addresses_select_self).
  const selectedAddress = selectCheckoutAddress(addresses, requestedAddressId);

  const shippingQuote = selectedAddress
    ? await getCheckoutShippingQuote({
        addressId: selectedAddress.id,
        itemLines: summary.lines.map((line) => ({
          itemId: line.itemId,
          quantity: line.quantity,
        })),
        paymentMethod: CHECKOUT_PAYMENT_METHOD,
      })
    : null;

  const lowestShippingTotal =
    shippingQuote && shippingQuote.ok && shippingQuote.options.length > 0
      ? Math.min(...shippingQuote.options.map((o) => o.shippingTotal))
      : null;

  return (
    <StorefrontShell>
      <div className="mx-auto max-w-4xl px-6 py-10">
        <Link
          href="/cart"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-brand-royal"
        >
          <ArrowLeft size={16} />
          Back to cart
        </Link>
        <h1 className="mb-6 text-2xl font-bold text-kantira-navy-900">Checkout</h1>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <section className={cardClass}>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-base font-semibold text-kantira-navy-900">
                  <MapPin size={18} className="text-brand-royal" />
                  Delivery address
                </h2>
                <Link
                  href={NEW_ADDRESS_HREF}
                  className="inline-flex items-center gap-1 text-sm font-medium text-brand-royal"
                >
                  <Plus size={14} />
                  Add new
                </Link>
              </div>

              {addresses.length === 0 ? (
                <p className="text-sm text-brand-slate">
                  You don&apos;t have a saved address yet.{" "}
                  <Link href={NEW_ADDRESS_HREF} className="font-medium text-brand-royal">
                    Add one
                  </Link>{" "}
                  to continue.
                </p>
              ) : (
                <div className="space-y-3">
                  {addresses.map((address) => {
                    const isSelected = selectedAddress?.id === address.id;
                    return (
                      <Link
                        key={address.id}
                        href={`/checkout?address=${address.id}`}
                        className={`block rounded-lg border p-4 text-sm transition ${
                          isSelected
                            ? "border-brand-royal bg-brand-royal/5"
                            : "border-kantira-navy-100 hover:border-kantira-navy-300"
                        }`}
                      >
                        <p className="flex items-center gap-2 font-semibold text-kantira-navy-900">
                          {address.recipientName}
                          {address.isDefault ? (
                            <span className={badgeActiveClass}>Default</span>
                          ) : null}
                        </p>
                        <p className="text-brand-slate">{address.phone}</p>
                        <p className="text-brand-slate">
                          {address.line1}
                          {address.line2 ? `, ${address.line2}` : ""}, {address.city},{" "}
                          {address.state} {address.postalCode}
                        </p>
                      </Link>
                    );
                  })}
                </div>
              )}

              <p className="mt-4 text-xs text-brand-slate">
                Billing address will be the same as your delivery address.
              </p>
            </section>

            <section className={cardClass}>
              <h2 className="mb-4 text-base font-semibold text-kantira-navy-900">Items</h2>
              <ul className="divide-y divide-kantira-navy-100">
                {summary.lines.map((line) => (
                  <li
                    key={line.cartItemId}
                    className="flex items-center justify-between py-3 text-sm"
                  >
                    <div>
                      <p className="font-medium text-kantira-navy-900">{line.name}</p>
                      <p className="text-brand-slate">
                        Qty {line.quantity} &times; &#8377;{line.unitPrice!.toFixed(2)}
                      </p>
                    </div>
                    <p className="font-semibold text-kantira-navy-900">
                      &#8377;{line.lineTotal!.toFixed(2)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>

            <section className={cardClass}>
              <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-kantira-navy-900">
                <Truck size={18} className="text-brand-royal" />
                Shipping
              </h2>
              {!selectedAddress ? (
                <p className="text-sm text-brand-slate">
                  Select a delivery address to see shipping options.
                </p>
              ) : shippingQuote && shippingQuote.ok ? (
                shippingQuote.options.length > 0 ? (
                  <ul className="space-y-2">
                    {shippingQuote.options.slice(0, 3).map((option) => (
                      <li
                        key={option.courierId}
                        className="flex items-center justify-between rounded-lg border border-kantira-navy-100 px-3 py-2 text-sm"
                      >
                        <span>
                          {option.courierName}
                          {option.estimatedDeliveryDays
                            ? ` — ${option.estimatedDeliveryDays} days`
                            : ""}
                        </span>
                        <span className="font-semibold">
                          &#8377;{option.shippingTotal.toFixed(2)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-brand-slate">
                    No shipping options are currently available for this address.
                  </p>
                )
              ) : (
                <p className="text-sm text-red-600">
                  {shippingQuote?.error ?? "Shipping is not available right now."}
                </p>
              )}
            </section>
          </div>

          <div>
            <section className={`${cardClass} lg:sticky lg:top-6`}>
              <h2 className="mb-4 text-base font-semibold text-kantira-navy-900">
                Order summary
              </h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-brand-slate">Subtotal</span>
                  <span>&#8377;{summary.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-brand-slate">Shipping</span>
                  <span>
                    {lowestShippingTotal !== null
                      ? `₹${lowestShippingTotal.toFixed(2)}`
                      : "—"}
                  </span>
                </div>
              </div>
              <div className="mt-4 flex justify-between border-t border-kantira-navy-100 pt-4 text-base font-bold text-kantira-navy-900">
                <span>Estimated total</span>
                <span>
                  &#8377;{(summary.subtotal + (lowestShippingTotal ?? 0)).toFixed(2)}
                </span>
              </div>

              <button
                type="button"
                disabled
                title="Payment is coming soon"
                className="mt-6 w-full cursor-not-allowed rounded-card bg-kantira-navy-100 px-5 py-3 text-sm font-semibold text-kantira-navy-400"
              >
                Proceed to payment — coming soon
              </button>
            </section>
          </div>
        </div>
      </div>
    </StorefrontShell>
  );
}
