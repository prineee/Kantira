import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/data/get-org-id";
import { KantiraShell } from "@/components/kantira-shell";
import { signOut } from "@/app/dashboard/actions";
import { getAvailablePickupLocations } from "./actions";
import { PickupMappingForm } from "./pickup-form";
import { cardClass, badgeActiveClass, badgeInactiveClass, errorTextClass } from "@/lib/ui/form-classes";

// Mirrors store_shipping_config_select_staff RLS (0015).
const WRITE_ROLES = ["OWNER", "ADMIN"];

export default async function StoreShippingPage({ params }: { params: { id: string } }) {
  const { supabase, profile, organization } = await getOrgContext();
  const canWrite = WRITE_ROLES.includes(profile.role);

  // stores_select RLS scopes this read exactly like the edit page's own
  // lookup — not found and not-yours are indistinguishable by design.
  const { data: store } = await supabase
    .from("stores")
    .select("id, store_name")
    .eq("id", params.id)
    .maybeSingle();

  if (!store) {
    notFound();
  }

  if (!canWrite) {
    return (
      <KantiraShell orgName={organization?.name ?? "—"} role={profile.role} signOutAction={signOut}>
        <div className="mb-6">
          <Link href={`/stores/${store.id}/edit`} className="text-sm font-medium text-brand-royal">
            ← Back to {store.store_name}
          </Link>
        </div>
        <section className={cardClass}>
          <p className="text-sm text-brand-slate">
            You do not have permission to view Shiprocket pickup mapping for this store.
          </p>
        </section>
      </KantiraShell>
    );
  }

  // store_shipping_config_select_staff (0015) already permits an OWNER/ADMIN
  // read of any mapping in their own organization — no new RPC needed for
  // this half of the page, only the write path (set_store_pickup_mapping,
  // migration 0030) was missing.
  const { data: mapping } = await supabase
    .from("store_shipping_config")
    .select("provider, provider_location_id, provider_location_name, active, updated_at")
    .eq("store_id", store.id)
    .maybeSingle();

  const pickupResult = await getAvailablePickupLocations();

  return (
    <KantiraShell orgName={organization?.name ?? "—"} role={profile.role} signOutAction={signOut}>
      <div className="mb-6">
        <Link href={`/stores/${store.id}/edit`} className="text-sm font-medium text-brand-royal">
          ← Back to {store.store_name}
        </Link>
        <h2 className="mt-2 text-xl font-bold text-kantira-navy-900">
          Shiprocket pickup mapping — {store.store_name}
        </h2>
      </div>

      <section className={`${cardClass} space-y-5`}>
        <div>
          <p className="text-xs uppercase tracking-wide text-brand-slate">Current mapping</p>
          {mapping ? (
            <div className="mt-2 space-y-1 text-sm">
              <p>
                <span className="font-medium text-kantira-navy-900">{mapping.provider_location_name}</span>{" "}
                <span className="text-brand-slate">({mapping.provider_location_id})</span>
              </p>
              <p className="text-brand-slate">Provider: {mapping.provider}</p>
              <span className={mapping.active ? badgeActiveClass : badgeInactiveClass}>
                {mapping.active ? "Active" : "Inactive"}
              </span>
            </div>
          ) : (
            <p className="mt-2 text-sm text-brand-slate">No Shiprocket pickup location is mapped yet.</p>
          )}
        </div>

        <div className="border-t border-kantira-navy-100 pt-4">
          <p className="mb-2 text-xs uppercase tracking-wide text-brand-slate">
            {mapping ? "Change mapping" : "Map a pickup location"}
          </p>
          {pickupResult.ok ? (
            pickupResult.locations.length > 0 ? (
              <PickupMappingForm storeId={store.id} locations={pickupResult.locations} />
            ) : (
              <p className="text-sm text-brand-slate">
                No pickup locations are configured in Shiprocket yet. Add one in the Shiprocket
                dashboard first.
              </p>
            )
          ) : (
            <p className={errorTextClass}>{pickupResult.error}</p>
          )}
        </div>
      </section>
    </KantiraShell>
  );
}
