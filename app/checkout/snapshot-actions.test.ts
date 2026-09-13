import test from "node:test";
import assert from "node:assert/strict";
import { createCheckoutSessionAction } from "./snapshot-actions";

// These exercise only the input-shape guards that run BEFORE any
// Supabase/network call — the same "never trust browser input" boundary
// this action's own comment documents. Everything past these guards
// (fulfillment resolution, fresh shipping quote, snapshot pricing) is
// verified against a real local Postgres instance (see this session's
// migration verification notes) and by the RPC's own SQL — not re-mocked
// here, per the brief's "do not replace meaningful tests with superficial
// mocks" instruction.

test("rejects an invalid address id before any I/O", async () => {
  const result = await createCheckoutSessionAction({
    addressId: "not-a-uuid",
    courierId: "1",
    paymentMethod: "COD",
    idempotencyKey: "key-1",
  });
  assert.equal(result.ok, false);
});

test("rejects a missing courier selection", async () => {
  const result = await createCheckoutSessionAction({
    addressId: "123e4567-e89b-12d3-a456-426614174000",
    courierId: "",
    paymentMethod: "COD",
    idempotencyKey: "key-1",
  });
  assert.equal(result.ok, false);
});

test("rejects an invalid payment method", async () => {
  const result = await createCheckoutSessionAction({
    addressId: "123e4567-e89b-12d3-a456-426614174000",
    courierId: "1",
    // @ts-expect-error deliberately invalid at the type level too
    paymentMethod: "BITCOIN",
    idempotencyKey: "key-1",
  });
  assert.equal(result.ok, false);
});

test("rejects a missing idempotency key", async () => {
  const result = await createCheckoutSessionAction({
    addressId: "123e4567-e89b-12d3-a456-426614174000",
    courierId: "1",
    paymentMethod: "COD",
    idempotencyKey: "",
  });
  assert.equal(result.ok, false);
});
