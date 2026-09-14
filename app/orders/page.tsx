import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { getOrgContext } from "@/lib/data/get-org-id";
import { KantiraShell } from "@/components/kantira-shell";
import { signOut } from "@/app/dashboard/actions";
import {
  cardClass,
  badgeActiveClass,
  badgeWarningClass,
  badgeInactiveClass,
} from "@/lib/ui/form-classes";
import { StalledOrderRow } from "./stalled-order-row";

const WRITE_ROLES = ["OWNER", "ADMIN"];

function statusBadgeClass(status: string) {
  if (status === "CANCELLED" || status === "RETURNED") return badgeInactiveClass;
  if (status === "DELIVERED") return badgeActiveClass;
  if (status === "PENDING") return badgeWarningClass;
  return badgeActiveClass;
}

export default async function OrdersPage() {
  const { supabase, profile, organization } = await getOrgContext();
  const canResolveStalled = WRITE_ROLES.includes(profile.role);

  const { data: orders } = await supabase
    .from("online_orders")
    .select(
      "id, order_number, status, payment_status, grand_total, placed_at, customers(name), stores(store_code)",
    )
    .order("placed_at", { ascending: false })
    .limit(200);

  const { data: stalledRaw } = canResolveStalled
    ? await supabase
        .from("stalled_fulfillment_orders")
        .select("order_id, order_number, customer_id, grand_total")
        .order("placed_at", { ascending: false })
    : { data: [] };

  // The view's columns come back nullable to the type generator (it can't
  // see through to the base table's not-null constraints) — every row
  // actually populated here always has all four, since online_orders.id/
  // order_number/customer_id/grand_total are all not-null in the base
  // table this view selects from.
  const stalled = (stalledRaw ?? []).filter(
    (s): s is { order_id: string; order_number: string; customer_id: string; grand_total: number } =>
      s.order_id !== null && s.order_number !== null && s.customer_id !== null && s.grand_total !== null,
  );

  const stalledCustomerIds = stalled.map((s) => s.customer_id);
  const { data: stalledCustomers } =
    stalledCustomerIds.length > 0
      ? await supabase.from("customers").select("id, name").in("id", stalledCustomerIds)
      : { data: [] as { id: string; name: string }[] };
  const customerNameById = new Map((stalledCustomers ?? []).map((c) => [c.id, c.name]));

  const { data: stores } =
    stalled.length > 0
      ? await supabase
          .from("stores")
          .select("id, store_code, store_name")
          .eq("is_active", true)
          .order("store_code")
      : { data: [] as { id: string; store_code: string; store_name: string }[] };

  return (
    <KantiraShell orgName={organization?.name ?? "—"} role={profile.role} signOutAction={signOut}>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-kantira-navy-900">Online orders</h2>
        <p className="text-sm text-brand-slate">
          Orders placed through the customer storefront and Android app.
        </p>
      </div>

      {stalled.length > 0 ? (
        <section className={`${cardClass} mb-6 border-amber-200 bg-amber-50/40`}>
          <div className="mb-3 flex items-center gap-2 text-amber-700">
            <AlertTriangle size={18} />
            <h3 className="text-base font-semibold">
              Needs attention — no store could cover these automatically
            </h3>
          </div>
          <div>
            {stalled.map((o) => (
              <StalledOrderRow
                key={o.order_id}
                orderId={o.order_id}
                orderNumber={o.order_number}
                customerName={customerNameById.get(o.customer_id) ?? "—"}
                grandTotal={o.grand_total}
                stores={stores ?? []}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className={cardClass}>
        {orders && orders.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-kantira-navy-100 text-xs uppercase tracking-wide text-brand-slate">
                  <th className="py-2 pr-4">Order #</th>
                  <th className="py-2 pr-4">Placed</th>
                  <th className="py-2 pr-4">Customer</th>
                  <th className="py-2 pr-4">Store</th>
                  <th className="py-2 pr-4">Payment</th>
                  <th className="py-2 pr-4 text-right">Total</th>
                  <th className="py-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-kantira-navy-50">
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="py-2.5 pr-4 font-mono text-xs text-kantira-navy-700">
                      <Link href={`/orders/${o.id}`} className="text-brand-royal">
                        {o.order_number}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-4 text-brand-slate">
                      {new Date(o.placed_at).toLocaleDateString()}
                    </td>
                    <td className="py-2.5 pr-4 text-brand-slate">{o.customers?.name ?? "—"}</td>
                    <td className="py-2.5 pr-4 text-brand-slate">{o.stores?.store_code ?? "—"}</td>
                    <td className="py-2.5 pr-4 text-brand-slate">{o.payment_status}</td>
                    <td className="py-2.5 pr-4 text-right text-kantira-navy-700">
                      {o.grand_total.toFixed(2)}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className={statusBadgeClass(o.status)}>{o.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-brand-slate">No online orders yet.</p>
        )}
      </section>
    </KantiraShell>
  );
}
