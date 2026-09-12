import Link from "next/link";
import { redirect } from "next/navigation";
import { MapPin, Plus } from "lucide-react";
import { requireCustomerContext } from "@/lib/actions/customer-auth";
import { listCustomerAddresses } from "@/lib/data/customer-address-queries";
import { StorefrontShell } from "@/components/storefront/storefront-shell";
import { AddressCard } from "@/components/account/address-card";

// Same gating pattern as app/account/page.tsx and app/cart/page.tsx:
// middleware already requires an authenticated session for anything
// outside the public storefront allowlist, and requireCustomerContext()
// then separates an actual customer from a signed-in staff/unresolved
// identity (sent to /dashboard, never shown a customer address list).
export default async function AddressesPage() {
  const ctx = await requireCustomerContext();
  if (ctx.error) {
    redirect("/dashboard");
  }

  const addresses = await listCustomerAddresses(ctx.supabase);

  return (
    <StorefrontShell>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-kantira-navy-900">
            <MapPin size={22} className="text-brand-royal" />
            Delivery Addresses
          </h1>
          <Link
            href="/account/addresses/new"
            className="inline-flex items-center gap-1.5 rounded-card bg-brand-royal px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0f4fd6]"
          >
            <Plus size={16} />
            Add address
          </Link>
        </div>

        {addresses.length === 0 ? (
          <div className="rounded-card border border-dashed border-kantira-navy-200 bg-white px-6 py-16 text-center">
            <p className="text-base font-semibold text-kantira-navy-900">
              No addresses saved yet
            </p>
            <p className="mt-2 text-sm text-brand-slate">
              Add a delivery address to speed up checkout.
            </p>
            <Link
              href="/account/addresses/new"
              className="mt-6 inline-flex items-center gap-2 rounded-card bg-brand-royal px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0f4fd6]"
            >
              <Plus size={16} />
              Add your first address
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {addresses.map((address) => (
              <AddressCard key={address.id} address={address} />
            ))}
          </div>
        )}
      </div>
    </StorefrontShell>
  );
}
