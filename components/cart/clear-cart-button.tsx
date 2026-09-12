"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { clearCartAction } from "@/lib/actions/cart";

export function ClearCartButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClear() {
    setError(null);
    startTransition(async () => {
      const result = await clearCartAction();
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClear}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-kantira-navy-600 hover:text-red-600 disabled:opacity-50"
      >
        <Trash2 size={14} />
        Clear cart
      </button>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
