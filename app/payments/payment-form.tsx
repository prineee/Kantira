"use client";

import { useFormState, useFormStatus } from "react-dom";
import {
  inputClass,
  labelClass,
  primaryButtonClass,
  errorTextClass,
} from "@/lib/ui/form-classes";

type ActionState = { error: string | null };
type Action = (prevState: ActionState, formData: FormData) => Promise<ActionState>;
type Option = { id: string; label: string };

const PAYMENT_METHODS = ["CASH", "BANK", "UPI", "CARD"] as const;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={primaryButtonClass}>
      {pending ? "Recording…" : "Record payment"}
    </button>
  );
}

export function PaymentForm({
  action,
  stores,
  suppliers,
}: {
  action: Action;
  stores: Option[];
  suppliers: Option[];
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(action, {
    error: null,
  });

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          <label className={labelClass}>Amount</label>
          <input type="number" step="0.01" min="0" name="amount" required className={inputClass} />
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
          <label className={labelClass}>Payment date</label>
          <input
            type="date"
            name="payment_date"
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
        <label className={labelClass}>Notes</label>
        <textarea name="notes" rows={2} className={inputClass} />
      </div>

      {state.error ? <p className={errorTextClass}>{state.error}</p> : null}

      <SubmitButton />
    </form>
  );
}
