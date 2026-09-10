"use client";

import { useFormState, useFormStatus } from "react-dom";
import {
  inputClass,
  selectClass,
  textareaClass,
  labelClass,
  checkboxClass,
  primaryButtonClass,
  errorTextClass,
} from "@/lib/ui/form-classes";

type ActionState = { error: string | null };
type Action = (prevState: ActionState, formData: FormData) => Promise<ActionState>;

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={primaryButtonClass}>
      {pending ? pendingLabel : label}
    </button>
  );
}

export function StoreForm({
  action,
  mode,
  initial,
}: {
  action: Action;
  mode: "create" | "edit";
  initial?: {
    store_code: string;
    store_name: string;
    type: string;
    phone: string;
    city: string;
    address: string;
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
          <label className={labelClass}>Store code</label>
          <input
            name="store_code"
            required
            defaultValue={initial?.store_code}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Store name</label>
          <input
            name="store_name"
            required
            defaultValue={initial?.store_name}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Type</label>
          <select
            name="type"
            defaultValue={initial?.type ?? "COMPANY"}
            className={selectClass}
          >
            <option value="COMPANY">Company</option>
            <option value="FRANCHISE">Franchise</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Phone</label>
          <input name="phone" defaultValue={initial?.phone} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>City</label>
          <input name="city" defaultValue={initial?.city} className={inputClass} />
        </div>
      </div>

      <div>
        <label className={labelClass}>Address</label>
        <textarea
          name="address"
          rows={2}
          defaultValue={initial?.address}
          className={textareaClass}
        />
      </div>

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

      {state.error ? <p className={errorTextClass}>{state.error}</p> : null}

      <SubmitButton
        label={mode === "create" ? "Create store" : "Save changes"}
        pendingLabel={mode === "create" ? "Creating…" : "Saving…"}
      />
    </form>
  );
}
