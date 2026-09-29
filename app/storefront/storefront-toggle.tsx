"use client";

import { useFormState, useFormStatus } from "react-dom";
import { primaryButtonClass, secondaryButtonClass, errorTextClass } from "@/lib/ui/form-classes";
import { setStorefrontEnabled, type StorefrontToggleState } from "./actions";

function ToggleButton({ enabled }: { enabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={enabled ? secondaryButtonClass : primaryButtonClass}
    >
      {pending ? "Saving…" : enabled ? "Disable Storefront" : "Enable Storefront"}
    </button>
  );
}

export function StorefrontToggle({ enabled }: { enabled: boolean }) {
  const [state, formAction] = useFormState<StorefrontToggleState, FormData>(
    setStorefrontEnabled,
    { error: null },
  );

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
      <ToggleButton enabled={enabled} />
      {state.error ? <p className={errorTextClass}>{state.error}</p> : null}
    </form>
  );
}
