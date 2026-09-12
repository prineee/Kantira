"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";

// Shared error boundary UI for storefront route segments
// (app/shop/error.tsx, app/categories/error.tsx, app/search/error.tsx,
// app/products/[id]/error.tsx). Next.js requires error.tsx to be a Client
// Component. Deliberately never renders `error.message` — that could be a
// raw Postgres/PostgREST error string, which must never reach a customer.
export function StorefrontError({ reset }: { reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-3 px-6 py-20 text-center">
      <AlertTriangle size={32} className="text-red-500" />
      <p className="text-base font-semibold text-kantira-navy-900">
        Something went wrong
      </p>
      <p className="text-sm text-brand-slate">
        We couldn&apos;t load this page right now. Please try again.
      </p>
      <div className="mt-2 flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-brand-royal px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0f4fd6]"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-lg border border-kantira-navy-200 px-4 py-2 text-sm font-medium text-kantira-navy-700 hover:bg-kantira-navy-50"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
