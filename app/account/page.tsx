import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { requireCustomerContext } from "@/lib/actions/customer-auth";
import { signOut } from "@/app/dashboard/actions";

// Foundation-only customer landing page (Phase 3B). Deliberately not built
// on KantiraShell — that shell's nav (Items, Stores, Accounts, Stock, ...)
// is internal Business OS surface a customer must never see. Browsing,
// cart, checkout, and order history are separate, later work; this page
// only proves the routing/authorization split: a customer identity lands
// here, never in the internal dashboard.
export default async function AccountPage() {
  const ctx = await requireCustomerContext();

  if (ctx.error) {
    // Middleware already guarantees an authenticated session reaches this
    // page, so the only way requireCustomerContext fails here is "this
    // authenticated user has no customer row" (a staff member or an
    // unresolved identity) — send them to /dashboard, which resolves them
    // correctly on its own.
    redirect("/dashboard");
  }

  const { customer } = ctx;

  return (
    <main className="min-h-screen bg-brand-gray">
      <header className="border-b border-kantira-navy-100 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <img
              src="/brand/logos/kantira_mark.svg"
              alt="KANTIRA"
              className="h-9 w-9"
            />
            <p className="text-lg font-bold text-kantira-navy-900">KANTIRA</p>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-kantira-navy-600 hover:bg-kantira-navy-50"
            >
              <LogOut size={16} />
              Sign out
            </button>
          </form>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-xl font-bold text-kantira-navy-900">
          Welcome, {customer.name}
        </h1>
        <p className="mt-2 text-sm text-brand-slate">
          Your KANTIRA account. Browsing, cart, and order history are coming
          soon.
        </p>
      </div>
    </main>
  );
}
