import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/data/get-org-id";
import { KantiraShell } from "@/components/kantira-shell";
import { signOut } from "@/app/dashboard/actions";
import { DocumentStatusActions } from "@/components/document-status-actions";
import { postSale, cancelSale } from "../actions";
import {
  cardClass,
  badgeDraftClass,
  badgePostedClass,
  badgeCancelledClass,
} from "@/lib/ui/form-classes";

const WRITE_ROLES = ["OWNER", "ADMIN", "SALES"];

function statusBadgeClass(status: string) {
  if (status === "POSTED") return badgePostedClass;
  if (status === "CANCELLED") return badgeCancelledClass;
  return badgeDraftClass;
}

export default async function SaleDetailPage({ params }: { params: { id: string } }) {
  const { supabase, profile, organization } = await getOrgContext();
  const canWrite = WRITE_ROLES.includes(profile.role);

  const { data: sale } = await supabase
    .from("sales")
    .select(
      "id, invoice_number, invoice_date, notes, status, payment_method, amount_paid, customer_name, subtotal, discount_amount, tax_amount, total_amount, cancellation_reason, stores(store_code, store_name), customers(customer_code, name)",
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!sale) notFound();

  const { data: lines } = await supabase
    .from("sale_lines")
    .select(
      "id, line_no, quantity, selling_rate, discount_amount, tax_amount, line_total, items(sku, name), units_of_measurement(code)",
    )
    .eq("sale_id", sale.id)
    .order("line_no");

  return (
    <KantiraShell orgName={organization?.name ?? "—"} role={profile.role} signOutAction={signOut}>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-kantira-navy-900">Sale {sale.invoice_number}</h2>
          <p className="text-sm text-brand-slate">
            {sale.stores?.store_code} — {sale.customers?.name ?? sale.customer_name ?? "Walk-in"}
          </p>
        </div>
        <span className={statusBadgeClass(sale.status)}>{sale.status}</span>
      </div>

      <section className={`${cardClass} mb-6`}>
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-brand-slate">Invoice date</dt>
            <dd className="font-medium text-kantira-navy-900">{sale.invoice_date}</dd>
          </div>
          <div>
            <dt className="text-brand-slate">Payment method</dt>
            <dd className="font-medium text-kantira-navy-900">{sale.payment_method}</dd>
          </div>
          <div>
            <dt className="text-brand-slate">Amount paid</dt>
            <dd className="font-medium text-kantira-navy-900">{sale.amount_paid.toFixed(2)}</dd>
          </div>
          <div>
            <dt className="text-brand-slate">Store</dt>
            <dd className="font-medium text-kantira-navy-900">
              {sale.stores?.store_code} — {sale.stores?.store_name}
            </dd>
          </div>
        </dl>
        {sale.notes ? <p className="mt-4 text-sm text-brand-slate">Notes: {sale.notes}</p> : null}
        {sale.status === "CANCELLED" && sale.cancellation_reason ? (
          <p className="mt-4 text-sm text-red-600">
            Cancellation reason: {sale.cancellation_reason}
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
                <th className="py-2 pr-4 text-right">Discount</th>
                <th className="py-2 pr-4 text-right">Tax</th>
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
                  <td className="py-2.5 pr-4 text-right">{l.selling_rate.toFixed(4)}</td>
                  <td className="py-2.5 pr-4 text-right">{l.discount_amount.toFixed(2)}</td>
                  <td className="py-2.5 pr-4 text-right">{l.tax_amount.toFixed(2)}</td>
                  <td className="py-2.5 pr-4 text-right font-medium text-kantira-navy-900">
                    {(l.line_total ?? 0).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 ml-auto max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-brand-slate">Subtotal</span>
            <span>{sale.subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-brand-slate">Discount</span>
            <span>-{sale.discount_amount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-brand-slate">Tax</span>
            <span>+{sale.tax_amount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between border-t border-kantira-navy-100 pt-1 font-semibold text-kantira-navy-900">
            <span>Total</span>
            <span>{sale.total_amount.toFixed(2)}</span>
          </div>
        </div>
      </section>

      {canWrite && sale.status === "DRAFT" ? (
        <section className={`${cardClass} mb-6`}>
          <DocumentStatusActions
            documentId={sale.id}
            postAction={postSale}
            cancelAction={cancelSale}
          />
        </section>
      ) : null}

      {sale.status === "POSTED" ? (
        <Link
          href={`/sales-returns/new?sale=${sale.id}`}
          className="text-sm font-medium text-brand-royal"
        >
          Create return →
        </Link>
      ) : null}
    </KantiraShell>
  );
}
