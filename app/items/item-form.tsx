"use client";

import { useFormState, useFormStatus } from "react-dom";
import {
  inputClass,
  labelClass,
  checkboxClass,
  primaryButtonClass,
  errorTextClass,
} from "@/lib/ui/form-classes";

type ActionState = { error: string | null };
type Action = (prevState: ActionState, formData: FormData) => Promise<ActionState>;

type Option = { id: string; label: string };

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={primaryButtonClass}>
      {pending ? pendingLabel : label}
    </button>
  );
}

export function ItemForm({
  action,
  categories,
  units,
  initial,
  mode,
  canPublish = false,
}: {
  action: Action;
  categories: Option[];
  units: Option[];
  mode: "create" | "edit";
  // OWNER/ADMIN only (lib/storefront/permissions.ts); the database enforces
  // the same rule independently (migration 0032).
  canPublish?: boolean;
  initial?: {
    sku: string;
    name: string;
    category_id: string;
    uom_id: string;
    barcode: string;
    hsn_code: string;
    description: string;
    cost_price: number;
    selling_price: number;
    tax_rate_percent: number;
    reorder_level: number;
    weight_kg: number | null;
    track_inventory: boolean;
    is_active: boolean;
    is_published: boolean;
  };
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(action, {
    error: null,
  });

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>SKU</label>
          <input
            name="sku"
            required
            defaultValue={initial?.sku}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Item name</label>
          <input
            name="name"
            required
            defaultValue={initial?.name}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Category</label>
          <select
            name="category_id"
            defaultValue={initial?.category_id ?? ""}
            className={inputClass}
          >
            <option value="">— None —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Unit of measurement</label>
          <select
            name="uom_id"
            required
            defaultValue={initial?.uom_id ?? ""}
            className={inputClass}
          >
            <option value="" disabled>
              Select a unit
            </option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Barcode</label>
          <input
            name="barcode"
            defaultValue={initial?.barcode}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>HSN code</label>
          <input
            name="hsn_code"
            defaultValue={initial?.hsn_code}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Cost price</label>
          <input
            type="number"
            step="0.01"
            min="0"
            name="cost_price"
            defaultValue={initial?.cost_price ?? 0}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Selling price</label>
          <input
            type="number"
            step="0.01"
            min="0"
            name="selling_price"
            defaultValue={initial?.selling_price ?? 0}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Tax rate (%)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            name="tax_rate_percent"
            defaultValue={initial?.tax_rate_percent ?? 0}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Reorder level</label>
          <input
            type="number"
            step="0.001"
            min="0"
            name="reorder_level"
            defaultValue={initial?.reorder_level ?? 0}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Weight (kg)</label>
          <input
            type="number"
            step="0.001"
            min="0"
            name="weight_kg"
            placeholder="Required before this item can ship"
            defaultValue={initial?.weight_kg ?? ""}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>Description</label>
        <textarea
          name="description"
          rows={2}
          defaultValue={initial?.description}
          className={inputClass}
        />
      </div>

      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm text-kantira-navy-700">
          <input
            type="checkbox"
            name="track_inventory"
            defaultChecked={initial?.track_inventory ?? true}
            className={checkboxClass}
          />
          Track inventory
        </label>
        {mode === "edit" ? (
          <label className="flex items-center gap-2 text-sm text-kantira-navy-700">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={initial?.is_active ?? true}
              className={checkboxClass}
            />
            Active
          </label>
        ) : null}
      </div>

      {mode === "edit" ? (
        <div className="rounded-lg border border-kantira-navy-100 bg-brand-gray p-4">
          <label className={labelClass} htmlFor="is_published">
            Storefront
          </label>
          {canPublish ? (
            <select
              id="is_published"
              name="is_published"
              defaultValue={initial?.is_published ? "published" : "hidden"}
              className={`${inputClass} sm:max-w-xs`}
            >
              <option value="hidden">Hidden</option>
              <option value="published">Published</option>
            </select>
          ) : (
            <p className="text-sm font-medium text-kantira-navy-900">
              {initial?.is_published ? "Published" : "Hidden"}
              <span className="ml-2 font-normal text-brand-slate">
                (only an owner or admin can change this)
              </span>
            </p>
          )}
          <p className="mt-2 text-xs text-brand-slate">
            Customers see this item at kantira.in only when it is Active and Published and
            the storefront is ON.
          </p>
        </div>
      ) : null}

      {state.error ? <p className={errorTextClass}>{state.error}</p> : null}

      <SubmitButton
        label={mode === "create" ? "Create item" : "Save changes"}
        pendingLabel={mode === "create" ? "Creating…" : "Saving…"}
      />
    </form>
  );
}
