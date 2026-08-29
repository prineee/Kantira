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

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={primaryButtonClass}>
      {pending ? pendingLabel : label}
    </button>
  );
}

export function CustomerForm({
  action,
  mode,
  initial,
}: {
  action: Action;
  mode: "create" | "edit";
  initial?: {
    customer_code: string;
    name: string;
    phone: string;
    email: string;
    gstin: string;
    billing_address: string;
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
          <label className={labelClass}>Customer code</label>
          <input
            name="customer_code"
            required
            defaultValue={initial?.customer_code}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Name</label>
          <input
            name="name"
            required
            defaultValue={initial?.name}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Phone</label>
          <input name="phone" defaultValue={initial?.phone} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Email</label>
          <input
            type="email"
            name="email"
            defaultValue={initial?.email}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>GSTIN</label>
          <input name="gstin" defaultValue={initial?.gstin} className={inputClass} />
        </div>
      </div>

      <div>
        <label className={labelClass}>Billing address</label>
        <textarea
          name="billing_address"
          rows={2}
          defaultValue={initial?.billing_address}
          className={inputClass}
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
        label={mode === "create" ? "Create customer" : "Save changes"}
        pendingLabel={mode === "create" ? "Creating…" : "Saving…"}
      />
    </form>
  );
}
