import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireCustomerContext } from "@/lib/actions/customer-auth";
import { createAddressAction } from "@/lib/actions/customer-addresses";
import { sanitizeInternalRedirect } from "@/lib/data/customer-address";
import { StorefrontShell } from "@/components/storefront/storefront-shell";
import { AddressForm } from "@/components/account/address-form";
import { cardClass } from "@/lib/ui/form-classes";

export default async function NewAddressPage({
  searchParams,
}: {
  searchParams: { redirect?: string };
}) {
  const ctx = await requireCustomerContext();
  if (ctx.error) {
    redirect("/dashboard");
  }

  const redirectTo = sanitizeInternalRedirect(searchParams.redirect, "/account/addresses");

  return (
    <StorefrontShell>
      <div className="mx-auto max-w-xl px-6 py-10">
        <Link
          href="/account/addresses"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-brand-royal"
        >
          <ArrowLeft size={16} />
          Back to addresses
        </Link>
        <h1 className="mb-6 text-2xl font-bold text-kantira-navy-900">Add address</h1>
        <section className={cardClass}>
          <AddressForm action={createAddressAction} redirectTo={redirectTo} />
        </section>
      </div>
    </StorefrontShell>
  );
}
