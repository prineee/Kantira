import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { getOrgContext } from "@/lib/data/get-org-id";
import { KantiraShell } from "@/components/kantira-shell";
import { signOut } from "@/app/dashboard/actions";
import { cardClass } from "@/lib/ui/form-classes";
import { canToggleStorefront, canViewStorefrontSettings } from "@/lib/storefront/permissions";
import { loadStorefrontSetupRows } from "@/lib/data/storefront-setup";
import {
  buildStorefrontSetupChecklist,
  deriveStorefrontSetupFacts,
  type ChecklistEntry,
} from "@/lib/storefront/setup-checklist";
import { StorefrontToggle } from "./storefront-toggle";

function ChecklistSection({
  title,
  ready,
  readyLabel,
  notReadyLabel,
  entries,
}: {
  title: string;
  ready: boolean;
  readyLabel: string;
  notReadyLabel: string;
  entries: ChecklistEntry[];
}) {
  return (
    <section className={cardClass}>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h3 className="text-base font-semibold text-kantira-navy-900">{title}</h3>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            ready ? "bg-brand-teal/10 text-brand-teal" : "bg-amber-50 text-amber-600"
          }`}
        >
          {ready ? readyLabel : notReadyLabel}
        </span>
      </div>
      <ul className="space-y-3">
        {entries.map((entry) => (
          <li key={entry.key} className="flex items-start gap-3">
            {entry.done ? (
              <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-brand-teal" aria-label="Done" />
            ) : (
              <Circle size={18} className="mt-0.5 shrink-0 text-kantira-navy-300" aria-label="Not done" />
            )}
            <div>
              <p className="text-sm font-medium text-kantira-navy-900">{entry.label}</p>
              <p className="text-xs text-brand-slate">{entry.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function StorefrontSettingsPage() {
  const { supabase, profile, organization } = await getOrgContext();

  if (!canViewStorefrontSettings(profile.role) || !organization) {
    return (
      <KantiraShell orgName={organization?.name ?? "—"} role={profile.role} signOutAction={signOut}>
        <section className={cardClass}>
          <p className="text-sm text-brand-slate">
            Your role ({profile.role}) does not have access to storefront settings.
          </p>
        </section>
      </KantiraShell>
    );
  }

  const rows = await loadStorefrontSetupRows(supabase, organization.id);
  const facts = deriveStorefrontSetupFacts(rows);
  const checklist = buildStorefrontSetupChecklist(facts);
  const enabled = facts.storefrontEnabled;
  const canToggle = canToggleStorefront(profile.role);

  return (
    <KantiraShell orgName={organization.name ?? "—"} role={profile.role} signOutAction={signOut}>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-kantira-navy-900">KANTIRA Storefront</h2>
        <p className="text-sm text-brand-slate">
          Control what customers see at kantira.in.
        </p>
      </div>

      <section className={`${cardClass} mb-6`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-slate">Status</p>
            <p className="mt-1 flex items-center gap-2 text-lg font-bold text-kantira-navy-900">
              <span
                aria-hidden="true"
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  enabled ? "bg-brand-teal" : "bg-kantira-navy-300"
                }`}
              />
              {enabled ? "ON" : "OFF"}
            </p>
          </div>
          {canToggle ? (
            <StorefrontToggle enabled={enabled} />
          ) : (
            <p className="text-sm text-brand-slate">Only the organization owner can change this.</p>
          )}
        </div>
        <p className="mt-4 text-sm text-brand-slate">
          Turning on the storefront makes eligible KANTIRA catalogue products visible to
          customers at kantira.in. A product is eligible when it is both{" "}
          <span className="font-medium text-kantira-navy-800">Active</span> and{" "}
          <span className="font-medium text-kantira-navy-800">Published</span> — publish
          products from each item&apos;s edit page in{" "}
          <Link href="/items" className="font-medium text-brand-royal">
            Items
          </Link>
          .
        </p>
        <p className="mt-2 text-xs text-brand-slate">
          Storefront ON means the public catalogue is enabled. It does not mean checkout is
          ready — see the checkout checklist below.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChecklistSection
          title="Catalogue"
          ready={checklist.catalogueReady}
          readyLabel="Catalogue ready"
          notReadyLabel="Catalogue not ready"
          entries={checklist.catalogue}
        />
        <ChecklistSection
          title="Checkout"
          ready={checklist.checkoutReady}
          readyLabel="Checkout ready"
          notReadyLabel="Checkout not ready"
          entries={checklist.checkout}
        />
      </div>
    </KantiraShell>
  );
}
