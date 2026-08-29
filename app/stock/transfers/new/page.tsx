import { redirect } from "next/navigation";
import { getOrgContext } from "@/lib/data/get-org-id";
import { KantiraShell } from "@/components/kantira-shell";
import { signOut } from "@/app/dashboard/actions";
import { createStockTransfer } from "../actions";
import { TransferForm } from "../transfer-form";
import { cardClass } from "@/lib/ui/form-classes";

const WRITE_ROLES = ["OWNER", "ADMIN", "STOCK"];

export default async function NewStockTransferPage() {
  const { supabase, profile, organization } = await getOrgContext();
  if (!WRITE_ROLES.includes(profile.role)) {
    redirect("/stock/transfers");
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
        <h2 className="text-xl font-bold text-kantira-navy-900">Record stock transfer</h2>
        <p className="text-sm text-brand-slate">
          Posts immediately — moves quantity and value between two stores at the source's current
          average cost.
        </p>
      </div>

      <section className={cardClass}>
        {storeOptions.length < 2 || itemOptions.length === 0 ? (
          <p className="text-sm text-brand-slate">
            You need at least two stores and one tracked item to record a transfer.
          </p>
        ) : (
          <TransferForm action={createStockTransfer} stores={storeOptions} items={itemOptions} />
        )}
      </section>
    </KantiraShell>
  );
}
