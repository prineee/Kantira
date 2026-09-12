"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Star, Trash2 } from "lucide-react";
import { deleteAddressAction, setDefaultAddressAction } from "@/lib/actions/customer-addresses";
import { badgeActiveClass } from "@/lib/ui/form-classes";
import type { CustomerAddress } from "@/lib/data/customer-address-queries";

export function AddressCard({ address }: { address: CustomerAddress }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSetDefault() {
    setError(null);
    startTransition(async () => {
      const result = await setDefaultAddressAction(address.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteAddressAction(address.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="rounded-card border border-kantira-navy-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-kantira-navy-900">{address.recipientName}</p>
            {address.isDefault ? (
              <span className={badgeActiveClass}>Default</span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-brand-slate">{address.phone}</p>
          <p className="mt-2 text-sm text-kantira-navy-700">
            {address.line1}
            {address.line2 ? `, ${address.line2}` : ""}
            <br />
            {address.city}, {address.state} {address.postalCode}
            <br />
            {address.country}
          </p>
          {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
        </div>

        <div className="flex flex-shrink-0 flex-col items-end gap-2">
          <Link
            href={`/account/addresses/${address.id}/edit`}
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-royal"
          >
            <Pencil size={14} />
            Edit
          </Link>
          {!address.isDefault ? (
            <button
              type="button"
              onClick={handleSetDefault}
              disabled={isPending}
              className="inline-flex items-center gap-1 text-sm font-medium text-kantira-navy-600 hover:text-brand-royal disabled:opacity-50"
            >
              <Star size={14} />
              Set default
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="inline-flex items-center gap-1 text-sm font-medium text-kantira-navy-600 hover:text-red-600 disabled:opacity-50"
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
