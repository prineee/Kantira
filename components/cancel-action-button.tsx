"use client";

import { useState, useTransition } from "react";
import { errorTextClass } from "@/lib/ui/form-classes";

// Inline "Cancel" control for POSTED-on-creation documents (receipts,
// payments) that have no DRAFT step — unlike DocumentStatusActions, there is
// only ever a cancel, never a post.
export function CancelActionButton({
  id,
  action,
}: {
  id: string;
  action: (id: string, reason: string) => Promise<{ error: string | null }>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function cancel() {
    const reason = window.prompt("Cancellation reason (optional):") ?? "";
    setError(null);
    startTransition(async () => {
      const result = await action(id, reason);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={cancel}
        disabled={pending}
        className="text-sm font-medium text-red-600 disabled:opacity-50"
      >
        {pending ? "Cancelling…" : "Cancel"}
      </button>
      {error ? <p className={errorTextClass}>{error}</p> : null}
    </div>
  );
}
