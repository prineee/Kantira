import test from "node:test";
import assert from "node:assert/strict";
import { setStorePickupMappingCore, type SetStorePickupMappingDeps } from "./actions";
import type { ShiprocketPickupLocation } from "@/lib/shiprocket/types";

const STORE_ID = "55555555-5555-5555-5555-555555555555";

function pickupLocation(overrides: Partial<ShiprocketPickupLocation> = {}): ShiprocketPickupLocation {
  return {
    id: 12345,
    nickname: "Main Warehouse",
    city: "Patna",
    state: "Bihar",
    country: "India",
    pinCode: "800001",
    status: 1,
    phoneVerified: true,
    ...overrides,
  };
}

/** Minimal fake of the @supabase/ssr query-builder surface actually used by
 * this action: .from("stores").select().eq().maybeSingle(), and .rpc(). */
function makeMockSupabase(options: {
  storeRow: { id: string } | null;
  rpcResult?: { error: unknown };
}) {
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  const supabase = {
    from(_table: string) {
      const result = { data: options.storeRow };
      const builder: PromiseLike<typeof result> & Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => result,
        then(onFulfilled: (v: typeof result) => unknown) {
          return Promise.resolve(result).then(onFulfilled);
        },
      } as never;
      return builder;
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return options.rpcResult ?? { error: null };
    },
  };
  return { supabase, rpcCalls };
}

function makeDeps(overrides: Partial<SetStorePickupMappingDeps> & { supabase?: unknown } = {}) {
  const { supabase: suppliedSupabase, ...rest } = overrides;
  const requireOrgContextMock =
    rest.requireOrgContext ??
    (async () =>
      ({
        error: null,
        supabase: (suppliedSupabase ?? makeMockSupabase({ storeRow: { id: STORE_ID } }).supabase) as never,
        user: { id: "user-1" } as never,
        profile: { id: "user-1", organization_id: "org-1", role: "OWNER" },
      }) as const);

  let listPickupLocationsCalls = 0;
  const listPickupLocationsMock =
    rest.listPickupLocations ??
    (async () => {
      listPickupLocationsCalls++;
      return [pickupLocation()];
    });

  const deps: SetStorePickupMappingDeps = {
    requireOrgContext: requireOrgContextMock,
    listPickupLocations: listPickupLocationsMock,
  };

  return { deps, getListPickupLocationsCalls: () => listPickupLocationsCalls };
}

test("unauthenticated request is rejected before any lookup", async () => {
  const { deps } = makeDeps({
    requireOrgContext: async () => ({ error: "Not authenticated.", supabase: null, user: null, profile: null }) as never,
  });
  const result = await setStorePickupMappingCore(STORE_ID, "12345", deps);
  assert.equal(result.error, "Not authenticated.");
});

test("a non OWNER/ADMIN staff role is rejected", async () => {
  const { deps } = makeDeps({
    requireOrgContext: async () =>
      ({
        error: null,
        supabase: makeMockSupabase({ storeRow: { id: STORE_ID } }).supabase as never,
        user: { id: "user-1" } as never,
        profile: { id: "user-1", organization_id: "org-1", role: "SALES" },
      }) as const,
  });
  const result = await setStorePickupMappingCore(STORE_ID, "12345", deps);
  assert.match(result.error ?? "", /permission/i);
});

test("a store not visible under RLS (wrong org or nonexistent) is rejected, indistinguishably", async () => {
  const { supabase } = makeMockSupabase({ storeRow: null });
  const { deps } = makeDeps({ supabase });
  const result = await setStorePickupMappingCore(STORE_ID, "12345", deps);
  assert.match(result.error ?? "", /not found/i);
});

test("no provider location selected is rejected before any Shiprocket lookup", async () => {
  const { deps, getListPickupLocationsCalls } = makeDeps();
  const result = await setStorePickupMappingCore(STORE_ID, "", deps);
  assert.match(result.error ?? "", /select a pickup location/i);
  assert.equal(getListPickupLocationsCalls(), 0);
});

test("a provider location id absent from Shiprocket's live list is rejected, never trusted from the client alone", async () => {
  const { deps } = makeDeps({
    listPickupLocations: async () => [pickupLocation({ id: 99999 })],
  });
  const result = await setStorePickupMappingCore(STORE_ID, "12345", deps);
  assert.match(result.error ?? "", /no longer available/i);
});

test("a Shiprocket lookup failure is surfaced safely, never thrown past the action", async () => {
  const { deps } = makeDeps({
    listPickupLocations: async () => {
      throw new Error("network down");
    },
  });
  const result = await setStorePickupMappingCore(STORE_ID, "12345", deps);
  assert.match(result.error ?? "", /could not load/i);
});

test("a valid, matching provider location reaches the RPC with exactly the matched id/name — and only the mocked lookup was ever called", async () => {
  const { supabase, rpcCalls } = makeMockSupabase({ storeRow: { id: STORE_ID } });
  let listPickupLocationsCalls = 0;
  const deps: SetStorePickupMappingDeps = {
    requireOrgContext: async () =>
      ({
        error: null,
        supabase: supabase as never,
        user: { id: "user-1" } as never,
        profile: { id: "user-1", organization_id: "org-1", role: "ADMIN" },
      }) as const,
    listPickupLocations: async () => {
      listPickupLocationsCalls++;
      return [pickupLocation({ id: 777, nickname: "Warehouse B" })];
    },
  };

  const result = await setStorePickupMappingCore(STORE_ID, "777", deps);

  assert.equal(result.error, null);
  assert.equal(result.success, true);
  assert.equal(listPickupLocationsCalls, 1);
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0]!.fn, "set_store_pickup_mapping");
  assert.equal(rpcCalls[0]!.args.p_store_id, STORE_ID);
  assert.equal(rpcCalls[0]!.args.p_provider_location_id, "777");
  assert.equal(rpcCalls[0]!.args.p_provider_location_name, "Warehouse B");
});

test("an RPC-level rejection (e.g. cross-org store, invalid data) is surfaced as an error, not silently swallowed", async () => {
  const { supabase } = makeMockSupabase({
    storeRow: { id: STORE_ID },
    rpcResult: { error: { message: "Store not found in this organization" } },
  });
  const { deps } = makeDeps({ supabase });
  const result = await setStorePickupMappingCore(STORE_ID, "12345", deps);
  assert.match(result.error ?? "", /not found/i);
});
