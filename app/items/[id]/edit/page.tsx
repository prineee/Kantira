import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/data/get-org-id";
import { KantiraShell } from "@/components/kantira-shell";
import { signOut } from "@/app/dashboard/actions";
import { updateItem } from "../../actions";
import { ItemForm } from "../../item-form";
import { cardClass } from "@/lib/ui/form-classes";

const WRITE_ROLES = ["OWNER", "ADMIN", "STOCK"];

export default async function EditItemPage({
  params,
}: {
  params: { id: string };
}) {
  const { supabase, profile, organization } = await getOrgContext();
  const canWrite = WRITE_ROLES.includes(profile.role);

  const [{ data: item }, { data: categories }, { data: units }] =
    await Promise.all([
      supabase
        .from("items")
        .select(
          "id, sku, name, category_id, uom_id, barcode, hsn_code, description, cost_price, selling_price, tax_rate_percent, reorder_level, track_inventory, is_active",
        )
        .eq("id", params.id)
        .maybeSingle(),
      supabase
        .from("product_categories")
        .select("id, name")
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("units_of_measurement")
        .select("id, code, name")
        .eq("is_active", true)
        .order("code"),
    ]);

  if (!item) {
    notFound();
  }

  const categoryOptions = (categories ?? []).map((c) => ({
    id: c.id,
    label: c.name,
  }));
  const unitOptions = (units ?? []).map((u) => ({
    id: u.id,
    label: `${u.code} — ${u.name}`,
  }));

  return (
    <KantiraShell
      orgName={organization?.name ?? "—"}
      role={profile.role}
      signOutAction={signOut}
    >
      <div className="mb-6">
        <Link href="/items" className="text-sm font-medium text-brand-royal">
          ← Back to items
        </Link>
        <h2 className="mt-2 text-xl font-bold text-kantira-navy-900">
          Edit item
        </h2>
      </div>

      <section className={cardClass}>
        {canWrite ? (
          <ItemForm
            mode="edit"
            action={updateItem.bind(null, item.id)}
            categories={categoryOptions}
            units={unitOptions}
            initial={{
              sku: item.sku,
              name: item.name,
              category_id: item.category_id ?? "",
              uom_id: item.uom_id,
              barcode: item.barcode ?? "",
              hsn_code: item.hsn_code ?? "",
              description: item.description ?? "",
              cost_price: item.cost_price,
              selling_price: item.selling_price,
              tax_rate_percent: item.tax_rate_percent,
              reorder_level: item.reorder_level,
              track_inventory: item.track_inventory,
              is_active: item.is_active,
            }}
          />
        ) : (
          <p className="text-sm text-brand-slate">
            Your role ({profile.role}) does not have permission to edit
            items.
          </p>
        )}
      </section>
    </KantiraShell>
  );
}
