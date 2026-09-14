import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/data/get-org-id";
import { KantiraShell } from "@/components/kantira-shell";
import { signOut } from "@/app/dashboard/actions";
import { cardClass, badgeActiveClass, badgeWarningClass, badgeInactiveClass } from "@/lib/ui/form-classes";
import { OrderActions } from "../order-actions";

function statusBadgeClass(status: string) {
  if (status === "CANCELLED" || status === "RETURNED") return badgeInactiveClass;
  if (status === "DELIVERED") return badgeActiveClass;
  if (status === "PENDING") return badgeWarningClass;
  return badgeActiveClass;
}

export default async function OrderDetailPage({ params }: { params: { id: string } }) {
  const { supabase, profile, organization } = await getOrgContext();

  const { data: order } = await supabase
    .from("online_orders")
    .select(
      "id, order_number, status, payment_status, subtotal, tax_total, shipping_total, grand_total, placed_at, fulfillment_store_id, customers(name), stores(store_code, store_name)",
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!order) notFound();

  const { data: lines } = await supabase
    .from("online_order_lines")
    .select("id, item_name_snapshot, quantity, unit_price, line_total")
    .eq("order_id", order.id);

  const { data: shipment } = await supabase
    .from("shipments")
    .select(
      "id, status, provider, provider_shipment_id, provider_awb, courier_name, last_error, shipped_at, delivered_at, attempt_count, last_tracking_status",
    )
    .eq("online_order_id", order.id)
    .maybeSingle();

  const needsStorePicker = order.status === "CONFIRMED" && !order.fulfillment_store_id;
  const { data: stores } = needsStorePicker
    ? await supabase
        .from("stores")
        .select("id, store_code, store_name")
        .eq("is_active", true)
        .order("store_code")
    : { data: [] as { id: string; store_code: string; store_name: string }[] };

  return (
    <KantiraShell orgName={organization?.name ?? "—"} role={profile.role} signOutAction={signOut}>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-kantira-navy-900">{order.order_number}</h2>
          <p className="text-sm text-brand-slate">
            {order.customers?.name ?? "—"} &middot;{" "}
            {new Date(order.placed_at).toLocaleString()}
          </p>
        </div>
        <span className={statusBadgeClass(order.status)}>{order.status}</span>
      </div>

      <section className={`${cardClass} mb-6`}>
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-brand-slate">Payment</dt>
            <dd className="font-medium text-kantira-navy-900">{order.payment_status}</dd>
          </div>
          <div>
            <dt className="text-brand-slate">Fulfillment store</dt>
            <dd className="font-medium text-kantira-navy-900">
              {order.stores ? `${order.stores.store_code} — ${order.stores.store_name}` : "Not assigned"}
            </dd>
          </div>
          <div>
            <dt className="text-brand-slate">Total</dt>
            <dd className="font-medium text-kantira-navy-900">&#8377;{order.grand_total.toFixed(2)}</dd>
          </div>
        </dl>
      </section>

      <section className={`${cardClass} mb-6`}>
        <h3 className="mb-4 text-base font-semibold text-kantira-navy-900">Line items</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-kantira-navy-100 text-xs uppercase tracking-wide text-brand-slate">
                <th className="py-2 pr-4">Item</th>
                <th className="py-2 pr-4 text-right">Qty</th>
                <th className="py-2 pr-4 text-right">Rate</th>
                <th className="py-2 pr-4 text-right">Line total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-kantira-navy-50">
              {(lines ?? []).map((l) => (
                <tr key={l.id}>
                  <td className="py-2.5 pr-4 text-kantira-navy-800">{l.item_name_snapshot}</td>
                  <td className="py-2.5 pr-4 text-right">{l.quantity}</td>
                  <td className="py-2.5 pr-4 text-right">{l.unit_price.toFixed(2)}</td>
                  <td className="py-2.5 pr-4 text-right font-medium text-kantira-navy-900">
                    {l.line_total.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 ml-auto max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-brand-slate">Subtotal</span>
            <span>{order.subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-brand-slate">Tax</span>
            <span>{order.tax_total.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-brand-slate">Shipping</span>
            <span>{order.shipping_total.toFixed(2)}</span>
          </div>
          <div className="flex justify-between border-t border-kantira-navy-100 pt-1 font-semibold text-kantira-navy-900">
            <span>Total</span>
            <span>{order.grand_total.toFixed(2)}</span>
          </div>
        </div>
      </section>

      {shipment ? (
        <section className={`${cardClass} mb-6`}>
          <h3 className="mb-2 text-base font-semibold text-kantira-navy-900">Shipment</h3>
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-brand-slate">Status</dt>
              <dd className="font-medium text-kantira-navy-900">{shipment.status}</dd>
            </div>
            {shipment.courier_name ? (
              <div>
                <dt className="text-brand-slate">Courier</dt>
                <dd className="font-medium text-kantira-navy-900">{shipment.courier_name}</dd>
              </div>
            ) : null}
            {shipment.provider_awb ? (
              <div>
                <dt className="text-brand-slate">AWB</dt>
                <dd className="font-medium text-kantira-navy-900">{shipment.provider_awb}</dd>
              </div>
            ) : null}
            {shipment.delivered_at ? (
              <div>
                <dt className="text-brand-slate">Delivered</dt>
                <dd className="font-medium text-kantira-navy-900">
                  {new Date(shipment.delivered_at).toLocaleDateString()}
                </dd>
              </div>
            ) : null}
            {shipment.last_tracking_status ? (
              <div>
                <dt className="text-brand-slate">Latest tracking update</dt>
                <dd className="font-medium text-kantira-navy-900">{shipment.last_tracking_status}</dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}

      <section className={cardClass}>
        <h3 className="mb-4 text-base font-semibold text-kantira-navy-900">Actions</h3>
        <OrderActions
          orderId={order.id}
          orderNumber={order.order_number}
          status={order.status}
          hasStore={Boolean(order.fulfillment_store_id)}
          shipment={shipment ?? null}
          stores={stores ?? []}
        />
      </section>
    </KantiraShell>
  );
}
