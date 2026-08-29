import { redirect } from "next/navigation";
import { getOrgContext } from "@/lib/data/get-org-id";
import { KantiraShell } from "@/components/kantira-shell";
import { signOut } from "@/app/dashboard/actions";
import { createPurchaseReturn } from "../actions";
import { PurchaseReturnForm } from "../purchase-return-form";
import { cardClass } from "@/lib/ui/form-classes";
import type { LineRow } from "@/components/line-items-editor";

const WRITE_ROLES = ["OWNER", "ADMIN", "STOCK"];

export default async function NewPurchaseReturnPage({
  searchParams,
}: {
  searchParams: { purchase?: string };
}) {
  const { supabase, profile, organization } = await getOrgContext();
  if (!WRITE_ROLES.includes(profile.role)) {
    redirect("/purchase-returns");
  }

  const purchaseId = searchParams.purchase;
  if (!purchaseId) redirect("/purchases");

  const { data: purchase } = await supabase
    .from("purchases")
    .select("id, document_number, status, store_id, supplier_id, stores(store_code), suppliers(name)")
    .eq("id", purchaseId)
    .maybeSingle();

  if (!purchase || purchase.status !== "POSTED") {
    redirect("/purchases");
  }

  const { data: lines } = await supabase
    .from("purchase_lines")
    .select("id, quantity, purchase_rate, item_id, uom_id, items(sku, name), units_of_measurement(code)")
    .eq("purchase_id", purchase.id)
    .order("line_no");

  const lineIds = (lines ?? []).map((l) => l.id);
  const { data: alreadyReturned } = lineIds.length
    ? await supabase
        .from("purchase_return_lines")
        .select("original_purchase_line_id, quantity, purchase_returns!inner(status)")
        .eq("purchase_returns.status", "POSTED")
        .in("original_purchase_line_id", lineIds)
    : { data: [] };

  const returnedByLine = new Map<string, number>();
  for (const r of alreadyReturned ?? []) {
    returnedByLine.set(
      r.original_purchase_line_id,
      (returnedByLine.get(r.original_purchase_line_id) ?? 0) + r.quantity,
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
        rate: l.purchase_rate,
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
          Return against {purchase.document_number}
        </h2>
        <p className="text-sm text-brand-slate">
          {purchase.stores?.store_code} — {purchase.suppliers?.name}
        </p>
      </div>

      <section className={cardClass}>
        {rows.length === 0 ? (
          <p className="text-sm text-brand-slate">
            Every line on this purchase has already been fully returned.
          </p>
        ) : (
          <PurchaseReturnForm
            action={createPurchaseReturn}
            originalPurchaseId={purchase.id}
            storeId={purchase.store_id}
            supplierId={purchase.supplier_id}
            rows={rows}
          />
        )}
      </section>
    </KantiraShell>
  );
}
