import Link from "next/link";
import { Pencil } from "lucide-react";
import { getOrgContext } from "@/lib/data/get-org-id";
import { KantiraShell } from "@/components/kantira-shell";
import { signOut } from "@/app/dashboard/actions";
import { createItem } from "./actions";
import { ItemForm } from "./item-form";
import {
  cardClass,
  badgeActiveClass,
  badgeInactiveClass,
} from "@/lib/ui/form-classes";

const WRITE_ROLES = ["OWNER", "ADMIN", "STOCK"];

export default async function ItemsPage() {
  const { supabase, profile, organization } = await getOrgContext();
  const canWrite = WRITE_ROLES.includes(profile.role);

  const [{ data: items }, { data: categories }, { data: units }] =
    await Promise.all([
      supabase
        .from("items")
        .select(
          "id, sku, name, barcode, cost_price, selling_price, tax_rate_percent, reorder_level, track_inventory, is_active, product_categories(name), units_of_measurement(code)",
        )
        .order("name"),
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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-kantira-navy-900">Items</h2>
          <p className="text-sm text-brand-slate">
            Product master data used across purchases, sales, and stock.
          </p>
        </div>
        <Link
          href="/items/categories"
          className="text-sm font-medium text-brand-royal"
        >
          Manage categories &amp; units →
        </Link>
      </div>

      {canWrite ? (
        <section className={`${cardClass} mb-8`}>
          <h3 className="mb-4 text-base font-semibold text-kantira-navy-900">
            New item
          </h3>
          {unitOptions.length === 0 ? (
            <p className="text-sm text-brand-slate">
              Create at least one unit of measurement before adding items.{" "}
              <Link href="/items/categories" className="font-medium text-brand-royal">
                Add a unit
              </Link>
              .
            </p>
          ) : (
            <ItemForm
              mode="create"
              action={createItem}
              categories={categoryOptions}
              units={unitOptions}
            />
          )}
        </section>
      ) : null}

      <section className={cardClass}>
        <h3 className="mb-4 text-base font-semibold text-kantira-navy-900">
          All items
        </h3>
        {items && items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-kantira-navy-100 text-xs uppercase tracking-wide text-brand-slate">
                  <th className="py-2 pr-4">SKU</th>
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Category</th>
                  <th className="py-2 pr-4">UOM</th>
                  <th className="py-2 pr-4 text-right">Cost</th>
                  <th className="py-2 pr-4 text-right">Selling</th>
                  <th className="py-2 pr-4 text-right">Tax %</th>
                  <th className="py-2 pr-4">Status</th>
                  {canWrite ? <th className="py-2 pr-4" /> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-kantira-navy-50">
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-2.5 pr-4 font-mono text-xs text-kantira-navy-700">
                      {item.sku}
                    </td>
                    <td className="py-2.5 pr-4 font-medium text-kantira-navy-900">
                      {item.name}
                    </td>
                    <td className="py-2.5 pr-4 text-brand-slate">
                      {item.product_categories?.name ?? "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-brand-slate">
                      {item.units_of_measurement?.code ?? "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-right text-kantira-navy-700">
                      {item.cost_price.toFixed(2)}
                    </td>
                    <td className="py-2.5 pr-4 text-right text-kantira-navy-700">
                      {item.selling_price.toFixed(2)}
                    </td>
                    <td className="py-2.5 pr-4 text-right text-kantira-navy-700">
                      {item.tax_rate_percent.toFixed(2)}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span
                        className={
                          item.is_active ? badgeActiveClass : badgeInactiveClass
                        }
                      >
                        {item.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    {canWrite ? (
                      <td className="py-2.5 pr-4">
                        <Link
                          href={`/items/${item.id}/edit`}
                          className="inline-flex items-center gap-1 text-brand-royal"
                        >
                          <Pencil size={14} />
                          Edit
                        </Link>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-brand-slate">No items yet.</p>
        )}
      </section>
    </KantiraShell>
  );
}
