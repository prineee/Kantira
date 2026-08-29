"use client";

import { useFormState, useFormStatus } from "react-dom";
import {
  inputClass,
  labelClass,
  primaryButtonClass,
  errorTextClass,
} from "@/lib/ui/form-classes";
import { LineItemsEditor, type ItemOption } from "@/components/line-items-editor";

type ActionState = { error: string | null };
type Action = (prevState: ActionState, formData: FormData) => Promise<ActionState>;
type Option = { id: string; label: string };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={primaryButtonClass}>
      {pending ? "Saving…" : "Save draft"}
    </button>
  );
}

export function PurchaseForm({
  action,
  stores,
  suppliers,
  items,
}: {
  action: Action;
  stores: Option[];
  suppliers: Option[];
  items: ItemOption[];
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(action, {
    error: null,
  });

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className={labelClass}>Store</label>
          <select name="store_id" required defaultValue="" className={inputClass}>
            <option value="" disabled>
              Select a store
            </option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Supplier</label>
          <select name="supplier_id" required defaultValue="" className={inputClass}>
            <option value="" disabled>
              Select a supplier
            </option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Document date</label>
          <input
            type="date"
            name="document_date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Reference number</label>
          <input name="reference_number" className={inputClass} />
        </div>
      </div>

      <div>
        <label className={labelClass}>Line items</label>
        <LineItemsEditor items={items} rateLabel="Purchase rate" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Header discount</label>
          <input
            type="number"
            step="0.01"
            min="0"
            name="discount_amount"
            defaultValue={0}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Header tax</label>
          <input
            type="number"
            step="0.01"
            min="0"
            name="tax_amount"
            defaultValue={0}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>Notes</label>
        <textarea name="notes" rows={2} className={inputClass} />
      </div>

      {state.error ? <p className={errorTextClass}>{state.error}</p> : null}

      <SubmitButton />
    </form>
  );
}
