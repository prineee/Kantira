export default function CheckoutConfirmationLoading() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <div className="mb-8 flex flex-col items-center">
        <div className="h-10 w-10 animate-pulse rounded-full bg-kantira-navy-100" />
        <div className="mt-3 h-7 w-40 animate-pulse rounded bg-kantira-navy-100" />
      </div>
      <div className="h-40 animate-pulse rounded-card bg-kantira-navy-50" />
    </div>
  );
}
