import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/data/get-org-id";
import { KantiraShell } from "@/components/kantira-shell";
import { signOut } from "@/app/dashboard/actions";
import { DocumentStatusActions } from "@/components/document-status-actions";
import { postPurchaseReturn, cancelPurchaseReturn } from "../actions";
import {
  cardClass,
  badgeDraftClass,
  badgePostedClass,
  badgeCancelledClass,
} from "@/lib/ui/form-classes";

const WRITE_ROLES = ["OWNER", "ADMIN", "STOCK"];

function statusBadgeClass(status: string) {
  if (status === "POSTED") return badgePostedClass;
  if (status === "CANCELLED") return badgeCancelledClass;
  return badgeDraftClass;
}

export default async function PurchaseReturnDetailPage({ params }: { params: { id: string } }) {
  const { supabase, profile, organization } = await getOrgContext();
  const canWrite = WRITE_ROLES.includes(profile.role);

  const { data: purchaseReturn } = await supabase
    .from("purchase_returns")
    .select(
      "id, return_number, return_date, notes, status, subtotal, discount_amount, tax_amount, total_amount, cancellation_reason, stores(store_code, store_name), suppliers(supplier_code, name), purchases(document_number)",
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!purchaseReturn) notFound();

  const { data: lines } = await supabase
    .from("purchase_return_lines")
    .select(
      "id, line_no, quantity, purchase_rate, discount_amount, tax_amount, line_total, items(sku, name), units_of_measurement(code)",
    )
    .eq("purchase_return_id", purchaseReturn.id)
    .order("line_no");

  return (
    <KantiraShell orgName={organization?.name ?? "—"} role={profile.role} signOutAction={signOut}>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-kantira-navy-900">
            Purchase return {purchaseReturn.return_number}
          </h2>
          <p className="text-sm text-brand-slate">
            Against purchase {purchaseReturn.purchases?.document_number} —{" "}
            {purchaseReturn.stores?.store_code} — {purchaseReturn.suppliers?.name}
          </p>
        </div>
        <span className={statusBadgeClass(purchaseReturn.status)}>{purchaseReturn.status}</span>
      </div>

      <section className={`${cardClass} mb-6`}>
        {purchaseReturn.notes ? (
          <p className="text-sm text-brand-slate">Notes: {purchaseReturn.notes}</p>
        ) : null}
        {purchaseReturn.status === "CANCELLED" && purchaseReturn.cancellation_reason ? (
          <p className="mt-2 text-sm text-red-600">
            Cancellation reason: {purchaseReturn.cancellation_reason}
          </p>
        ) : null}
      </section>

      <section className={`${cardClass} mb-6`}>
        <h3 className="mb-4 text-base font-semibold text-kantira-navy-900">Line items</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-kantira-navy-100 text-xs uppercase tracking-wide text-brand-slate">
                <th className="py-2 pr-4">Item</th>
                <th className="py-2 pr-4">UOM</th>
                <th className="py-2 pr-4 text-right">Qty</th>
                <th className="py-2 pr-4 text-right">Rate</th>
                <th className="py-2 pr-4 text-right">Line total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-kantira-navy-50">
              {(lines ?? []).map((l) => (
                <tr key={l.id}>
                  <td className="py-2.5 pr-4 text-kantira-navy-800">
                    {l.items?.sku} — {l.items?.name}
                  </td>
                  <td className="py-2.5 pr-4 text-brand-slate">
                    {l.units_of_measurement?.code}
                  </td>
                  <td className="py-2.5 pr-4 text-right">{l.quantity}</td>
                  <td className="py-2.5 pr-4 text-right">{l.purchase_rate.toFixed(4)}</td>
                  <td className="py-2.5 pr-4 text-right font-medium text-kantira-navy-900">
                    {(l.line_total ?? 0).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 ml-auto max-w-xs space-y-1 text-sm">
          <div className="flex justify-between font-semibold text-kantira-navy-900">
            <span>Total</span>
            <span>{purchaseReturn.total_amount.toFixed(2)}</span>
          </div>
        </div>
      </section>

      {canWrite && purchaseReturn.status === "DRAFT" ? (
        <section className={cardClass}>
          <DocumentStatusActions
            documentId={purchaseReturn.id}
            postAction={postPurchaseReturn}
            cancelAction={cancelPurchaseReturn}
          />
        </section>
      ) : null}
    </KantiraShell>
  );
}
