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

const PAYMENT_METHODS = ["CASH", "BANK", "UPI", "CARD", "CREDIT"] as const;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={primaryButtonClass}>
      {pending ? "Saving…" : "Save draft"}
    </button>
  );
}

export function SaleForm({
  action,
  stores,
  customers,
  items,
}: {
  action: Action;
  stores: Option[];
  customers: Option[];
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
          <label className={labelClass}>Customer</label>
          <select name="customer_id" defaultValue="" className={inputClass}>
            <option value="">— Walk-in —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Walk-in customer name</label>
          <input name="customer_name" className={inputClass} placeholder="If no customer selected" />
        </div>
        <div>
          <label className={labelClass}>Invoice date</label>
          <input
            type="date"
            name="invoice_date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Payment method</label>
          <select name="payment_method" defaultValue="CASH" className={inputClass}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Amount paid</label>
          <input
            type="number"
            step="0.01"
            min="0"
            name="amount_paid"
            defaultValue={0}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>Line items</label>
        <LineItemsEditor items={items} rateLabel="Selling rate" />
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
