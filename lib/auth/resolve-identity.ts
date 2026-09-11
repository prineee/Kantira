import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export type UserRole = Database["public"]["Enums"]["user_role"];

export type ResolvedIdentity =
  | { kind: "unauthenticated" }
  | { kind: "staff"; userId: string; organizationId: string; role: UserRole }
  | { kind: "customer"; userId: string; organizationId: string; customerId: string }
  | { kind: "unresolved"; userId: string };

// Minimal fakeable surface of the @supabase/ssr client this module actually
// uses: auth.getUser(), and .from("profiles"|"customers").select().eq().maybeSingle().
export type IdentitySupabaseClient = {
  auth: { getUser: () => PromiseLike<{ data: { user: { id: string } | null } }> };
  from: (table: "profiles" | "customers") => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => { maybeSingle: () => PromiseLike<{ data: Record<string, unknown> | null }> };
    };
  };
};

// Centralized "who is this and what experience do they get" resolution —
// the single place that decides staff vs. customer vs. unresolved, so
// every authenticated entry point (login redirect, OAuth callback,
// middleware's post-auth redirect — all of which already funnel through
// /dashboard) can rely on one answer instead of each route re-deriving it.
//
// Staff (profiles) and customer identity are deliberately two separate,
// mutually exclusive lookups, never merged into one table/role: a customer
// never gets a profiles row, and a staff member is defined by having one
// (0001's user_role enum has no CUSTOMER value, and 0009's customers.
// auth_user_id linkage is intentionally independent of profiles — see
// lib/actions/customer-auth.ts). This never bypasses RLS: profiles_select
// (0001) and customers_select_self (0009) already allow reading exactly
// one's own row unconditionally, so both lookups below are safe under the
// caller's own session with no service-role client involved.
export async function resolveIdentityFrom(
  supabase: IdentitySupabaseClient,
): Promise<ResolvedIdentity> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { kind: "unauthenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile) {
    return {
      kind: "staff",
      userId: user.id,
      organizationId: profile.organization_id as string,
      role: profile.role as UserRole,
    };
  }

  const { data: customer } = await supabase
    .from("customers")
    .select("id, organization_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (customer) {
    return {
      kind: "customer",
      userId: user.id,
      organizationId: customer.organization_id as string,
      customerId: customer.id as string,
    };
  }

  return { kind: "unresolved", userId: user.id };
}

export async function resolveIdentity(): Promise<ResolvedIdentity> {
  // Structurally the real client satisfies IdentitySupabaseClient (it has
  // .auth.getUser() and .from(table).select().eq().maybeSingle()), but its
  // full generic type is too deep for TS to check against a hand-written
  // interface without this — same pattern other server actions in this
  // codebase use when handing the real client to a narrowly-typed helper.
  return resolveIdentityFrom(createClient() as unknown as IdentitySupabaseClient);
}

// Where an authenticated identity's experience lives. "unresolved" (an
// authenticated user with neither a staff profile nor a customer row — e.g.
// a pending invite, or a bare signup before any linkage exists) still
// resolves to /dashboard: that page already renders a safe "no organization
// found" fallback for this exact case, so this never sends an unresolved
// user anywhere that assumes staff or customer data exists.
export function experienceHomeRoute(identity: ResolvedIdentity): string {
  switch (identity.kind) {
    case "unauthenticated":
      return "/login";
    case "customer":
      return "/account";
    case "staff":
    case "unresolved":
      return "/dashboard";
  }
}
