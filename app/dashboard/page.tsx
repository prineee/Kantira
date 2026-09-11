import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut, Store as StoreIcon, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { resolveIdentity } from "@/lib/auth/resolve-identity";
import { signOut } from "./actions";

export default async function DashboardPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // middleware guarantees this shouldn't happen, but keep it explicit
    return null;
  }

  let { data: profile } = await supabase
    .from("profiles")
    .select("id, organization_id, full_name, email, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    const pendingOrgName = (user.user_metadata as { pending_org_name?: string })
      ?.pending_org_name;

    if (pendingOrgName) {
      const { error: rpcError } = await supabase.rpc(
        "create_organization_with_owner",
        { org_name: pendingOrgName },
      );

      if (!rpcError) {
        const refetched = await supabase
          .from("profiles")
          .select("id, organization_id, full_name, email, role")
          .eq("id", user.id)
          .maybeSingle();
        profile = refetched.data;
      }
    }
  }

  if (!profile) {
    // Not a staff account (no profiles row, and pending_org_name bootstrap
    // above either didn't apply or didn't produce one) — check whether this
    // is a customer identity before falling through to the staff-only
    // "no organization found" message below. Customer identity is
    // architecturally separate from staff profiles (0009); a customer must
    // never be routed into the internal Business OS.
    const identity = await resolveIdentity();
    if (identity.kind === "customer") {
      redirect("/account");
    }

    return (
      <main className="flex min-h-screen items-center justify-center bg-brand-navy px-4">
        <div className="w-full max-w-sm rounded-card bg-white p-8 text-center shadow-xl">
          <img
            src="/brand/logos/kantira_mark.svg"
            alt="KANTIRA"
            className="mx-auto mb-4 h-10 w-10"
          />
          <h1 className="text-lg font-bold text-kantira-navy-800">
            No organization found
          </h1>
          <p className="mt-2 text-sm text-brand-slate">
            Your account isn&apos;t linked to a KANTIRA organization yet.
            Contact your administrator.
          </p>
          <form action={signOut} className="mt-6">
            <button
              type="submit"
              className="w-full rounded-card bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-[#0d2350]"
            >
              Sign out
            </button>
          </form>
        </div>
      </main>
    );
  }

  const { data: organization } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("id", profile.organization_id)
    .maybeSingle();

  const { data: stores } = await supabase
    .from("stores")
    .select("id, store_code, store_name, type, city, is_active")
    .order("store_name");

  return (
    <main className="min-h-screen bg-brand-gray">
      <header className="border-b border-kantira-navy-100 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <img
              src="/brand/logos/kantira_mark.svg"
              alt=""
              aria-hidden="true"
              className="h-9 w-9"
            />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-royal">
                KANTIRA Business OS
              </p>
              <h1 className="text-lg font-bold text-kantira-navy-900">
                {organization?.name ?? "—"}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-navy/5 px-3 py-1 text-xs font-semibold text-brand-navy">
              <ShieldCheck size={14} className="text-brand-royal" />
              {profile.role}
            </span>
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
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-8">
        <section className="rounded-card border border-kantira-navy-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <StoreIcon size={18} className="text-brand-royal" />
              <h2 className="text-base font-semibold text-kantira-navy-900">
                Stores
              </h2>
            </div>
            <Link href="/stores" className="text-sm font-medium text-brand-royal">
              Manage stores →
            </Link>
          </div>

          {stores && stores.length > 0 ? (
            <ul className="divide-y divide-kantira-navy-100">
              {stores.map((store) => (
                <li
                  key={store.id}
                  className="flex items-center justify-between py-3"
                >
                  <div>
                    <p className="font-medium text-kantira-navy-900">
                      {store.store_name}
                    </p>
                    <p className="text-xs text-brand-slate">
                      {store.store_code} · {store.type}
                      {store.city ? ` · ${store.city}` : ""}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      store.is_active
                        ? "bg-brand-teal/10 text-brand-teal"
                        : "bg-kantira-navy-50 text-kantira-navy-400"
                    }`}
                  >
                    {store.is_active ? "Active" : "Inactive"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-brand-slate">
              No stores yet.{" "}
              <Link href="/stores" className="font-medium text-brand-royal">
                Add your first store
              </Link>
              .
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
