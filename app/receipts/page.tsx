import Link from "next/link";
import { Plus } from "lucide-react";
import { getOrgContext } from "@/lib/data/get-org-id";
import { KantiraShell } from "@/components/kantira-shell";
import { signOut } from "@/app/dashboard/actions";
import { CancelActionButton } from "@/components/cancel-action-button";
import { cancelReceipt } from "./actions";
import {
  cardClass,
  primaryButtonClass,
  badgePostedClass,
  badgeCancelledClass,
} from "@/lib/ui/form-classes";

const WRITE_ROLES = ["OWNER", "ADMIN", "SALES", "ACCOUNTANT"];
const CANCEL_ROLES = ["OWNER", "ADMIN", "ACCOUNTANT"];

export default async function ReceiptsPage() {
  const { supabase, profile, organization } = await getOrgContext();
  const canWrite = WRITE_ROLES.includes(profile.role);
  const canCancel = CANCEL_ROLES.includes(profile.role);

  const { data: receipts } = await supabase
    .from("customer_receipts")
    .select(
      "id, receipt_number, receipt_date, amount, payment_method, status, customers(name)",
    )
    .order("receipt_date", { ascending: false })
    .order("created_at", { ascending: false });

  return (
    <KantiraShell orgName={organization?.name ?? "—"} role={profile.role} signOutAction={signOut}>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-kantira-navy-900">Customer receipts</h2>
          <p className="text-sm text-brand-slate">Payments received against customer invoices.</p>
        </div>
        {canWrite ? (
          <Link href="/receipts/new" className={primaryButtonClass}>
            <Plus size={16} />
            New receipt
          </Link>
        ) : null}
      </div>

      <section className={cardClass}>
        {receipts && receipts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-kantira-navy-100 text-xs uppercase tracking-wide text-brand-slate">
                  <th className="py-2 pr-4">Receipt #</th>
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Customer</th>
                  <th className="py-2 pr-4">Method</th>
                  <th className="py-2 pr-4 text-right">Amount</th>
                  <th className="py-2 pr-4">Status</th>
                  {canCancel ? <th className="py-2 pr-4" /> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-kantira-navy-50">
                {receipts.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2.5 pr-4 font-mono text-xs text-kantira-navy-700">
                      {r.receipt_number}
                    </td>
                    <td className="py-2.5 pr-4 text-brand-slate">{r.receipt_date}</td>
                    <td className="py-2.5 pr-4 text-kantira-navy-800">{r.customers?.name ?? "—"}</td>
                    <td className="py-2.5 pr-4 text-brand-slate">{r.payment_method}</td>
                    <td className="py-2.5 pr-4 text-right text-kantira-navy-700">
                      {r.amount.toFixed(2)}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className={r.status === "POSTED" ? badgePostedClass : badgeCancelledClass}>
                        {r.status}
                      </span>
                    </td>
                    {canCancel ? (
                      <td className="py-2.5 pr-4">
                        {r.status === "POSTED" ? (
                          <CancelActionButton id={r.id} action={cancelReceipt} />
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-brand-slate">No receipts yet.</p>
        )}
      </section>
    </KantiraShell>
  );
}
