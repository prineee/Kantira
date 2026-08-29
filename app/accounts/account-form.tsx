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

const ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"] as const;
const CONTROL_TYPES = ["NONE", "CUSTOMER", "SUPPLIER", "CASH", "BANK"] as const;

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={primaryButtonClass}>
      {pending ? pendingLabel : label}
    </button>
  );
}

export function AccountForm({
  action,
  mode,
  accounts,
  initial,
}: {
  action: Action;
  mode: "create" | "edit";
  accounts: { id: string; label: string }[];
  initial?: {
    account_code: string;
    account_name: string;
    account_type: string;
    control_type: string;
    parent_account_id: string;
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
          <label className={labelClass}>Account code</label>
          <input
            name="account_code"
            required
            defaultValue={initial?.account_code}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Account name</label>
          <input
            name="account_name"
            required
            defaultValue={initial?.account_name}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Account type</label>
          <select
            name="account_type"
            required
            defaultValue={initial?.account_type ?? ""}
            className={inputClass}
          >
            <option value="" disabled>
              Select a type
            </option>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-brand-slate">
            ASSET / EXPENSE post as debit-normal; LIABILITY / EQUITY / INCOME
            post as credit-normal.
          </p>
        </div>
        <div>
          <label className={labelClass}>Control type</label>
          <select
            name="control_type"
            defaultValue={initial?.control_type ?? "NONE"}
            className={inputClass}
          >
            {CONTROL_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>Parent account</label>
          <select
            name="parent_account_id"
            defaultValue={initial?.parent_account_id ?? ""}
            className={inputClass}
          >
            <option value="">— None —</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
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
        label={mode === "create" ? "Create account" : "Save changes"}
        pendingLabel={mode === "create" ? "Creating…" : "Saving…"}
      />
    </form>
  );
}
