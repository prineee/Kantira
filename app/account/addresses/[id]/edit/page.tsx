import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireCustomerContext } from "@/lib/actions/customer-auth";
import { updateAddressAction } from "@/lib/actions/customer-addresses";
import { getCustomerAddress } from "@/lib/data/customer-address-queries";
import { isValidUuid } from "@/lib/data/storefront-catalog";
import { StorefrontShell } from "@/components/storefront/storefront-shell";
import { AddressForm } from "@/components/account/address-form";
import { cardClass } from "@/lib/ui/form-classes";

export default async function EditAddressPage({
  params,
}: {
  params: { id: string };
}) {
  const ctx = await requireCustomerContext();
  if (ctx.error) {
    redirect("/dashboard");
  }

  // RLS (customer_addresses_select_self) already means a well-formed id
  // belonging to another customer simply returns no row — this guard only
  // stops a malformed id from reaching the database as an invalid-UUID
  // query error.
  const address = isValidUuid(params.id)
    ? await getCustomerAddress(ctx.supabase, params.id)
    : null;

  if (!address) {
    notFound();
  }

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
        <h1 className="mb-6 text-2xl font-bold text-kantira-navy-900">Edit address</h1>
        <section className={cardClass}>
          <AddressForm action={updateAddressAction.bind(null, address.id)} initial={address} />
        </section>
      </div>
    </StorefrontShell>
  );
}
