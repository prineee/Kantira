import Link from "next/link";
import { Pencil } from "lucide-react";
import { getOrgContext } from "@/lib/data/get-org-id";
import { KantiraShell } from "@/components/kantira-shell";
import { signOut } from "@/app/dashboard/actions";
import { createSupplier } from "./actions";
import { SupplierForm } from "./supplier-form";
import { cardClass, badgeActiveClass, badgeInactiveClass } from "@/lib/ui/form-classes";

const WRITE_ROLES = ["OWNER", "ADMIN", "ACCOUNTANT", "STOCK"];

export default async function SuppliersPage() {
  const { supabase, profile, organization } = await getOrgContext();
  const canWrite = WRITE_ROLES.includes(profile.role);

  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, supplier_code, name, phone, email, gstin, is_active")
    .order("name");

  return (
    <KantiraShell
      orgName={organization?.name ?? "—"}
      role={profile.role}
      signOutAction={signOut}
    >
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-kantira-navy-900">Suppliers</h2>
          <p className="text-sm text-brand-slate">
            Vendors this organization purchases from.
          </p>
        </div>
        <Link href="/payments" className="text-sm font-medium text-brand-royal">
          Supplier payments →
        </Link>
      </div>

      {canWrite ? (
        <section className={`${cardClass} mb-8`}>
          <h3 className="mb-4 text-base font-semibold text-kantira-navy-900">
            New supplier
          </h3>
          <SupplierForm mode="create" action={createSupplier} />
        </section>
      ) : null}

      <section className={cardClass}>
        <h3 className="mb-4 text-base font-semibold text-kantira-navy-900">
          All suppliers
        </h3>
        {suppliers && suppliers.length > 0 ? (
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
                {suppliers.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2.5 pr-4 font-mono text-xs text-kantira-navy-700">
                      {s.supplier_code}
                    </td>
                    <td className="py-2.5 pr-4 font-medium text-kantira-navy-900">
                      {s.name}
                    </td>
                    <td className="py-2.5 pr-4 text-brand-slate">{s.phone ?? "—"}</td>
                    <td className="py-2.5 pr-4 text-brand-slate">{s.email ?? "—"}</td>
                    <td className="py-2.5 pr-4">
                      <span className={s.is_active ? badgeActiveClass : badgeInactiveClass}>
                        {s.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    {canWrite ? (
                      <td className="py-2.5 pr-4">
                        <Link
                          href={`/suppliers/${s.id}/edit`}
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
          <p className="text-sm text-brand-slate">No suppliers yet.</p>
        )}
      </section>
    </KantiraShell>
  );
}
