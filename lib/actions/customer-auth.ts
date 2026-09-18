import { createClient } from "@/lib/supabase/server";

// Server Action helper: the customer-identity equivalent of
// lib/actions/auth.ts's requireOrgContext(), for the separate customer
// self-service identity space introduced in migration 0009 (a `customers`
// row linked via auth_user_id, distinct from the staff `profiles` identity
// requireOrgContext resolves). Relies entirely on the existing
// customers_select_self RLS policy (0009) — this never bypasses RLS and
// never uses a service-role client, so a customer can only ever resolve
// their own row.
export async function requireCustomerContext() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated.", supabase: null, user: null, customer: null } as const;
  }

  const { data: customer } = await supabase
    .from("customers")
    .select("id, organization_id, name")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!customer) {
    return {
      error: "No customer profile is linked to this account.",
      supabase: null,
      user: null,
      customer: null,
    } as const;
  }

  return { error: null, supabase, user, customer } as const;
}

type CustomerAuthSupabaseClient = ReturnType<typeof createClient>;

export type BootstrapCustomerIdentityResult = { error: string | null };

// Phase 6B-12: composes the two independently-authorized customer-identity
// RPCs — never a new competing authorization path, never a direct
// `customers` table write. Order matters: claim first (links this auth
// identity to a pre-existing staff-created, unclaimed customer row if one
// matches by confirmed email, via the unmodified claim_customer_identity(),
// 0015), and only create a brand-new row (create_customer_self(), 0031) if
// nothing was claimable. Both RPCs are individually idempotent — safe to
// call this twice for the same identity (e.g. a double form submission).
//
// Deliberately non-enumerating: the caller only ever sees a generic
// success/failure, never which branch resolved the identity — "linked an
// existing record" and "created a new one" are never externally
// distinguishable responses.
export async function bootstrapCustomerIdentity(
  supabase: CustomerAuthSupabaseClient,
  input: { name: string; phone?: string | null },
): Promise<BootstrapCustomerIdentityResult> {
  const { data: claimedId, error: claimError } = await supabase.rpc("claim_customer_identity");
  if (claimError) {
    return { error: "Could not set up your account. Please try again." };
  }
  if (claimedId) {
    return { error: null };
  }

  const { data, error } = await supabase.rpc("create_customer_self", {
    p_name: input.name,
    p_phone: input.phone || undefined,
  });

  if (error || !data || data.length === 0) {
    return { error: "Could not set up your account. Please try again." };
  }

  return { error: null };
}

// Login-time equivalent: only attempts the claim. Never blind-creates a
// new customer row on login — no name has been collected at this point,
// so fabricating one would misrepresent the record. An authenticated user
// with no claimable row and no existing customers row simply has no
// customer context yet (requireCustomerContext() surfaces this exactly as
// it always has); completing /customer/signup is what creates one.
export async function attemptCustomerIdentityClaim(
  supabase: CustomerAuthSupabaseClient,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("claim_customer_identity");
  if (error) {
    return { error: "Could not resolve your account. Please try again." };
  }
  return { error: null };
}
