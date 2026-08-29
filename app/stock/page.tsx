import Link from "next/link";
import { getOrgContext } from "@/lib/data/get-org-id";
import { KantiraShell } from "@/components/kantira-shell";
import { signOut } from "@/app/dashboard/actions";
import { cardClass, badgeActiveClass, badgeWarningClass } from "@/lib/ui/form-classes";

// Read-only. stock_balances is a Phase 2 derived view (security_invoker over
// stock_movements) — quantity_on_hand only. No WAC/valuation figures here;
// that is Phase 4 UI and explicitly out of scope for this phase.
export default async function StockPage() {
  const { supabase, profile, organization } = await getOrgContext();

  const [{ data: balances }, { data: items }, { data: stores }] =
    await Promise.all([
      supabase
        .from("stock_balances")
        .select("store_id, item_id, quantity_on_hand")
        .order("store_id"),
      supabase
        .from("items")
        .select("id, sku, name, reorder_level, track_inventory"),
      supabase.from("stores").select("id, store_code, store_name"),
    ]);

  const itemsById = new Map((items ?? []).map((i) => [i.id, i]));
  const storesById = new Map((stores ?? []).map((s) => [s.id, s]));

  const rows = (balances ?? [])
    .filter((b) => b.store_id && b.item_id)
    .map((b) => {
      const item = itemsById.get(b.item_id!);
      const store = storesById.get(b.store_id!);
      return {
        key: `${b.store_id}-${b.item_id}`,
        storeLabel: store ? `${store.store_code} — ${store.store_name}` : "—",
        sku: item?.sku ?? "—",
        name: item?.name ?? "(unknown item)",
        quantity: b.quantity_on_hand ?? 0,
        reorderLevel: item?.reorder_level ?? 0,
        trackInventory: item?.track_inventory ?? true,
      };
    })
    .filter((r) => r.trackInventory)
    .sort((a, b) => a.storeLabel.localeCompare(b.storeLabel) || a.name.localeCompare(b.name));

  return (
    <KantiraShell
      orgName={organization?.name ?? "—"}
      role={profile.role}
      signOutAction={signOut}
    >
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-kantira-navy-900">Stock</h2>
          <p className="text-sm text-brand-slate">
            Current quantity on hand per store, derived from the stock movement
            ledger. Read-only — movements are posted through purchases, sales,
            and adjustments, never edited directly here.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 text-sm">
          <Link href="/stock/transfers" className="font-medium text-brand-royal">
            Record transfer →
          </Link>
          <Link href="/stock/adjustments" className="font-medium text-brand-royal">
            Record adjustment →
          </Link>
        </div>
      </div>

      <section className={cardClass}>
        {rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-kantira-navy-100 text-xs uppercase tracking-wide text-brand-slate">
                  <th className="py-2 pr-4">Store</th>
                  <th className="py-2 pr-4">SKU</th>
                  <th className="py-2 pr-4">Item</th>
                  <th className="py-2 pr-4 text-right">On hand</th>
                  <th className="py-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-kantira-navy-50">
                {rows.map((r) => {
                  const low = r.reorderLevel > 0 && r.quantity <= r.reorderLevel;
                  return (
                    <tr key={r.key}>
                      <td className="py-2.5 pr-4 text-brand-slate">{r.storeLabel}</td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-kantira-navy-700">
                        {r.sku}
                      </td>
                      <td className="py-2.5 pr-4 font-medium text-kantira-navy-900">
                        {r.name}
                      </td>
                      <td className="py-2.5 pr-4 text-right text-kantira-navy-700">
                        {r.quantity}
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className={low ? badgeWarningClass : badgeActiveClass}>
                          {low ? "Low stock" : "OK"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-brand-slate">
            No stock movements recorded yet.
          </p>
        )}
      </section>
    </KantiraShell>
  );
}
