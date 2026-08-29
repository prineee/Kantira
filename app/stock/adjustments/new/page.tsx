import { redirect } from "next/navigation";
import { getOrgContext } from "@/lib/data/get-org-id";
import { KantiraShell } from "@/components/kantira-shell";
import { signOut } from "@/app/dashboard/actions";
import { createStockAdjustment } from "../actions";
import { AdjustmentForm } from "../adjustment-form";
import { cardClass } from "@/lib/ui/form-classes";

const WRITE_ROLES = ["OWNER", "ADMIN", "STOCK"];

export default async function NewStockAdjustmentPage() {
  const { supabase, profile, organization } = await getOrgContext();
  if (!WRITE_ROLES.includes(profile.role)) {
    redirect("/stock/adjustments");
  }

  const [{ data: stores }, { data: items }] = await Promise.all([
    supabase.from("stores").select("id, store_code, store_name").order("store_code"),
    supabase
      .from("items")
      .select("id, sku, name")
      .eq("is_active", true)
      .eq("track_inventory", true)
      .order("name"),
  ]);

  const storeOptions = (stores ?? []).map((s) => ({
    id: s.id,
    label: `${s.store_code} — ${s.store_name}`,
  }));
  const itemOptions = (items ?? []).map((i) => ({ id: i.id, label: `${i.sku} — ${i.name}` }));

  return (
    <KantiraShell orgName={organization?.name ?? "—"} role={profile.role} signOutAction={signOut}>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-kantira-navy-900">Record stock adjustment</h2>
        <p className="text-sm text-brand-slate">
          Posts immediately, with a journal entry against the inventory write-off account when the
          adjustment has a cost.
        </p>
      </div>

      <section className={cardClass}>
        {storeOptions.length === 0 || itemOptions.length === 0 ? (
          <p className="text-sm text-brand-slate">
            You need at least one store and one tracked item to record an adjustment.
          </p>
        ) : (
          <AdjustmentForm action={createStockAdjustment} stores={storeOptions} items={itemOptions} />
        )}
      </section>
    </KantiraShell>
  );
}
