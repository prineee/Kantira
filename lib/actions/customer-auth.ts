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
