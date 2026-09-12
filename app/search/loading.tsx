export default function SearchLoading() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-6 h-7 w-32 animate-pulse rounded bg-kantira-navy-100" />
      <div className="mb-8 h-10 max-w-xl animate-pulse rounded-lg bg-kantira-navy-100" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="aspect-[3/4] animate-pulse rounded-card bg-kantira-navy-50"
          />
        ))}
      </div>
    </div>
  );
}
