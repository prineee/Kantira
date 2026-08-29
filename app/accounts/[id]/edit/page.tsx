import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/data/get-org-id";
import { KantiraShell } from "@/components/kantira-shell";
import { signOut } from "@/app/dashboard/actions";
import { updateAccount } from "../../actions";
import { AccountForm } from "../../account-form";
import { cardClass } from "@/lib/ui/form-classes";

const VISIBLE_ROLES = ["OWNER", "ADMIN", "ACCOUNTANT"];

export default async function EditAccountPage({
  params,
}: {
  params: { id: string };
}) {
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
          <p className="text-sm text-brand-slate">
            Your role ({profile.role}) does not have access to financial
            accounts.
          </p>
        </section>
      </KantiraShell>
    );
  }

  const [{ data: account }, { data: accounts }] = await Promise.all([
    supabase
      .from("chart_of_accounts")
      .select(
        "id, account_code, account_name, account_type, control_type, parent_account_id, is_active",
      )
      .eq("id", params.id)
      .maybeSingle(),
    supabase
      .from("chart_of_accounts")
      .select("id, account_code, account_name")
      .neq("id", params.id)
      .order("account_code"),
  ]);

  if (!account) {
    notFound();
  }

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
        <Link href="/accounts" className="text-sm font-medium text-brand-royal">
          ← Back to accounts
        </Link>
        <h2 className="mt-2 text-xl font-bold text-kantira-navy-900">
          Edit account
        </h2>
      </div>

      <section className={cardClass}>
        <AccountForm
          mode="edit"
          action={updateAccount.bind(null, account.id)}
          accounts={accountOptions}
          initial={{
            account_code: account.account_code,
            account_name: account.account_name,
            account_type: account.account_type,
            control_type: account.control_type,
            parent_account_id: account.parent_account_id ?? "",
            is_active: account.is_active,
          }}
        />
      </section>
    </KantiraShell>
  );
}
