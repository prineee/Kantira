"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { bootstrapCustomerIdentity } from "@/lib/actions/customer-auth";

export type CustomerSignUpState = {
  error: string | null;
  checkEmail: boolean;
};

// Customer-facing signup (Phase 6B-12). Deliberately separate from
// app/signup/actions.ts (staff): this NEVER calls
// create_organization_with_owner(), never creates a profiles row, never
// assigns a user_role. Only Supabase Auth + the customer-identity RPCs
// composed by bootstrapCustomerIdentity() are involved.
//
// When email confirmation is disabled (this project's current
// configuration — see supabase/config.toml's `enable_confirmations =
// false` and the identical assumption app/signup/actions.ts already makes)
// auth.signUp() returns an active session immediately, so the
// claim-first/create-fallback bootstrap runs right here before ever
// redirecting to /account. If confirmation were required instead,
// pending_customer_name/_phone are stashed in the same way
// pending_org_name already is for staff signup — app/dashboard/page.tsx's
// existing post-confirmation bootstrap step (the only place a confirmation
// link's /auth/callback redirect currently lands) picks it up from there.
export async function customerSignUp(
  _prevState: CustomerSignUpState,
  formData: FormData,
): Promise<CustomerSignUpState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (!email || !password || !name) {
    return { error: "Name, email, and password are required.", checkEmail: false };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters.", checkEmail: false };
  }

  const origin = headers().get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const supabase = createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { pending_customer_name: name, pending_customer_phone: phone || null },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    return { error: error.message, checkEmail: false };
  }

  if (data.session) {
    const bootstrapResult = await bootstrapCustomerIdentity(supabase, { name, phone });
    if (bootstrapResult.error) {
      return { error: bootstrapResult.error, checkEmail: false };
    }
    redirect("/account");
  }

  return { error: null, checkEmail: true };
}
