import Link from "next/link";
import { Pencil } from "lucide-react";
import { getOrgContext } from "@/lib/data/get-org-id";
import { KantiraShell } from "@/components/kantira-shell";
import { signOut } from "@/app/dashboard/actions";
import { createCustomer } from "./actions";
import { CustomerForm } from "./customer-form";
import { cardClass, badgeActiveClass, badgeInactiveClass } from "@/lib/ui/form-classes";

const WRITE_ROLES = ["OWNER", "ADMIN", "SALES", "ACCOUNTANT"];

export default async function CustomersPage() {
  const { supabase, profile, organization } = await getOrgContext();
  const canWrite = WRITE_ROLES.includes(profile.role);

  const { data: customers } = await supabase
    .from("customers")
    .select("id, customer_code, name, phone, email, gstin, is_active")
    .order("name");

  return (
    <KantiraShell
      orgName={organization?.name ?? "—"}
      role={profile.role}
      signOutAction={signOut}
    >
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-kantira-navy-900">Customers</h2>
          <p className="text-sm text-brand-slate">
            Buyers this organization sells to.
          </p>
        </div>
        <Link href="/receipts" className="text-sm font-medium text-brand-royal">
          Customer receipts →
        </Link>
      </div>

      {canWrite ? (
        <section className={`${cardClass} mb-8`}>
          <h3 className="mb-4 text-base font-semibold text-kantira-navy-900">
            New customer
          </h3>
          <CustomerForm mode="create" action={createCustomer} />
        </section>
      ) : null}

      <section className={cardClass}>
        <h3 className="mb-4 text-base font-semibold text-kantira-navy-900">
          All customers
        </h3>
        {customers && customers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-kantira-navy-100 text-xs uppercase tracking-wide text-brand-slate">
                  <th className="py-2 pr-4">Code</th>
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Phone</th>
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Status</th>
                  {canWrite ? <th className="py-2 pr-4" /> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-kantira-navy-50">
                {customers.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2.5 pr-4 font-mono text-xs text-kantira-navy-700">
                      {c.customer_code}
                    </td>
                    <td className="py-2.5 pr-4 font-medium text-kantira-navy-900">
                      {c.name}
                    </td>
                    <td className="py-2.5 pr-4 text-brand-slate">{c.phone ?? "—"}</td>
                    <td className="py-2.5 pr-4 text-brand-slate">{c.email ?? "—"}</td>
                    <td className="py-2.5 pr-4">
                      <span className={c.is_active ? badgeActiveClass : badgeInactiveClass}>
                        {c.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    {canWrite ? (
                      <td className="py-2.5 pr-4">
                        <Link
                          href={`/customers/${c.id}/edit`}
                          className="inline-flex items-center gap-1 text-brand-royal"
                        >
                          <Pencil size={14} />
                          Edit
                        </Link>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-brand-slate">No customers yet.</p>
        )}
      </section>
    </KantiraShell>
  );
}
