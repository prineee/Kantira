import Link from "next/link";
import { Pencil } from "lucide-react";
import { getOrgContext } from "@/lib/data/get-org-id";
import { KantiraShell } from "@/components/kantira-shell";
import { signOut } from "@/app/dashboard/actions";
import { createAccount } from "./actions";
import { AccountForm } from "./account-form";
import { cardClass, badgeActiveClass, badgeInactiveClass } from "@/lib/ui/form-classes";

// chart_of_accounts is finance-roles-only end to end: the RLS select policy
// itself restricts rows to OWNER/ADMIN/ACCOUNTANT (0002_phase2_business_core.sql),
// so any other role would just see an empty table via RLS — show an explicit
// access message instead of a confusingly empty page.
const VISIBLE_ROLES = ["OWNER", "ADMIN", "ACCOUNTANT"];

export default async function AccountsPage() {
  const { supabase, profile, organization } = await getOrgContext();
  const canView = VISIBLE_ROLES.includes(profile.role);

  if (!canView) {
    return (
      <KantiraShell
        orgName={organization?.name ?? "—"}
        role={profile.role}
        signOutAction={signOut}
      >
        <section className={cardClass}>
          <h2 className="text-xl font-bold text-kantira-navy-900">
            Chart of accounts
          </h2>
          <p className="mt-2 text-sm text-brand-slate">
            Your role ({profile.role}) does not have access to financial
            accounts.
          </p>
        </section>
      </KantiraShell>
    );
  }

  const { data: accounts } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code, account_name, account_type, normal_balance, control_type, is_active")
    .order("account_code");

  const accountOptions = (accounts ?? []).map((a) => ({
    id: a.id,
    label: `${a.account_code} — ${a.account_name}`,
  }));

  return (
    <KantiraShell
      orgName={organization?.name ?? "—"}
      role={profile.role}
      signOutAction={signOut}
    >
      <div className="mb-6">
        <h2 className="text-xl font-bold text-kantira-navy-900">
          Chart of accounts
        </h2>
        <p className="text-sm text-brand-slate">
          The general ledger structure used by transaction posting.
        </p>
      </div>

      <section className={`${cardClass} mb-8`}>
        <h3 className="mb-4 text-base font-semibold text-kantira-navy-900">
          New account
        </h3>
        <AccountForm mode="create" action={createAccount} accounts={accountOptions} />
      </section>

      <section className={cardClass}>
        <h3 className="mb-4 text-base font-semibold text-kantira-navy-900">
          All accounts
        </h3>
        {accounts && accounts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-kantira-navy-100 text-xs uppercase tracking-wide text-brand-slate">
                  <th className="py-2 pr-4">Code</th>
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Normal balance</th>
                  <th className="py-2 pr-4">Control type</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-kantira-navy-50">
                {accounts.map((a) => (
                  <tr key={a.id}>
                    <td className="py-2.5 pr-4 font-mono text-xs text-kantira-navy-700">
                      {a.account_code}
                    </td>
                    <td className="py-2.5 pr-4 font-medium text-kantira-navy-900">
                      {a.account_name}
                    </td>
                    <td className="py-2.5 pr-4 text-brand-slate">{a.account_type}</td>
                    <td className="py-2.5 pr-4 text-brand-slate">{a.normal_balance}</td>
                    <td className="py-2.5 pr-4 text-brand-slate">
                      {a.control_type === "NONE" ? "—" : a.control_type}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className={a.is_active ? badgeActiveClass : badgeInactiveClass}>
                        {a.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4">
                      <Link
                        href={`/accounts/${a.id}/edit`}
                        className="inline-flex items-center gap-1 text-brand-royal"
                      >
                        <Pencil size={14} />
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-brand-slate">No accounts yet.</p>
        )}
      </section>
    </KantiraShell>
  );
}
