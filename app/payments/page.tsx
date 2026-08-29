import Link from "next/link";
import { Plus } from "lucide-react";
import { getOrgContext } from "@/lib/data/get-org-id";
import { KantiraShell } from "@/components/kantira-shell";
import { signOut } from "@/app/dashboard/actions";
import { CancelActionButton } from "@/components/cancel-action-button";
import { cancelPayment } from "./actions";
import {
  cardClass,
  primaryButtonClass,
  badgePostedClass,
  badgeCancelledClass,
} from "@/lib/ui/form-classes";

const WRITE_ROLES = ["OWNER", "ADMIN", "STOCK", "ACCOUNTANT"];
const CANCEL_ROLES = ["OWNER", "ADMIN", "ACCOUNTANT"];

export default async function PaymentsPage() {
  const { supabase, profile, organization } = await getOrgContext();
  const canWrite = WRITE_ROLES.includes(profile.role);
  const canCancel = CANCEL_ROLES.includes(profile.role);

  const { data: payments } = await supabase
    .from("supplier_payments")
    .select(
      "id, payment_number, payment_date, amount, payment_method, status, suppliers(name)",
    )
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false });

  return (
    <KantiraShell orgName={organization?.name ?? "—"} role={profile.role} signOutAction={signOut}>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-kantira-navy-900">Supplier payments</h2>
          <p className="text-sm text-brand-slate">Payments made against supplier invoices.</p>
        </div>
        {canWrite ? (
          <Link href="/payments/new" className={primaryButtonClass}>
            <Plus size={16} />
            New payment
          </Link>
        ) : null}
      </div>

      <section className={cardClass}>
        {payments && payments.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-kantira-navy-100 text-xs uppercase tracking-wide text-brand-slate">
                  <th className="py-2 pr-4">Payment #</th>
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Supplier</th>
                  <th className="py-2 pr-4">Method</th>
                  <th className="py-2 pr-4 text-right">Amount</th>
                  <th className="py-2 pr-4">Status</th>
                  {canCancel ? <th className="py-2 pr-4" /> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-kantira-navy-50">
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2.5 pr-4 font-mono text-xs text-kantira-navy-700">
                      {p.payment_number}
                    </td>
                    <td className="py-2.5 pr-4 text-brand-slate">{p.payment_date}</td>
                    <td className="py-2.5 pr-4 text-kantira-navy-800">{p.suppliers?.name ?? "—"}</td>
                    <td className="py-2.5 pr-4 text-brand-slate">{p.payment_method}</td>
                    <td className="py-2.5 pr-4 text-right text-kantira-navy-700">
                      {p.amount.toFixed(2)}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className={p.status === "POSTED" ? badgePostedClass : badgeCancelledClass}>
                        {p.status}
                      </span>
                    </td>
                    {canCancel ? (
                      <td className="py-2.5 pr-4">
                        {p.status === "POSTED" ? (
                          <CancelActionButton id={p.id} action={cancelPayment} />
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-brand-slate">No payments yet.</p>
        )}
      </section>
    </KantiraShell>
  );
}
