import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/data/get-org-id";
import { KantiraShell } from "@/components/kantira-shell";
import { signOut } from "@/app/dashboard/actions";
import { updateStore } from "../../actions";
import { StoreForm } from "../../store-form";
import { cardClass, badgeActiveClass, badgeInactiveClass } from "@/lib/ui/form-classes";

// Mirrors stores_insert_admin / stores_update_admin RLS.
const STORE_WRITE_ROLES = ["OWNER", "ADMIN"];

export default async function StoreDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { supabase, profile, organization } = await getOrgContext();
  const canWrite = STORE_WRITE_ROLES.includes(profile.role);

  // stores_select RLS scopes this read: OWNER/ADMIN can see any store in the
  // org, other roles only stores they have explicit access to. If the row
  // isn't returned, either it doesn't exist or this user can't see it —
  // both are treated as not-found, matching the rest of the app.
  const { data: store } = await supabase
    .from("stores")
    .select("id, store_code, store_name, type, phone, city, address, is_active")
    .eq("id", params.id)
    .maybeSingle();

  if (!store) {
    notFound();
  }

  return (
    <KantiraShell
      orgName={organization?.name ?? "—"}
      role={profile.role}
      signOutAction={signOut}
    >
      <div className="mb-6">
        <Link href="/stores" className="text-sm font-medium text-brand-royal">
          ← Back to stores
        </Link>
        <h2 className="mt-2 text-xl font-bold text-kantira-navy-900">
          {store.store_name}
        </h2>
      </div>

      <section className={cardClass}>
        {canWrite ? (
          <StoreForm
            mode="edit"
            action={updateStore.bind(null, store.id)}
            initial={{
              store_code: store.store_code,
              store_name: store.store_name,
              type: store.type,
              phone: store.phone ?? "",
              city: store.city ?? "",
              address: store.address ?? "",
              is_active: store.is_active,
            }}
          />
        ) : (
          <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-brand-slate">Store code</dt>
              <dd className="mt-0.5 font-medium text-kantira-navy-900">{store.store_code}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-brand-slate">Type</dt>
              <dd className="mt-0.5 font-medium text-kantira-navy-900">{store.type}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-brand-slate">Phone</dt>
              <dd className="mt-0.5 font-medium text-kantira-navy-900">{store.phone ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-brand-slate">City</dt>
              <dd className="mt-0.5 font-medium text-kantira-navy-900">{store.city ?? "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-brand-slate">Address</dt>
              <dd className="mt-0.5 font-medium text-kantira-navy-900">{store.address ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-brand-slate">Status</dt>
              <dd className="mt-1">
                <span className={store.is_active ? badgeActiveClass : badgeInactiveClass}>
                  {store.is_active ? "Active" : "Inactive"}
                </span>
              </dd>
            </div>
          </dl>
        )}
      </section>
    </KantiraShell>
  );
}
