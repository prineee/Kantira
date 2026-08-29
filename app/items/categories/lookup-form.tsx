"use client";

import { useFormState, useFormStatus } from "react-dom";
import {
  inputClass,
  labelClass,
  primaryButtonClass,
  errorTextClass,
  successTextClass,
} from "@/lib/ui/form-classes";

type ActionState = { error: string | null; success?: boolean };
type Action = (prevState: ActionState, formData: FormData) => Promise<ActionState>;

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={primaryButtonClass}>
      {pending ? "Saving…" : label}
    </button>
  );
}

export function CategoryForm({
  action,
  categories,
}: {
  action: Action;
  categories: { id: string; name: string }[];
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(action, {
    error: null,
  });

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className={labelClass}>Category name</label>
        <input name="name" required className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Parent category</label>
        <select name="parent_category_id" defaultValue="" className={inputClass}>
          <option value="">— None —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      {state.error ? <p className={errorTextClass}>{state.error}</p> : null}
      {!state.error && state.success ? (
        <p className={successTextClass}>Category added.</p>
      ) : null}
      <SubmitButton label="Add category" />
    </form>
  );
}

export function UnitForm({ action }: { action: Action }) {
  const [state, formAction] = useFormState<ActionState, FormData>(action, {
    error: null,
  });

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Code</label>
          <input name="code" required placeholder="PCS" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Name</label>
          <input name="name" required placeholder="Pieces" className={inputClass} />
        </div>
      </div>
      {state.error ? <p className={errorTextClass}>{state.error}</p> : null}
      {!state.error && state.success ? (
        <p className={successTextClass}>Unit added.</p>
      ) : null}
      <SubmitButton label="Add unit" />
    </form>
  );
}
