import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { requireCustomerContext } from "@/lib/actions/customer-auth";
import { isValidUuid } from "@/lib/data/storefront-catalog";
import { StorefrontShell } from "@/components/storefront/storefront-shell";
import { cardClass } from "@/lib/ui/form-classes";

// Read-only confirmation view. Uses the existing online_orders_select_self
// RLS policy (migration 0015) — a customer can only ever see their own
// orders here, the same boundary every other customer-facing order read
// in this codebase relies on. This page creates nothing; it only displays
// what finalize_checkout_session_internal() (migration 0024) already
// committed.
export default async function CheckoutConfirmationPage({
  searchParams,
}: {
  searchParams: { order?: string };
}) {
  const ctx = await requireCustomerContext();
  if (ctx.error) {
    redirect("/dashboard");
  }

  if (!searchParams.order || !isValidUuid(searchParams.order)) {
    redirect("/account");
  }

  const { data: order } = await ctx.supabase
    .from("online_orders")
    .select("id, order_number, status, payment_status, grand_total, placed_at")
    .eq("id", searchParams.order)
    .maybeSingle();

  if (!order) {
    redirect("/account");
  }

  const { data: lines } = await ctx.supabase
    .from("online_order_lines")
    .select("id, item_name_snapshot, quantity, unit_price, line_total")
    .eq("order_id", order.id);

  return (
    <StorefrontShell>
      <div className="mx-auto max-w-2xl px-6 py-16">
        <div className="mb-8 flex flex-col items-center text-center">
          <CheckCircle2 size={40} className="text-kantira-green-600" />
          <h1 className="mt-3 text-2xl font-bold text-kantira-navy-900">Order placed</h1>
          <p className="mt-1 text-sm text-brand-slate">
            Order {order.order_number} &middot;{" "}
            {order.payment_status === "PAID" ? "Payment received" : "Pay on delivery"}
          </p>
        </div>

        <section className={cardClass}>
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
          <div className="mt-4 flex justify-between border-t border-kantira-navy-100 pt-4 text-base font-bold text-kantira-navy-900">
            <span>Total</span>
            <span>&#8377;{order.grand_total.toFixed(2)}</span>
          </div>
        </section>

        <div className="mt-8 text-center">
          <Link href="/shop" className="text-sm font-medium text-brand-royal">
            Continue shopping →
          </Link>
        </div>
      </div>
    </StorefrontShell>
  );
}
