import Link from "next/link";
import { getOrgContext } from "@/lib/data/get-org-id";
import { KantiraShell } from "@/components/kantira-shell";
import { signOut } from "@/app/dashboard/actions";
import { createCategory, createUnit } from "./actions";
import { CategoryForm, UnitForm } from "./lookup-form";
import { cardClass, badgeActiveClass, badgeInactiveClass } from "@/lib/ui/form-classes";

const WRITE_ROLES = ["OWNER", "ADMIN", "STOCK"];

export default async function ItemSetupPage() {
  const { supabase, profile, organization } = await getOrgContext();
  const canWrite = WRITE_ROLES.includes(profile.role);

  const [{ data: categories }, { data: units }] = await Promise.all([
    supabase
      .from("product_categories")
      .select("id, name, is_active")
      .order("name"),
    supabase
      .from("units_of_measurement")
      .select("id, code, name, is_active")
      .order("code"),
  ]);

  return (
    <KantiraShell
      orgName={organization?.name ?? "—"}
      role={profile.role}
      signOutAction={signOut}
    >
      <div className="mb-6">
        <Link href="/items" className="text-sm font-medium text-brand-royal">
          ← Back to items
        </Link>
        <h2 className="mt-2 text-xl font-bold text-kantira-navy-900">
          Categories &amp; units
        </h2>
        <p className="text-sm text-brand-slate">
          Lookup data used by the item catalog.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className={cardClass}>
          <h3 className="mb-4 text-base font-semibold text-kantira-navy-900">
            Categories
          </h3>
          {canWrite ? (
            <div className="mb-6">
              <CategoryForm
                action={createCategory}
                categories={(categories ?? []).map((c) => ({ id: c.id, name: c.name }))}
              />
            </div>
          ) : null}
          {categories && categories.length > 0 ? (
            <ul className="divide-y divide-kantira-navy-50 text-sm">
              {categories.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2">
                  <span className="text-kantira-navy-900">{c.name}</span>
                  <span className={c.is_active ? badgeActiveClass : badgeInactiveClass}>
                    {c.is_active ? "Active" : "Inactive"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-brand-slate">No categories yet.</p>
          )}
        </section>

        <section className={cardClass}>
          <h3 className="mb-4 text-base font-semibold text-kantira-navy-900">
            Units of measurement
          </h3>
          {canWrite ? (
            <div className="mb-6">
              <UnitForm action={createUnit} />
            </div>
          ) : null}
          {units && units.length > 0 ? (
            <ul className="divide-y divide-kantira-navy-50 text-sm">
              {units.map((u) => (
                <li key={u.id} className="flex items-center justify-between py-2">
                  <span className="text-kantira-navy-900">
                    {u.code} — {u.name}
                  </span>
                  <span className={u.is_active ? badgeActiveClass : badgeInactiveClass}>
                    {u.is_active ? "Active" : "Inactive"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-brand-slate">No units yet.</p>
          )}
        </section>
      </div>
    </KantiraShell>
  );
}
