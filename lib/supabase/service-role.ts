import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// NARROW, JUSTIFIED EXCEPTION — read this before adding another call site.
//
// Every other server-side Supabase client in this codebase
// (lib/supabase/server.ts) is cookie/session-based and always resolves to
// either `anon` or `authenticated` with a real auth.uid() — RLS is the
// authorization boundary for all of it. This file is the one deliberate
// exception, and it exists for exactly one reason: a provider webhook
// (app/api/webhooks/razorpay/route.ts, app/api/webhooks/shiprocket/route.ts)
// is a server-to-server HTTP call with no Supabase session, no cookies, and
// no auth.uid() at all — there is no user identity to authorize against.
// Its authorization mechanism is entirely different: Razorpay's is an HMAC
// signature over the raw request body (RAZORPAY_WEBHOOK_SECRET,
// lib/razorpay/signature.ts); Shiprocket's is a shared-secret header
// compare (SHIPROCKET_WEBHOOK_SECRET, lib/shiprocket/webhook.ts) — verified
// in either case BEFORE this client is ever touched. Once that verification
// passes, the request is treated as genuinely originating from the
// provider, and the only remaining question is "can Postgres tell this
// apart from a real user?" — it can't, so this uses the service_role key
// specifically so the relevant `coalesce(auth.role(), 'anon') =
// 'service_role'` branch runs (confirm_razorpay_payment_and_finalize,
// migration 0024; record_shipment_webhook_event, migration 0028), the exact
// pattern already established by auto_allocate_online_order_store()
// (migration 0015) for the same class of "trusted non-user caller" problem.
//
// Rules for this client:
//   1. Only ever constructed inside a provider webhook route, after that
//      provider's own authenticity check has already succeeded.
//   2. Never passed to, or reachable from, any customer-facing page,
//      Server Action, or component.
//   3. Never used to read/write anything beyond what the webhook handler
//      itself needs (payment_events insert, and the two RPCs designed for
//      this exact caller) — never a general-purpose "bypass RLS" escape
//      hatch for unrelated code.
//   4. SUPABASE_SERVICE_ROLE_KEY must only ever be read here.
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — cannot process webhook.",
    );
  }

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
