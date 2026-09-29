import test from "node:test";
import assert from "node:assert/strict";
import { setStorefrontEnabledCore, type SetStorefrontEnabledDeps } from "./actions";
import { parseStorefrontEnabled, storefrontToggleErrorMessage } from "./validation";

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

function makeMockSupabase(rpcResult: { data?: unknown; error: { message: string } | null } = { data: true, error: null }) {
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  const supabase = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return rpcResult;
    },
  };
  return { supabase, rpcCalls };
}

function depsFor(role: string, supabase: unknown): SetStorefrontEnabledDeps {
  return {
    requireOrgContext: (async () =>
      ({
        error: null,
        supabase: supabase as never,
        user: { id: "user-1" } as never,
        profile: { id: "user-1", organization_id: "org-1", role },
      }) as const) as never,
  };
}

test("OWNER enabling calls set_storefront_enabled with only p_enabled", async () => {
  const { supabase, rpcCalls } = makeMockSupabase({ data: true, error: null });
  const result = await setStorefrontEnabledCore(formData({ enabled: "true" }), depsFor("OWNER", supabase));
  assert.deepEqual(result, { error: null, enabled: true });
  assert.deepEqual(rpcCalls, [{ fn: "set_storefront_enabled", args: { p_enabled: true } }]);
});

test("OWNER disabling passes p_enabled false", async () => {
  const { supabase, rpcCalls } = makeMockSupabase({ data: false, error: null });
  const result = await setStorefrontEnabledCore(formData({ enabled: "false" }), depsFor("OWNER", supabase));
  assert.deepEqual(result, { error: null, enabled: false });
  assert.deepEqual(rpcCalls[0]?.args, { p_enabled: false });
});

test("an organization_id smuggled into the form is never forwarded", async () => {
  const { supabase, rpcCalls } = makeMockSupabase();
  await setStorefrontEnabledCore(
    formData({ enabled: "true", organization_id: "99999999-9999-9999-9999-999999999999" }),
    depsFor("OWNER", supabase),
  );
  assert.deepEqual(Object.keys(rpcCalls[0]?.args ?? {}), ["p_enabled"]);
});

for (const role of ["ADMIN", "STORE_MANAGER", "SALES", "STOCK", "ACCOUNTANT", "FRANCHISE"]) {
  test(`${role} is rejected before any database call`, async () => {
    const { supabase, rpcCalls } = makeMockSupabase();
    const result = await setStorefrontEnabledCore(formData({ enabled: "true" }), depsFor(role, supabase));
    assert.match(result.error ?? "", /only the organization owner/i);
    assert.equal(rpcCalls.length, 0);
  });
}

test("unauthenticated / non-staff (customer) sessions are rejected", async () => {
  const deps: SetStorefrontEnabledDeps = {
    requireOrgContext: (async () =>
      ({ error: "No organization found for this account.", supabase: null, user: null, profile: null }) as const) as never,
  };
  const result = await setStorefrontEnabledCore(formData({ enabled: "true" }), deps);
  assert.equal(result.error, "No organization found for this account.");
});

test("a malformed enabled value is rejected without calling the database", async () => {
  const { supabase, rpcCalls } = makeMockSupabase();
  for (const value of ["", "1", "on", "TRUE", "yes"]) {
    const result = await setStorefrontEnabledCore(formData({ enabled: value }), depsFor("OWNER", supabase));
    assert.equal(result.error, "Invalid storefront request.");
  }
  const missing = await setStorefrontEnabledCore(new FormData(), depsFor("OWNER", supabase));
  assert.equal(missing.error, "Invalid storefront request.");
  assert.equal(rpcCalls.length, 0);
});

test("database errors are mapped to safe messages, never echoed raw", async () => {
  const { supabase } = makeMockSupabase({
    data: null,
    error: { message: 'relation "public.organizations" internal detail xyz' },
  });
  const result = await setStorefrontEnabledCore(formData({ enabled: "true" }), depsFor("OWNER", supabase));
  assert.equal(result.error, "Could not update the storefront setting. Please try again.");
  assert.doesNotMatch(result.error ?? "", /relation|xyz/);
});

test("storefrontToggleErrorMessage maps known database errors", () => {
  assert.match(
    storefrontToggleErrorMessage("Another organization is already configured as the public storefront"),
    /another organization/i,
  );
  assert.match(
    storefrontToggleErrorMessage("Only the organization OWNER can change the storefront setting"),
    /only the organization owner/i,
  );
  assert.equal(storefrontToggleErrorMessage(null), "Could not update the storefront setting. Please try again.");
});

test("parseStorefrontEnabled accepts exactly 'true' and 'false'", () => {
  assert.equal(parseStorefrontEnabled(formData({ enabled: "true" })), true);
  assert.equal(parseStorefrontEnabled(formData({ enabled: "false" })), false);
  assert.equal(parseStorefrontEnabled(formData({ enabled: "True" })), null);
  assert.equal(parseStorefrontEnabled(new FormData()), null);
});
