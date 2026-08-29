import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/data/get-org-id";
import { KantiraShell } from "@/components/kantira-shell";
import { signOut } from "@/app/dashboard/actions";
import { updateSupplier } from "../../actions";
import { SupplierForm } from "../../supplier-form";
import { cardClass } from "@/lib/ui/form-classes";

const WRITE_ROLES = ["OWNER", "ADMIN", "ACCOUNTANT", "STOCK"];

export default async function EditSupplierPage({
  params,
}: {
  params: { id: string };
}) {
  const { supabase, profile, organization } = await getOrgContext();
  const canWrite = WRITE_ROLES.includes(profile.role);

  const { data: supplier } = await supabase
    .from("suppliers")
    .select("id, supplier_code, name, phone, email, gstin, billing_address, is_active")
    .eq("id", params.id)
    .maybeSingle();

  if (!supplier) {
    notFound();
  }

  return (
    <KantiraShell
      orgName={organization?.name ?? "—"}
      role={profile.role}
      signOutAction={signOut}
    >
      <div className="mb-6">
        <Link href="/suppliers" className="text-sm font-medium text-brand-royal">
          ← Back to suppliers
        </Link>
        <h2 className="mt-2 text-xl font-bold text-kantira-navy-900">
          Edit supplier
        </h2>
      </div>

      <section className={cardClass}>
        {canWrite ? (
          <SupplierForm
            mode="edit"
            action={updateSupplier.bind(null, supplier.id)}
            initial={{
              supplier_code: supplier.supplier_code,
              name: supplier.name,
              phone: supplier.phone ?? "",
              email: supplier.email ?? "",
              gstin: supplier.gstin ?? "",
              billing_address: supplier.billing_address ?? "",
              is_active: supplier.is_active,
            }}
          />
        ) : (
          <p className="text-sm text-brand-slate">
            Your role ({profile.role}) does not have permission to edit
            suppliers.
          </p>
        )}
      </section>
    </KantiraShell>
  );
}
