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

const MOVEMENT_TYPES = [
  { value: "ADJUSTMENT_IN", label: "Adjustment in (stock increases)" },
  { value: "ADJUSTMENT_OUT", label: "Adjustment out (stock decreases)" },
  { value: "DAMAGE", label: "Damage (stock decreases)" },
] as const;

const REASONS = ["DAMAGE", "LOSS", "FOUND", "RECOUNT", "OTHER"] as const;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={primaryButtonClass}>
      {pending ? "Posting…" : "Post adjustment"}
    </button>
  );
}

export function AdjustmentForm({
  action,
  stores,
  items,
}: {
  action: Action;
  stores: Option[];
  items: Option[];
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(action, {
    error: null,
  });

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          <label className={labelClass}>Item</label>
          <select name="item_id" required defaultValue="" className={inputClass}>
            <option value="" disabled>
              Select an item
            </option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Adjustment type</label>
          <select name="movement_type" required defaultValue="" className={inputClass}>
            <option value="" disabled>
              Select a type
            </option>
            {MOVEMENT_TYPES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Reason</label>
          <select name="adjustment_reason" required defaultValue="" className={inputClass}>
            <option value="" disabled>
              Select a reason
            </option>
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Quantity</label>
          <input type="number" step="0.001" min="0" name="quantity" required className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Unit cost override (optional)</label>
          <input type="number" step="0.0001" min="0" name="unit_cost" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Transaction date</label>
          <input
            type="date"
            name="transaction_date"
            defaultValue={new Date().toISOString().slice(0, 10)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Reference</label>
          <input name="reference" className={inputClass} />
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
