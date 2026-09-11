import { redirect } from "next/navigation";
import { getOrgContext } from "@/lib/data/get-org-id";
import { KantiraShell } from "@/components/kantira-shell";
import { signOut } from "@/app/dashboard/actions";
import { createPurchase } from "../actions";
import { PurchaseForm } from "../purchase-form";
import { cardClass } from "@/lib/ui/form-classes";

const WRITE_ROLES = ["OWNER", "ADMIN", "STOCK"];

export default async function NewPurchasePage() {
  const { supabase, profile, organization } = await getOrgContext();
  if (!WRITE_ROLES.includes(profile.role)) {
    redirect("/purchases");
  }

  const [{ data: stores }, { data: suppliers }, { data: items }, { data: units }] =
    await Promise.all([
      supabase.from("stores").select("id, store_code, store_name").order("store_code"),
      supabase
        .from("suppliers")
        .select("id, supplier_code, name")
        .eq("is_active", true)
        .order("name"),
      // items_catalog_for_staff() (not the items table directly): a
      // SECURITY DEFINER RPC scoped to the caller's own organization,
      // returning cost_price only to an authenticated staff member — see
      // migration 0022. The unit code is looked up from the units query
      // below instead of a PostgREST embed (RPC results don't embed
      // relations).
      supabase
        .rpc("items_catalog_for_staff")
        .select("id, sku, name, cost_price, tax_rate_percent, uom_id")
        .eq("is_active", true)
        .order("name"),
      supabase.from("units_of_measurement").select("id, code"),
    ]);

  const storeOptions = (stores ?? []).map((s) => ({
    id: s.id,
    label: `${s.store_code} — ${s.store_name}`,
  }));
  const supplierOptions = (suppliers ?? []).map((s) => ({
    id: s.id,
    label: `${s.supplier_code} — ${s.name}`,
  }));
  const unitCodeById = new Map((units ?? []).map((u) => [u.id, u.code]));
  const itemOptions = (items ?? []).map((i) => ({
    id: i.id ?? "",
    sku: i.sku ?? "",
    name: i.name ?? "",
    uomId: i.uom_id ?? "",
    uomLabel: (i.uom_id && unitCodeById.get(i.uom_id)) ?? "",
    defaultRate: i.cost_price ?? 0,
    taxRatePercent: i.tax_rate_percent ?? 0,
  }));

  return (
    <KantiraShell orgName={organization?.name ?? "—"} role={profile.role} signOutAction={signOut}>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-kantira-navy-900">New purchase</h2>
        <p className="text-sm text-brand-slate">
          Saved as a draft — review and post it from the purchase detail page.
        </p>
      </div>

      <section className={cardClass}>
        {storeOptions.length === 0 || supplierOptions.length === 0 || itemOptions.length === 0 ? (
          <p className="text-sm text-brand-slate">
            You need at least one store, one active supplier, and one active item before
            creating a purchase.
          </p>
        ) : (
          <PurchaseForm
            action={createPurchase}
            stores={storeOptions}
            suppliers={supplierOptions}
            items={itemOptions}
          />
        )}
      </section>
    </KantiraShell>
  );
}
