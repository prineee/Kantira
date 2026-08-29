import Link from "next/link";
import { Plus } from "lucide-react";
import { getOrgContext } from "@/lib/data/get-org-id";
import { KantiraShell } from "@/components/kantira-shell";
import { signOut } from "@/app/dashboard/actions";
import {
  cardClass,
  badgeDraftClass,
  badgePostedClass,
  badgeCancelledClass,
  primaryButtonClass,
} from "@/lib/ui/form-classes";

const WRITE_ROLES = ["OWNER", "ADMIN", "STOCK"];

function statusBadgeClass(status: string) {
  if (status === "POSTED") return badgePostedClass;
  if (status === "CANCELLED") return badgeCancelledClass;
  return badgeDraftClass;
}

export default async function PurchasesPage() {
  const { supabase, profile, organization } = await getOrgContext();
  const canWrite = WRITE_ROLES.includes(profile.role);

  const { data: purchases } = await supabase
    .from("purchases")
    .select(
      "id, document_number, document_date, total_amount, status, stores(store_code), suppliers(name)",
    )
    .order("document_date", { ascending: false })
    .order("created_at", { ascending: false });

  return (
    <KantiraShell orgName={organization?.name ?? "—"} role={profile.role} signOutAction={signOut}>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-kantira-navy-900">Purchases</h2>
          <p className="text-sm text-brand-slate">
            Goods received from suppliers, posted into inventory and accounts payable.
          </p>
        </div>
        {canWrite ? (
          <Link href="/purchases/new" className={primaryButtonClass}>
            <Plus size={16} />
            New purchase
          </Link>
        ) : null}
      </div>

      <section className={cardClass}>
        {purchases && purchases.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-kantira-navy-100 text-xs uppercase tracking-wide text-brand-slate">
                  <th className="py-2 pr-4">Document #</th>
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Store</th>
                  <th className="py-2 pr-4">Supplier</th>
                  <th className="py-2 pr-4 text-right">Total</th>
                  <th className="py-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-kantira-navy-50">
                {purchases.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2.5 pr-4 font-mono text-xs text-kantira-navy-700">
                      <Link href={`/purchases/${p.id}`} className="text-brand-royal">
                        {p.document_number}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-4 text-brand-slate">{p.document_date}</td>
                    <td className="py-2.5 pr-4 text-brand-slate">{p.stores?.store_code ?? "—"}</td>
                    <td className="py-2.5 pr-4 text-brand-slate">{p.suppliers?.name ?? "—"}</td>
                    <td className="py-2.5 pr-4 text-right text-kantira-navy-700">
                      {p.total_amount.toFixed(2)}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className={statusBadgeClass(p.status)}>{p.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-brand-slate">No purchases yet.</p>
        )}
      </section>
    </KantiraShell>
  );
}
