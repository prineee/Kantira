import Link from "next/link";
import { Plus } from "lucide-react";
import { getOrgContext } from "@/lib/data/get-org-id";
import { KantiraShell } from "@/components/kantira-shell";
import { signOut } from "@/app/dashboard/actions";
import { cardClass, primaryButtonClass } from "@/lib/ui/form-classes";

const WRITE_ROLES = ["OWNER", "ADMIN", "STOCK"];

export default async function StockAdjustmentsPage() {
  const { supabase, profile, organization } = await getOrgContext();
  const canWrite = WRITE_ROLES.includes(profile.role);

  const { data: movements } = await supabase
    .from("stock_movements")
    .select(
      "id, direction, movement_type, quantity, reference, transaction_date, stores(store_code), items(sku, name), stock_movement_costs!movement_id(unit_cost, total_cost, adjustment_reason)",
    )
    .in("movement_type", ["ADJUSTMENT_IN", "ADJUSTMENT_OUT", "DAMAGE"])
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false });

  return (
    <KantiraShell orgName={organization?.name ?? "—"} role={profile.role} signOutAction={signOut}>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-kantira-navy-900">Stock adjustments</h2>
          <p className="text-sm text-brand-slate">
            Manual corrections — damage, loss, found stock, and recounts.
          </p>
        </div>
        {canWrite ? (
          <Link href="/stock/adjustments/new" className={primaryButtonClass}>
            <Plus size={16} />
            New adjustment
          </Link>
        ) : null}
      </div>

      <section className={cardClass}>
        {movements && movements.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-kantira-navy-100 text-xs uppercase tracking-wide text-brand-slate">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Store</th>
                  <th className="py-2 pr-4">Item</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Reason</th>
                  <th className="py-2 pr-4 text-right">Qty</th>
                  <th className="py-2 pr-4 text-right">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-kantira-navy-50">
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td className="py-2.5 pr-4 text-brand-slate">{m.transaction_date}</td>
                    <td className="py-2.5 pr-4 text-brand-slate">{m.stores?.store_code ?? "—"}</td>
                    <td className="py-2.5 pr-4 text-kantira-navy-800">
                      {m.items?.sku} — {m.items?.name}
                    </td>
                    <td className="py-2.5 pr-4 text-kantira-navy-800">{m.movement_type}</td>
                    <td className="py-2.5 pr-4 text-brand-slate">
                      {m.stock_movement_costs?.adjustment_reason ?? "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-right">
                      {m.direction === "OUT" ? "-" : "+"}
                      {m.quantity}
                    </td>
                    <td className="py-2.5 pr-4 text-right">
                      {(m.stock_movement_costs?.total_cost ?? 0).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-brand-slate">No stock adjustments yet.</p>
        )}
      </section>
    </KantiraShell>
  );
}
