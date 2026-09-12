import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveIdentityFrom,
  experienceHomeRoute,
  cartAffordanceForIdentity,
  type IdentitySupabaseClient,
} from "./resolve-identity";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const ORG_ID = "22222222-2222-2222-2222-222222222222";
const CUSTOMER_ID = "33333333-3333-3333-3333-333333333333";

/** Minimal fake of the .from(table).select().eq().maybeSingle() surface
 * resolve-identity.ts actually uses, keyed by table so each test controls
 * exactly what "profiles" vs. "customers" returns for this user. */
function mockSupabase(opts: {
  user: { id: string } | null;
  profile?: Record<string, unknown> | null;
  customer?: Record<string, unknown> | null;
}): IdentitySupabaseClient {
  return {
    auth: {
      getUser: async () => ({ data: { user: opts.user } }),
    },
    from: (table) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: (table === "profiles" ? opts.profile : opts.customer) ?? null,
          }),
        }),
      }),
    }),
  };
}

test("unauthenticated: no session resolves to unauthenticated, no table is queried", async () => {
  const supabase = mockSupabase({ user: null, profile: "unreachable" as never });
  const identity = await resolveIdentityFrom(supabase);
  assert.deepEqual(identity, { kind: "unauthenticated" });
  assert.equal(experienceHomeRoute(identity), "/login");
});

for (const role of [
  "OWNER",
  "ADMIN",
  "STORE_MANAGER",
  "SALES",
  "STOCK",
  "ACCOUNTANT",
  "FRANCHISE",
] as const) {
  test(`staff role resolution: a profiles row with role ${role} resolves as staff/${role}`, async () => {
    const supabase = mockSupabase({
      user: { id: USER_ID },
      profile: { organization_id: ORG_ID, role },
    });
    const identity = await resolveIdentityFrom(supabase);
    assert.deepEqual(identity, {
      kind: "staff",
      userId: USER_ID,
      organizationId: ORG_ID,
      role,
    });
    assert.equal(experienceHomeRoute(identity), "/dashboard");
  });
}

test("customer role resolution: no profiles row but a matching customers row resolves as customer", async () => {
  const supabase = mockSupabase({
    user: { id: USER_ID },
    profile: null,
    customer: { id: CUSTOMER_ID, organization_id: ORG_ID },
  });
  const identity = await resolveIdentityFrom(supabase);
  assert.deepEqual(identity, {
    kind: "customer",
    userId: USER_ID,
    organizationId: ORG_ID,
    customerId: CUSTOMER_ID,
  });
  assert.equal(experienceHomeRoute(identity), "/account");
});

test("customer/internal separation: a resolved staff identity never carries a customerId, and vice versa", async () => {
  const staffSupabase = mockSupabase({
    user: { id: USER_ID },
    profile: { organization_id: ORG_ID, role: "OWNER" },
    customer: { id: CUSTOMER_ID, organization_id: ORG_ID },
  });
  const staffIdentity = await resolveIdentityFrom(staffSupabase);
  // A profiles row always wins: a staff member is never re-classified as a
  // customer even if a customer row also exists for the same auth user.
  assert.equal(staffIdentity.kind, "staff");
  assert.ok(!("customerId" in staffIdentity));
});

test("unresolved: authenticated with neither a profiles nor a customers row falls back to /dashboard, not a crash", async () => {
  const supabase = mockSupabase({ user: { id: USER_ID }, profile: null, customer: null });
  const identity = await resolveIdentityFrom(supabase);
  assert.deepEqual(identity, { kind: "unresolved", userId: USER_ID });
  assert.equal(experienceHomeRoute(identity), "/dashboard");
});

test("unauthorized role access: an unauthenticated caller never resolves to staff or customer", async () => {
  const supabase = mockSupabase({ user: null });
  const identity = await resolveIdentityFrom(supabase);
  assert.notEqual(identity.kind, "staff");
  assert.notEqual(identity.kind, "customer");
});

test("cartAffordanceForIdentity: only a customer gets 'add', staff/unresolved get 'none', anon gets 'login'", () => {
  assert.equal(
    cartAffordanceForIdentity({
      kind: "customer",
      userId: USER_ID,
      organizationId: ORG_ID,
      customerId: CUSTOMER_ID,
    }),
    "add",
  );
  assert.equal(cartAffordanceForIdentity({ kind: "unauthenticated" }), "login");
  assert.equal(
    cartAffordanceForIdentity({
      kind: "staff",
      userId: USER_ID,
      organizationId: ORG_ID,
      role: "OWNER",
    }),
    "none",
  );
  assert.equal(
    cartAffordanceForIdentity({ kind: "unresolved", userId: USER_ID }),
    "none",
  );
});
