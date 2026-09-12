export default function CartLoading() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6 h-7 w-32 animate-pulse rounded bg-kantira-navy-100" />
      <div className="rounded-card border border-kantira-navy-100 bg-white p-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 py-5">
            <div className="h-20 w-20 animate-pulse rounded-lg bg-kantira-navy-50" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/2 animate-pulse rounded bg-kantira-navy-100" />
              <div className="h-3 w-1/3 animate-pulse rounded bg-kantira-navy-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
