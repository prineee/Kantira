import Link from "next/link";
import { getOrgContext } from "@/lib/data/get-org-id";
import { KantiraShell } from "@/components/kantira-shell";
import { signOut } from "@/app/dashboard/actions";
import {
  cardClass,
  badgeDraftClass,
  badgePostedClass,
  badgeCancelledClass,
} from "@/lib/ui/form-classes";

function statusBadgeClass(status: string) {
  if (status === "POSTED") return badgePostedClass;
  if (status === "CANCELLED") return badgeCancelledClass;
  return badgeDraftClass;
}

export default async function PurchaseReturnsPage() {
  const { supabase, profile, organization } = await getOrgContext();

  const { data: returns } = await supabase
    .from("purchase_returns")
    .select(
      "id, return_number, return_date, total_amount, status, stores(store_code), suppliers(name), purchases(document_number)",
    )
    .order("return_date", { ascending: false })
    .order("created_at", { ascending: false });

  return (
    <KantiraShell orgName={organization?.name ?? "—"} role={profile.role} signOutAction={signOut}>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-kantira-navy-900">Purchase returns</h2>
        <p className="text-sm text-brand-slate">
          Goods sent back to suppliers. Created from a posted purchase's detail page.
        </p>
      </div>

      <section className={cardClass}>
        {returns && returns.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-kantira-navy-100 text-xs uppercase tracking-wide text-brand-slate">
                  <th className="py-2 pr-4">Return #</th>
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Store</th>
                  <th className="py-2 pr-4">Supplier</th>
                  <th className="py-2 pr-4">Original purchase</th>
                  <th className="py-2 pr-4 text-right">Total</th>
                  <th className="py-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-kantira-navy-50">
                {returns.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2.5 pr-4 font-mono text-xs text-kantira-navy-700">
                      <Link href={`/purchase-returns/${r.id}`} className="text-brand-royal">
                        {r.return_number}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-4 text-brand-slate">{r.return_date}</td>
                    <td className="py-2.5 pr-4 text-brand-slate">{r.stores?.store_code ?? "—"}</td>
                    <td className="py-2.5 pr-4 text-brand-slate">{r.suppliers?.name ?? "—"}</td>
                    <td className="py-2.5 pr-4 text-brand-slate">
                      {r.purchases?.document_number ?? "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-right text-kantira-navy-700">
                      {r.total_amount.toFixed(2)}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className={statusBadgeClass(r.status)}>{r.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-brand-slate">No purchase returns yet.</p>
        )}
      </section>
    </KantiraShell>
  );
}
