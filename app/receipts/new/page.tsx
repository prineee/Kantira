import { redirect } from "next/navigation";
import { getOrgContext } from "@/lib/data/get-org-id";
import { KantiraShell } from "@/components/kantira-shell";
import { signOut } from "@/app/dashboard/actions";
import { createReceipt } from "../actions";
import { ReceiptForm } from "../receipt-form";
import { cardClass } from "@/lib/ui/form-classes";

const WRITE_ROLES = ["OWNER", "ADMIN", "SALES", "ACCOUNTANT"];

export default async function NewReceiptPage() {
  const { supabase, profile, organization } = await getOrgContext();
  if (!WRITE_ROLES.includes(profile.role)) {
    redirect("/receipts");
  }

  const [{ data: stores }, { data: customers }] = await Promise.all([
    supabase.from("stores").select("id, store_code, store_name").order("store_code"),
    supabase
      .from("customers")
      .select("id, customer_code, name")
      .eq("is_active", true)
      .order("name"),
  ]);

  const storeOptions = (stores ?? []).map((s) => ({
    id: s.id,
    label: `${s.store_code} — ${s.store_name}`,
  }));
  const customerOptions = (customers ?? []).map((c) => ({
    id: c.id,
    label: `${c.customer_code} — ${c.name}`,
  }));

  return (
    <KantiraShell orgName={organization?.name ?? "—"} role={profile.role} signOutAction={signOut}>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-kantira-navy-900">Record customer receipt</h2>
        <p className="text-sm text-brand-slate">
          Posts immediately against the customer's receivable balance.
        </p>
      </div>

      <section className={cardClass}>
        {storeOptions.length === 0 || customerOptions.length === 0 ? (
          <p className="text-sm text-brand-slate">
            You need at least one store and one active customer to record a receipt.
          </p>
        ) : (
          <ReceiptForm action={createReceipt} stores={storeOptions} customers={customerOptions} />
        )}
      </section>
    </KantiraShell>
  );
}
