import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function PaginationNav({
  basePath,
  currentPage,
  totalPages,
  extraParams,
}: {
  basePath: string;
  currentPage: number;
  totalPages: number;
  extraParams?: Record<string, string | undefined>;
}) {
  if (totalPages <= 1) return null;

  const hrefFor = (page: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(extraParams ?? {})) {
      if (value) params.set(key, value);
    }
    if (page > 1) params.set("page", String(page));
    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
  };

  return (
    <nav
      aria-label="Pagination"
      className="mt-8 flex items-center justify-center gap-4 text-sm font-medium text-kantira-navy-700"
    >
      {currentPage > 1 ? (
        <Link
          href={hrefFor(currentPage - 1)}
          className="inline-flex items-center gap-1 rounded-lg px-3 py-2 hover:bg-kantira-navy-50"
        >
          <ChevronLeft size={16} />
          Previous
        </Link>
      ) : (
        <span className="inline-flex items-center gap-1 px-3 py-2 text-kantira-navy-300">
          <ChevronLeft size={16} />
          Previous
        </span>
      )}

      <span className="text-brand-slate">
        Page {currentPage} of {totalPages}
      </span>

      {currentPage < totalPages ? (
        <Link
          href={hrefFor(currentPage + 1)}
          className="inline-flex items-center gap-1 rounded-lg px-3 py-2 hover:bg-kantira-navy-50"
        >
          Next
          <ChevronRight size={16} />
        </Link>
      ) : (
        <span className="inline-flex items-center gap-1 px-3 py-2 text-kantira-navy-300">
          Next
          <ChevronRight size={16} />
        </span>
      )}
    </nav>
  );
}
