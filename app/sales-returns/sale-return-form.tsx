"use client";

import { useFormState, useFormStatus } from "react-dom";
import {
  inputClass,
  labelClass,
  primaryButtonClass,
  errorTextClass,
} from "@/lib/ui/form-classes";
import { LineItemsEditor, type LineRow } from "@/components/line-items-editor";

type ActionState = { error: string | null };
type Action = (prevState: ActionState, formData: FormData) => Promise<ActionState>;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={primaryButtonClass}>
      {pending ? "Saving…" : "Save draft"}
    </button>
  );
}

export function SaleReturnForm({
  action,
  originalSaleId,
  storeId,
  customerId,
  rows,
}: {
  action: Action;
  originalSaleId: string;
  storeId: string;
  customerId: string;
  rows: LineRow[];
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(action, {
    error: null,
  });

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="original_sale_id" value={originalSaleId} />
      <input type="hidden" name="store_id" value={storeId} />
      <input type="hidden" name="customer_id" value={customerId} />

      <div>
        <label className={labelClass}>Return date</label>
        <input
          type="date"
          name="return_date"
          required
          defaultValue={new Date().toISOString().slice(0, 10)}
          className={`${inputClass} max-w-xs`}
        />
      </div>

      <div>
        <label className={labelClass}>Lines to return</label>
        <LineItemsEditor items={[]} rateLabel="Selling rate" initialRows={rows} />
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
