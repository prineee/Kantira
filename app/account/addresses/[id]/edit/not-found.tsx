import Link from "next/link";
import { StorefrontShell } from "@/components/storefront/storefront-shell";

export default function AddressNotFound() {
  return (
    <StorefrontShell>
      <div className="mx-auto max-w-xl px-6 py-16 text-center">
        <p className="text-lg font-semibold text-kantira-navy-900">Address not found</p>
        <p className="mt-2 text-sm text-brand-slate">
          This address may have been removed.
        </p>
        <Link
          href="/account/addresses"
          className="mt-6 inline-flex items-center gap-2 rounded-card bg-brand-royal px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0f4fd6]"
        >
          Back to addresses
        </Link>
      </div>
    </StorefrontShell>
  );
}
