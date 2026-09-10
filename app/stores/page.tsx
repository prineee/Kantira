import Link from "next/link";
import { Pencil } from "lucide-react";
import { getOrgContext } from "@/lib/data/get-org-id";
import { KantiraShell } from "@/components/kantira-shell";
import { signOut } from "@/app/dashboard/actions";
import { createStore } from "./actions";
import { StoreForm } from "./store-form";
import { cardClass, badgeActiveClass, badgeInactiveClass } from "@/lib/ui/form-classes";

// Mirrors stores_insert_admin / stores_update_admin RLS.
const STORE_WRITE_ROLES = ["OWNER", "ADMIN"];

export default async function StoresPage() {
  const { supabase, profile, organization } = await getOrgContext();
  const canWrite = STORE_WRITE_ROLES.includes(profile.role);

  // stores_select RLS already scopes this to the caller's organization, and
  // further to only stores they have access to unless they're OWNER/ADMIN.
  const { data: stores } = await supabase
    .from("stores")
    .select("id, store_code, store_name, type, city, phone, is_active")
    .order("store_name");

  return (
    <KantiraShell
      orgName={organization?.name ?? "—"}
      role={profile.role}
      signOutAction={signOut}
    >
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-kantira-navy-900">Stores</h2>
          <p className="text-sm text-brand-slate">
            Stores belonging to this organization.
          </p>
        </div>
      </div>

      {canWrite ? (
        <section className={`${cardClass} mb-8`}>
          <h3 className="mb-4 text-base font-semibold text-kantira-navy-900">
            New store
          </h3>
          <StoreForm mode="create" action={createStore} />
        </section>
      ) : null}

      <section className={cardClass}>
        <h3 className="mb-4 text-base font-semibold text-kantira-navy-900">
          All stores
        </h3>
        {stores && stores.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-kantira-navy-100 text-xs uppercase tracking-wide text-brand-slate">
                  <th className="py-2 pr-4">Code</th>
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">City</th>
                  <th className="py-2 pr-4">Phone</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-kantira-navy-50">
                {stores.map((store) => (
                  <tr key={store.id}>
                    <td className="py-2.5 pr-4 font-mono text-xs text-kantira-navy-700">
                      {store.store_code}
                    </td>
                    <td className="py-2.5 pr-4 font-medium text-kantira-navy-900">
                      {store.store_name}
                    </td>
                    <td className="py-2.5 pr-4 text-brand-slate">{store.type}</td>
                    <td className="py-2.5 pr-4 text-brand-slate">{store.city ?? "—"}</td>
                    <td className="py-2.5 pr-4 text-brand-slate">{store.phone ?? "—"}</td>
                    <td className="py-2.5 pr-4">
                      <span className={store.is_active ? badgeActiveClass : badgeInactiveClass}>
                        {store.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4">
                      <Link
                        href={`/stores/${store.id}/edit`}
                        className="inline-flex items-center gap-1 text-brand-royal"
                      >
                        {canWrite ? <Pencil size={14} /> : null}
                        {canWrite ? "Edit" : "View"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-brand-slate">No stores yet.</p>
        )}
      </section>
    </KantiraShell>
  );
}
