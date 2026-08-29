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

const WRITE_ROLES = ["OWNER", "ADMIN", "SALES"];

function statusBadgeClass(status: string) {
  if (status === "POSTED") return badgePostedClass;
  if (status === "CANCELLED") return badgeCancelledClass;
  return badgeDraftClass;
}

export default async function SalesPage() {
  const { supabase, profile, organization } = await getOrgContext();
  const canWrite = WRITE_ROLES.includes(profile.role);

  const { data: sales } = await supabase
    .from("sales")
    .select(
      "id, invoice_number, invoice_date, total_amount, status, payment_method, customer_name, stores(store_code), customers(name)",
    )
    .order("invoice_date", { ascending: false })
    .order("created_at", { ascending: false });

  return (
    <KantiraShell orgName={organization?.name ?? "—"} role={profile.role} signOutAction={signOut}>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-kantira-navy-900">Sales</h2>
          <p className="text-sm text-brand-slate">
            Invoices posted into revenue, COGS, and accounts receivable.
          </p>
        </div>
        {canWrite ? (
          <Link href="/sales/new" className={primaryButtonClass}>
            <Plus size={16} />
            New sale
          </Link>
        ) : null}
      </div>

      <section className={cardClass}>
        {sales && sales.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-kantira-navy-100 text-xs uppercase tracking-wide text-brand-slate">
                  <th className="py-2 pr-4">Invoice #</th>
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Store</th>
                  <th className="py-2 pr-4">Customer</th>
                  <th className="py-2 pr-4">Payment</th>
                  <th className="py-2 pr-4 text-right">Total</th>
                  <th className="py-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-kantira-navy-50">
                {sales.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2.5 pr-4 font-mono text-xs text-kantira-navy-700">
                      <Link href={`/sales/${s.id}`} className="text-brand-royal">
                        {s.invoice_number}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-4 text-brand-slate">{s.invoice_date}</td>
                    <td className="py-2.5 pr-4 text-brand-slate">{s.stores?.store_code ?? "—"}</td>
                    <td className="py-2.5 pr-4 text-brand-slate">
                      {s.customers?.name ?? s.customer_name ?? "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-brand-slate">{s.payment_method}</td>
                    <td className="py-2.5 pr-4 text-right text-kantira-navy-700">
                      {s.total_amount.toFixed(2)}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className={statusBadgeClass(s.status)}>{s.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-brand-slate">No sales yet.</p>
        )}
      </section>
    </KantiraShell>
  );
}
