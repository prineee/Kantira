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
}: {
  action: Action;
  categories: Option[];
  units: Option[];
  mode: "create" | "edit";
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
    track_inventory: boolean;
    is_active: boolean;
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

      {state.error ? <p className={errorTextClass}>{state.error}</p> : null}

      <SubmitButton
        label={mode === "create" ? "Create item" : "Save changes"}
        pendingLabel={mode === "create" ? "Creating…" : "Saving…"}
      />
    </form>
  );
}
