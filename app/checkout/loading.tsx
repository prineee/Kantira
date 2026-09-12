export default function CheckoutLoading() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 h-7 w-32 animate-pulse rounded bg-kantira-navy-100" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-card bg-kantira-navy-50" />
          ))}
        </div>
        <div className="h-48 animate-pulse rounded-card bg-kantira-navy-50" />
      </div>
    </div>
  );
}
