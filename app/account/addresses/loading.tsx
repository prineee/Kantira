export default function AddressesLoading() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6 h-7 w-48 animate-pulse rounded bg-kantira-navy-100" />
      <div className="space-y-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-card bg-kantira-navy-50" />
        ))}
      </div>
    </div>
  );
}
