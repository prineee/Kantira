import test from "node:test";
import assert from "node:assert/strict";
import { placeCodOrderAction } from "./cod-actions";

// The actual placement/idempotency/auto-confirm behavior lives in
// place_cod_order() (migration 0024) and is verified against a real local
// Postgres instance (see this session's migration verification notes:
// COD auto-confirms exactly once, a double-click/refresh returns the same
// order, cross-customer access is denied). This test only covers the
// input guard that runs before any Supabase call.
test("rejects an invalid checkout session id before any I/O", async () => {
  const result = await placeCodOrderAction("not-a-uuid");
  assert.equal(result.ok, false);
});
