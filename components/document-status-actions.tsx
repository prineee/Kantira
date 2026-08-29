"use client";

import { useState, useTransition } from "react";
import {
  primaryButtonClass,
  secondaryButtonClass,
  errorTextClass,
  inputClass,
} from "@/lib/ui/form-classes";

// Shared Post/Cancel controls for every DRAFT transaction document
// (purchases, sales, purchase returns, sales returns). Posting and
// cancelling are plain server actions bound to the document id — this just
// wraps them with pending/error state since useFormState's (prevState,
// formData) shape doesn't fit a no-form "click to post" button.
export function DocumentStatusActions({
  documentId,
  postAction,
  cancelAction,
}: {
  documentId: string;
  postAction: (id: string) => Promise<{ error: string | null }>;
  cancelAction: (id: string, reason: string) => Promise<{ error: string | null }>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [reason, setReason] = useState("");

  function post() {
    setError(null);
    startTransition(async () => {
      const result = await postAction(documentId);
      if (result.error) setError(result.error);
    });
  }

  function cancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelAction(documentId, reason);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={post} disabled={pending} className={primaryButtonClass}>
          {pending ? "Posting…" : "Post"}
        </button>
        {!showCancel ? (
          <button
            type="button"
            onClick={() => setShowCancel(true)}
            disabled={pending}
            className={secondaryButtonClass}
          >
            Cancel draft
          </button>
        ) : null}
      </div>

      {showCancel ? (
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Cancellation reason (optional)"
            className={`${inputClass} max-w-xs`}
          />
          <button type="button" onClick={cancel} disabled={pending} className={secondaryButtonClass}>
            {pending ? "Cancelling…" : "Confirm cancel"}
          </button>
        </div>
      ) : null}

      {error ? <p className={errorTextClass}>{error}</p> : null}
    </div>
  );
}
