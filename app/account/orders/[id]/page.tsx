import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireCustomerContext } from "@/lib/actions/customer-auth";
import { isValidUuid } from "@/lib/data/storefront-catalog";
import { StorefrontShell } from "@/components/storefront/storefront-shell";
import { cardClass } from "@/lib/ui/form-classes";

const SHIPMENT_LABEL: Record<string, string> = {
  PENDING: "Preparing shipment",
  ATTEMPTED: "Preparing shipment",
  CREATED: "Shipped",
  FAILED: "Preparing shipment",
  DELIVERED: "Delivered",
};

// Order detail. Same self-scoping as the list page (online_orders_select_self,
// shipments_select_self) — a customer requesting another customer's order id
// simply gets no row back (RLS, not a UI check), so this redirects exactly
// as if the order didn't exist. Only ever selects columns already proven
// customer-safe elsewhere in this codebase (checkout confirmation page uses
// the identical online_order_lines column set).
export default async function AccountOrderDetailPage({ params }: { params: { id: string } }) {
  const ctx = await requireCustomerContext();
  if (ctx.error) {
    redirect("/dashboard");
  }

  if (!isValidUuid(params.id)) {
    redirect("/account/orders");
  }

  const { supabase } = ctx;

  const { data: order } = await supabase
    .from("online_orders")
    .select(
      "id, order_number, status, payment_status, subtotal, tax_total, shipping_total, grand_total, placed_at, shipping_address_id",
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!order) {
    redirect("/account/orders");
  }

  const { data: lines } = await supabase
    .from("online_order_lines")
    .select("id, item_name_snapshot, quantity, unit_price, line_total")
    .eq("order_id", order.id);

  const { data: shipment } = await supabase
    .from("shipments")
    .select("status, courier_name, provider_awb, shipped_at, delivered_at, last_tracking_status")
    .eq("online_order_id", order.id)
    .maybeSingle();

  const { data: address } = await supabase
    .from("customer_addresses")
    .select("city, state")
    .eq("id", order.shipping_address_id)
    .maybeSingle();

  return (
    <StorefrontShell>
      <div className="mx-auto max-w-2xl px-6 py-12">
        <Link
          href="/account/orders"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-brand-royal"
        >
          <ArrowLeft size={16} />
          Back to your orders
        </Link>

        <h1 className="text-2xl font-bold text-kantira-navy-900">{order.order_number}</h1>
        <p className="mt-1 text-sm text-brand-slate">
          Placed {new Date(order.placed_at).toLocaleDateString()} &middot; {order.status} &middot;{" "}
          {order.payment_status === "PAID" ? "Payment received" : order.payment_status === "PENDING" ? "Pay on delivery" : order.payment_status}
        </p>
        {address ? (
          <p className="text-sm text-brand-slate">
            Shipping to {address.city}, {address.state}
          </p>
        ) : null}

        <section className={`${cardClass} mt-6`}>
          <h2 className="mb-2 text-sm font-semibold text-kantira-navy-900">Shipment</h2>
          {shipment ? (
            <div className="text-sm text-brand-slate">
              <p>{SHIPMENT_LABEL[shipment.status] ?? shipment.status}</p>
              {shipment.courier_name ? <p>Courier: {shipment.courier_name}</p> : null}
              {shipment.provider_awb ? (
                <p>
                  Tracking number: {shipment.provider_awb}
                  {/* Shiprocket's public tracking page convention — best-effort
                      external link, not a KANTIRA-verified tracking API. */}
                  {" "}
                  <a
                    href={`https://shiprocket.co/tracking/${encodeURIComponent(shipment.provider_awb)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-royal underline"
                  >
                    Track package
                  </a>
                </p>
              ) : null}
              {shipment.last_tracking_status ? <p>Latest update: {shipment.last_tracking_status}</p> : null}
              {shipment.delivered_at ? (
                <p>Delivered {new Date(shipment.delivered_at).toLocaleDateString()}</p>
              ) : shipment.shipped_at ? (
                <p>Shipped {new Date(shipment.shipped_at).toLocaleDateString()}</p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-brand-slate">Not yet shipped.</p>
          )}
        </section>

        <section className={`${cardClass} mt-6`}>
          <ul className="divide-y divide-kantira-navy-100">
            {(lines ?? []).map((line) => (
              <li key={line.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <p className="font-medium text-kantira-navy-900">{line.item_name_snapshot}</p>
                  <p className="text-brand-slate">
                    Qty {line.quantity} &times; &#8377;{line.unit_price.toFixed(2)}
                  </p>
                </div>
                <p className="font-semibold text-kantira-navy-900">
                  &#8377;{line.line_total.toFixed(2)}
                </p>
              </li>
            ))}
          </ul>
          <div className="mt-4 space-y-1 border-t border-kantira-navy-100 pt-4 text-sm text-brand-slate">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>&#8377;{order.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Tax</span>
              <span>&#8377;{order.tax_total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Shipping</span>
              <span>&#8377;{order.shipping_total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-kantira-navy-900">
              <span>Total</span>
              <span>&#8377;{order.grand_total.toFixed(2)}</span>
            </div>
          </div>
        </section>
      </div>
    </StorefrontShell>
  );
}
