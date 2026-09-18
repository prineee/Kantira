import test from "node:test";
import assert from "node:assert/strict";
import { attemptCustomerIdentityClaim, bootstrapCustomerIdentity } from "./customer-auth";

// The actual authorization/org-derivation/idempotency behavior of
// claim_customer_identity() and create_customer_self() lives in the
// database (migrations 0015 and 0031) and is verified against a real local
// Postgres instance in supabase/tests/0031_customer_self_registration_security.sql.
// These tests only cover the claim-first/create-fallback ORCHESTRATION —
// that bootstrapCustomerIdentity() calls the two RPCs in the right order,
// short-circuits on a successful claim, and never calls create_customer_self()
// when it shouldn't — using a minimal fake client, not a real database.

type RpcCall = { fn: string; args?: Record<string, unknown> };

function makeFakeSupabase(responses: Record<string, { data: unknown; error: unknown }>) {
  const calls: RpcCall[] = [];
  return {
    calls,
    client: {
      rpc: async (fn: string, args?: Record<string, unknown>) => {
        calls.push({ fn, args });
        return responses[fn] ?? { data: null, error: null };
      },
    },
  };
}

test("bootstrapCustomerIdentity: a successful claim short-circuits before create_customer_self", async () => {
  const fake = makeFakeSupabase({
    claim_customer_identity: { data: "11111111-1111-1111-1111-111111111111", error: null },
  });

  const result = await bootstrapCustomerIdentity(fake.client as never, { name: "Asha" });

  assert.equal(result.error, null);
  assert.deepEqual(
    fake.calls.map((c) => c.fn),
    ["claim_customer_identity"],
  );
});

test("bootstrapCustomerIdentity: no claimable customer falls back to create_customer_self", async () => {
  const fake = makeFakeSupabase({
    claim_customer_identity: { data: null, error: null },
    create_customer_self: {
      data: [{ out_customer_id: "22222222-2222-2222-2222-222222222222", out_created: true }],
      error: null,
    },
  });

  const result = await bootstrapCustomerIdentity(fake.client as never, {
    name: "Asha",
    phone: "9990001111",
  });

  assert.equal(result.error, null);
  assert.deepEqual(
    fake.calls.map((c) => c.fn),
    ["claim_customer_identity", "create_customer_self"],
  );
  assert.deepEqual(fake.calls[1]!.args, { p_name: "Asha", p_phone: "9990001111" });
});

test("bootstrapCustomerIdentity: a claim RPC error surfaces as a generic error, never calls create_customer_self", async () => {
  const fake = makeFakeSupabase({
    claim_customer_identity: { data: null, error: { message: "db exploded" } },
  });

  const result = await bootstrapCustomerIdentity(fake.client as never, { name: "Asha" });

  assert.notEqual(result.error, null);
  assert.doesNotMatch(result.error ?? "", /db exploded/);
  assert.deepEqual(
    fake.calls.map((c) => c.fn),
    ["claim_customer_identity"],
  );
});

test("bootstrapCustomerIdentity: a create_customer_self failure surfaces as a generic error", async () => {
  const fake = makeFakeSupabase({
    claim_customer_identity: { data: null, error: null },
    create_customer_self: { data: null, error: { message: "constraint violated" } },
  });

  const result = await bootstrapCustomerIdentity(fake.client as never, { name: "Asha" });

  assert.notEqual(result.error, null);
  assert.doesNotMatch(result.error ?? "", /constraint violated/);
});

test("attemptCustomerIdentityClaim: only ever calls claim_customer_identity", async () => {
  const fake = makeFakeSupabase({
    claim_customer_identity: { data: null, error: null },
  });

  const result = await attemptCustomerIdentityClaim(fake.client as never);

  assert.equal(result.error, null);
  assert.deepEqual(
    fake.calls.map((c) => c.fn),
    ["claim_customer_identity"],
  );
});

test("attemptCustomerIdentityClaim: an RPC error surfaces as a generic error", async () => {
  const fake = makeFakeSupabase({
    claim_customer_identity: { data: null, error: { message: "db exploded" } },
  });

  const result = await attemptCustomerIdentityClaim(fake.client as never);

  assert.notEqual(result.error, null);
  assert.doesNotMatch(result.error ?? "", /db exploded/);
});
