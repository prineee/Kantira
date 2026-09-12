import { Search } from "lucide-react";
import { inputClass } from "@/lib/ui/form-classes";

// Plain GET form — no client JS needed. Submitting re-renders /search with
// ?q=..., matching how every other list page in this app already prefers
// server-rendered state over client-side fetches.
export function SearchForm({ defaultValue = "" }: { defaultValue?: string }) {
  return (
    <form action="/search" method="get" className="flex gap-2">
      <label htmlFor="storefront-search" className="sr-only">
        Search products
      </label>
      <input
        id="storefront-search"
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder="Search products, SKU, or category..."
        className={inputClass}
      />
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 rounded-lg bg-brand-royal px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0f4fd6]"
      >
        <Search size={16} />
        Search
      </button>
    </form>
  );
}
