"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SignUpState = {
  error: string | null;
  checkEmail: boolean;
};

export async function signUp(
  _prevState: SignUpState,
  formData: FormData,
): Promise<SignUpState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const orgName = String(formData.get("orgName") ?? "").trim();

  if (!email || !password || !orgName) {
    return { error: "All fields are required.", checkEmail: false };
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
      data: { pending_org_name: orgName },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    return { error: error.message, checkEmail: false };
  }

  // Email confirmation disabled on this project: session is active now,
  // so we can bootstrap the organization immediately.
  if (data.session) {
    const { error: rpcError } = await supabase.rpc(
      "create_organization_with_owner",
      { org_name: orgName },
    );
    if (rpcError) {
      return { error: rpcError.message, checkEmail: false };
    }
    redirect("/dashboard");
  }

  // Email confirmation required: org gets bootstrapped on first
  // authenticated visit to /dashboard, using the pending_org_name we
  // stashed in user metadata above.
  return { error: null, checkEmail: true };
}
