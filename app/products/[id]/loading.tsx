export default function ProductDetailLoading() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-6 h-5 w-28 animate-pulse rounded bg-kantira-navy-100" />
      <div className="grid gap-8 sm:grid-cols-2">
        <div className="aspect-square w-full animate-pulse rounded-card bg-kantira-navy-50" />
        <div className="space-y-3">
          <div className="h-4 w-24 animate-pulse rounded bg-kantira-navy-100" />
          <div className="h-7 w-64 animate-pulse rounded bg-kantira-navy-100" />
          <div className="h-4 w-32 animate-pulse rounded bg-kantira-navy-100" />
          <div className="h-9 w-40 animate-pulse rounded bg-kantira-navy-100" />
        </div>
      </div>
    </div>
  );
}
