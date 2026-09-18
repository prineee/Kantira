"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { attemptCustomerIdentityClaim } from "@/lib/actions/customer-auth";

export type CustomerSignInState = { error: string | null };

// Customer-facing login (Phase 6B-12). Deliberately separate from
// app/login/actions.ts (staff) — this never redirects to /dashboard,
// always /account, regardless of whether a customer row exists yet
// (requireCustomerContext() on /account surfaces that exactly as it
// always has, unchanged).
//
// Login-time only attempts the existing claim_customer_identity() — see
// attemptCustomerIdentityClaim()'s own comment for why this never
// blind-creates a customer row the way signup's bootstrap can: no name has
// been collected here to create one with.
export async function customerSignIn(
  _prevState: CustomerSignInState,
  formData: FormData,
): Promise<CustomerSignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  await attemptCustomerIdentityClaim(supabase);

  redirect("/account");
}
