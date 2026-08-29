import { redirect } from "next/navigation";
import { getOrgContext } from "@/lib/data/get-org-id";
import { KantiraShell } from "@/components/kantira-shell";
import { signOut } from "@/app/dashboard/actions";
import { createSalesReturn } from "../actions";
import { SaleReturnForm } from "../sale-return-form";
import { cardClass } from "@/lib/ui/form-classes";
import type { LineRow } from "@/components/line-items-editor";

const WRITE_ROLES = ["OWNER", "ADMIN", "SALES"];

export default async function NewSalesReturnPage({
  searchParams,
}: {
  searchParams: { sale?: string };
}) {
  const { supabase, profile, organization } = await getOrgContext();
  if (!WRITE_ROLES.includes(profile.role)) {
    redirect("/sales-returns");
  }

  const saleId = searchParams.sale;
  if (!saleId) redirect("/sales");

  const { data: sale } = await supabase
    .from("sales")
    .select(
      "id, invoice_number, status, store_id, customer_id, customer_name, stores(store_code), customers(name)",
    )
    .eq("id", saleId)
    .maybeSingle();

  if (!sale || sale.status !== "POSTED") {
    redirect("/sales");
  }

  const { data: lines } = await supabase
    .from("sale_lines")
    .select("id, quantity, selling_rate, item_id, uom_id, items(sku, name), units_of_measurement(code)")
    .eq("sale_id", sale.id)
    .order("line_no");

  const lineIds = (lines ?? []).map((l) => l.id);
  const { data: alreadyReturned } = lineIds.length
    ? await supabase
        .from("sales_return_lines")
        .select("original_sale_line_id, quantity, sales_returns!inner(status)")
        .eq("sales_returns.status", "POSTED")
        .in("original_sale_line_id", lineIds)
    : { data: [] };

  const returnedByLine = new Map<string, number>();
  for (const r of alreadyReturned ?? []) {
    returnedByLine.set(
      r.original_sale_line_id,
      (returnedByLine.get(r.original_sale_line_id) ?? 0) + r.quantity,
    );
  }

  const rows: LineRow[] = (lines ?? [])
    .map((l) => {
      const remaining = l.quantity - (returnedByLine.get(l.id) ?? 0);
      return {
        key: l.id,
        itemId: l.item_id,
        uomId: l.uom_id,
        uomLabel: l.units_of_measurement?.code ?? "",
        itemLabel: `${l.items?.sku} — ${l.items?.name}`,
        quantity: remaining > 0 ? remaining : 0,
        rate: l.selling_rate,
        discountAmount: 0,
        taxAmount: 0,
        locked: true,
        maxQuantity: remaining,
        originalLineId: l.id,
      };
    })
    .filter((r) => r.maxQuantity > 0);

  return (
    <KantiraShell orgName={organization?.name ?? "—"} role={profile.role} signOutAction={signOut}>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-kantira-navy-900">
          Return against {sale.invoice_number}
        </h2>
        <p className="text-sm text-brand-slate">
          {sale.stores?.store_code} — {sale.customers?.name ?? sale.customer_name ?? "Walk-in"}
        </p>
      </div>

      <section className={cardClass}>
        {rows.length === 0 ? (
          <p className="text-sm text-brand-slate">
            Every line on this sale has already been fully returned.
          </p>
        ) : (
          <SaleReturnForm
            action={createSalesReturn}
            originalSaleId={sale.id}
            storeId={sale.store_id}
            customerId={sale.customer_id ?? ""}
            rows={rows}
          />
        )}
      </section>
    </KantiraShell>
  );
}
