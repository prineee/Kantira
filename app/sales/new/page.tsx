import { redirect } from "next/navigation";
import { getOrgContext } from "@/lib/data/get-org-id";
import { KantiraShell } from "@/components/kantira-shell";
import { signOut } from "@/app/dashboard/actions";
import { createSale } from "../actions";
import { SaleForm } from "../sale-form";
import { cardClass } from "@/lib/ui/form-classes";

const WRITE_ROLES = ["OWNER", "ADMIN", "SALES"];

export default async function NewSalePage() {
  const { supabase, profile, organization } = await getOrgContext();
  if (!WRITE_ROLES.includes(profile.role)) {
    redirect("/sales");
  }

  const [{ data: stores }, { data: customers }, { data: items }] = await Promise.all([
    supabase.from("stores").select("id, store_code, store_name").order("store_code"),
    supabase
      .from("customers")
      .select("id, customer_code, name")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("items")
      .select(
        "id, sku, name, selling_price, tax_rate_percent, uom_id, units_of_measurement(code)",
      )
      .eq("is_active", true)
      .order("name"),
  ]);

  const storeOptions = (stores ?? []).map((s) => ({
    id: s.id,
    label: `${s.store_code} — ${s.store_name}`,
  }));
  const customerOptions = (customers ?? []).map((c) => ({
    id: c.id,
    label: `${c.customer_code} — ${c.name}`,
  }));
  const itemOptions = (items ?? []).map((i) => ({
    id: i.id,
    sku: i.sku,
    name: i.name,
    uomId: i.uom_id,
    uomLabel: i.units_of_measurement?.code ?? "",
    defaultRate: i.selling_price,
    taxRatePercent: i.tax_rate_percent,
  }));

  return (
    <KantiraShell orgName={organization?.name ?? "—"} role={profile.role} signOutAction={signOut}>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-kantira-navy-900">New sale</h2>
        <p className="text-sm text-brand-slate">
          Saved as a draft — review and post it from the sale detail page.
        </p>
      </div>

      <section className={cardClass}>
        {storeOptions.length === 0 || itemOptions.length === 0 ? (
          <p className="text-sm text-brand-slate">
            You need at least one store and one active item before creating a sale.
          </p>
        ) : (
          <SaleForm action={createSale} stores={storeOptions} customers={customerOptions} items={itemOptions} />
        )}
      </section>
    </KantiraShell>
  );
}
