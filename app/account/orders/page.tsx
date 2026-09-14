import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Package } from "lucide-react";
import { requireCustomerContext } from "@/lib/actions/customer-auth";
import { StorefrontShell } from "@/components/storefront/storefront-shell";
import { cardClass } from "@/lib/ui/form-classes";

// Customer order history. Relies entirely on online_orders_select_self
// (0015) and shipments_select_self (0026) — the same self-scoping every
// other customer-facing read in this codebase uses. No cost_price, no
// accounting data, no internal store/staff information is selected here at
// all (online_orders/online_order_lines simply have no such columns), so
// there is nothing to accidentally leak by widening this query later.
export default async function AccountOrdersPage() {
  const ctx = await requireCustomerContext();
  if (ctx.error) {
    redirect("/dashboard");
  }

  const { supabase } = ctx;

  const { data: orders } = await supabase
    .from("online_orders")
    .select("id, order_number, status, payment_status, grand_total, placed_at")
    .order("placed_at", { ascending: false });

  const orderIds = (orders ?? []).map((o) => o.id);

  const { data: shipments } =
    orderIds.length > 0
      ? await supabase
          .from("shipments")
          .select("online_order_id, status, courier_name, provider_awb")
          .in("online_order_id", orderIds)
      : { data: [] as { online_order_id: string; status: string; courier_name: string | null; provider_awb: string | null }[] };

  const shipmentByOrder = new Map((shipments ?? []).map((s) => [s.online_order_id, s]));

  return (
    <StorefrontShell>
      <div className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-bold text-kantira-navy-900">Your orders</h1>

        {(orders ?? []).length === 0 ? (
          <p className="mt-6 text-sm text-brand-slate">You have not placed any orders yet.</p>
        ) : (
          <ul className="mt-6 space-y-3">
            {(orders ?? []).map((order) => {
              const shipment = shipmentByOrder.get(order.id);
              return (
                <li key={order.id}>
                  <Link
                    href={`/account/orders/${order.id}`}
                    className={`flex items-center justify-between gap-4 ${cardClass} transition hover:border-brand-royal`}
                  >
                    <div className="flex items-center gap-3">
                      <Package size={20} className="text-brand-royal" />
                      <div>
                        <p className="text-sm font-semibold text-kantira-navy-900">
                          {order.order_number}
                        </p>
                        <p className="text-xs text-brand-slate">
                          {new Date(order.placed_at).toLocaleDateString()} &middot; {order.status}
                          {shipment ? ` · ${shipment.status === "DELIVERED" ? "Delivered" : shipment.status === "CREATED" ? "Shipped" : "Preparing shipment"}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-kantira-navy-900">
                      &#8377;{order.grand_total.toFixed(2)}
                      <ChevronRight size={16} className="text-brand-slate" />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </StorefrontShell>
  );
}
