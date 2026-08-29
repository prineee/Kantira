import { redirect } from "next/navigation";
import { getOrgContext } from "@/lib/data/get-org-id";
import { KantiraShell } from "@/components/kantira-shell";
import { signOut } from "@/app/dashboard/actions";
import { createPayment } from "../actions";
import { PaymentForm } from "../payment-form";
import { cardClass } from "@/lib/ui/form-classes";

const WRITE_ROLES = ["OWNER", "ADMIN", "STOCK", "ACCOUNTANT"];

export default async function NewPaymentPage() {
  const { supabase, profile, organization } = await getOrgContext();
  if (!WRITE_ROLES.includes(profile.role)) {
    redirect("/payments");
  }

  const [{ data: stores }, { data: suppliers }] = await Promise.all([
    supabase.from("stores").select("id, store_code, store_name").order("store_code"),
    supabase
      .from("suppliers")
      .select("id, supplier_code, name")
      .eq("is_active", true)
      .order("name"),
  ]);

  const storeOptions = (stores ?? []).map((s) => ({
    id: s.id,
    label: `${s.store_code} — ${s.store_name}`,
  }));
  const supplierOptions = (suppliers ?? []).map((s) => ({
    id: s.id,
    label: `${s.supplier_code} — ${s.name}`,
  }));

  return (
    <KantiraShell orgName={organization?.name ?? "—"} role={profile.role} signOutAction={signOut}>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-kantira-navy-900">Record supplier payment</h2>
        <p className="text-sm text-brand-slate">
          Posts immediately against the supplier's payable balance.
        </p>
      </div>

      <section className={cardClass}>
        {storeOptions.length === 0 || supplierOptions.length === 0 ? (
          <p className="text-sm text-brand-slate">
            You need at least one store and one active supplier to record a payment.
          </p>
        ) : (
          <PaymentForm action={createPayment} stores={storeOptions} suppliers={supplierOptions} />
        )}
      </section>
    </KantiraShell>
  );
}
