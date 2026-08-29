import Link from "next/link";
import { Plus } from "lucide-react";
import { getOrgContext } from "@/lib/data/get-org-id";
import { KantiraShell } from "@/components/kantira-shell";
import { signOut } from "@/app/dashboard/actions";
import { cardClass, primaryButtonClass } from "@/lib/ui/form-classes";

const WRITE_ROLES = ["OWNER", "ADMIN", "STOCK"];

export default async function StockTransfersPage() {
  const { supabase, profile, organization } = await getOrgContext();
  const canWrite = WRITE_ROLES.includes(profile.role);

  const { data: movements } = await supabase
    .from("stock_movements")
    .select(
      "id, direction, quantity, reference, transaction_date, transfer_group_id, stores(store_code), items(sku, name)",
    )
    .in("movement_type", ["TRANSFER_OUT", "TRANSFER_IN"])
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false });

  return (
    <KantiraShell orgName={organization?.name ?? "—"} role={profile.role} signOutAction={signOut}>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-kantira-navy-900">Stock transfers</h2>
          <p className="text-sm text-brand-slate">
            Movements between stores. Each transfer posts one OUT and one IN row.
          </p>
        </div>
        {canWrite ? (
          <Link href="/stock/transfers/new" className={primaryButtonClass}>
            <Plus size={16} />
            New transfer
          </Link>
        ) : null}
      </div>

      <section className={cardClass}>
        {movements && movements.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-kantira-navy-100 text-xs uppercase tracking-wide text-brand-slate">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Store</th>
                  <th className="py-2 pr-4">Direction</th>
                  <th className="py-2 pr-4">Item</th>
                  <th className="py-2 pr-4 text-right">Qty</th>
                  <th className="py-2 pr-4">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-kantira-navy-50">
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td className="py-2.5 pr-4 text-brand-slate">{m.transaction_date}</td>
                    <td className="py-2.5 pr-4 text-brand-slate">{m.stores?.store_code ?? "—"}</td>
                    <td className="py-2.5 pr-4 text-kantira-navy-800">
                      {m.direction === "IN" ? "Received" : "Sent"}
                    </td>
                    <td className="py-2.5 pr-4 text-kantira-navy-800">
                      {m.items?.sku} — {m.items?.name}
                    </td>
                    <td className="py-2.5 pr-4 text-right">{m.quantity}</td>
                    <td className="py-2.5 pr-4 text-brand-slate">{m.reference ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-brand-slate">No stock transfers yet.</p>
        )}
      </section>
    </KantiraShell>
  );
}
