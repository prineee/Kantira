import { createClient } from "@/lib/supabase/server";

// Server Action helper: the write-path equivalent of lib/data/get-org-id.ts.
// Every Phase 2 mutation calls this first and derives organization_id/role
// from the authenticated session server-side — forms never submit an
// organization_id, and none of these mutations trust one from the client.
// (Every RLS-guarded insert also relies on organization_id/created_by
// defaulting to current_org_id()/auth.uid() at the database layer; this
// helper only ever informs UI-level messaging and role gating.)
export async function requireOrgContext() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated.", supabase: null, user: null, profile: null } as const;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, organization_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    return {
      error: "No organization found for this account.",
      supabase: null,
      user: null,
      profile: null,
    } as const;
  }

  return { error: null, supabase, user, profile } as const;
}
