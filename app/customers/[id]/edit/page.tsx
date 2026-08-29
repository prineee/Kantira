import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/data/get-org-id";
import { KantiraShell } from "@/components/kantira-shell";
import { signOut } from "@/app/dashboard/actions";
import { updateCustomer } from "../../actions";
import { CustomerForm } from "../../customer-form";
import { cardClass } from "@/lib/ui/form-classes";

const WRITE_ROLES = ["OWNER", "ADMIN", "SALES", "ACCOUNTANT"];

export default async function EditCustomerPage({
  params,
}: {
  params: { id: string };
}) {
  const { supabase, profile, organization } = await getOrgContext();
  const canWrite = WRITE_ROLES.includes(profile.role);

  const { data: customer } = await supabase
    .from("customers")
    .select("id, customer_code, name, phone, email, gstin, billing_address, is_active")
    .eq("id", params.id)
    .maybeSingle();

  if (!customer) {
    notFound();
  }

  return (
    <KantiraShell
      orgName={organization?.name ?? "—"}
      role={profile.role}
      signOutAction={signOut}
    >
      <div className="mb-6">
        <Link href="/customers" className="text-sm font-medium text-brand-royal">
          ← Back to customers
        </Link>
        <h2 className="mt-2 text-xl font-bold text-kantira-navy-900">
          Edit customer
        </h2>
      </div>

      <section className={cardClass}>
        {canWrite ? (
          <CustomerForm
            mode="edit"
            action={updateCustomer.bind(null, customer.id)}
            initial={{
              customer_code: customer.customer_code,
              name: customer.name,
              phone: customer.phone ?? "",
              email: customer.email ?? "",
              gstin: customer.gstin ?? "",
              billing_address: customer.billing_address ?? "",
              is_active: customer.is_active,
            }}
          />
        ) : (
          <p className="text-sm text-brand-slate">
            Your role ({profile.role}) does not have permission to edit
            customers.
          </p>
        )}
      </section>
    </KantiraShell>
  );
}
