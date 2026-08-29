import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Server Component helper: derives the current user's profile/org strictly
// from the authenticated session (never from client input), mirroring the
// lookup app/dashboard/page.tsx already performs. Used by every Phase 2 page
// that needs to know "who is asking" before querying org-scoped data.
export async function getOrgContext() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, organization_id, full_name, email, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    redirect("/dashboard");
  }

  const { data: organization } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("id", profile.organization_id)
    .maybeSingle();

  return { supabase, user, profile, organization };
}
