export default function CategoriesLoading() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-8 h-7 w-40 animate-pulse rounded bg-kantira-navy-100" />
      <div className="space-y-3 rounded-card border border-kantira-navy-100 bg-brand-gray p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-8 animate-pulse rounded bg-kantira-navy-50" />
        ))}
      </div>
    </div>
  );
}
