"use client";

import { useState, useTransition } from "react";
import {
  primaryButtonClass,
  selectClass,
  errorTextClass,
} from "@/lib/ui/form-classes";
import { resolveStalledOrder } from "./actions";

export function StalledOrderRow({
  orderId,
  orderNumber,
  customerName,
  grandTotal,
  stores,
}: {
  orderId: string;
  orderNumber: string;
  customerName: string;
  grandTotal: number;
  stores: { id: string; store_code: string; store_name: string }[];
}) {
  const [storeId, setStoreId] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function resolve() {
    setError(null);
    startTransition(async () => {
      const result = await resolveStalledOrder(orderId, storeId);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-100 py-3 last:border-b-0">
      <div>
        <p className="text-sm font-semibold text-kantira-navy-900">{orderNumber}</p>
        <p className="text-xs text-brand-slate">
          {customerName} &middot; &#8377;{grandTotal.toFixed(2)}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <select
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
          className={`${selectClass} w-48`}
        >
          <option value="">Select a store…</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.store_code} — {s.store_name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={resolve}
          disabled={pending || !storeId}
          className={primaryButtonClass}
        >
          {pending ? "Assigning…" : "Assign & continue"}
        </button>
      </div>
      {error ? <p className={`w-full ${errorTextClass}`}>{error}</p> : null}
    </div>
  );
}
