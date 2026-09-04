import test from "node:test";
import assert from "node:assert/strict";
import { calculateTotalShipmentWeightKg } from "./weight";

test("single item, single quantity", () => {
  const result = calculateTotalShipmentWeightKg([{ weightKg: 0.35, quantity: 1 }]);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.totalWeightKg, 0.35);
});

test("single item, multiple quantities", () => {
  const result = calculateTotalShipmentWeightKg([{ weightKg: 0.35, quantity: 3 }]);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.totalWeightKg, 1.05);
});

test("multiple items", () => {
  const result = calculateTotalShipmentWeightKg([
    { weightKg: 0.35, quantity: 2 }, // 0.70
    { weightKg: 1.2, quantity: 1 }, // 1.20
  ]);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.totalWeightKg, 1.9);
});

test("decimal precision: no floating-point drift across many lines", () => {
  // Classic float trap: 0.1 + 0.2 !== 0.3 in IEEE-754. Gram-integer
  // arithmetic must sidestep it entirely.
  const lines = Array.from({ length: 10 }, () => ({ weightKg: 0.1, quantity: 1 }));
  const result = calculateTotalShipmentWeightKg(lines);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.totalWeightKg, 1.0);
});

test("gram-level precision is preserved exactly", () => {
  const result = calculateTotalShipmentWeightKg([{ weightKg: 0.001, quantity: 7 }]);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.totalWeightKg, 0.007);
});

test("missing (null) weight blocks the calculation", () => {
  const result = calculateTotalShipmentWeightKg([{ weightKg: null, quantity: 1 }]);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /not configured/);
});

test("zero weight is rejected for shipping purposes", () => {
  const result = calculateTotalShipmentWeightKg([{ weightKg: 0, quantity: 1 }]);
  assert.equal(result.ok, false);
});

test("negative weight is rejected", () => {
  const result = calculateTotalShipmentWeightKg([{ weightKg: -0.5, quantity: 1 }]);
  assert.equal(result.ok, false);
});

test("a single missing-weight line blocks the whole cart, even with other valid lines", () => {
  const result = calculateTotalShipmentWeightKg([
    { weightKg: 0.35, quantity: 1 },
    { weightKg: null, quantity: 1 },
  ]);
  assert.equal(result.ok, false);
});

test("invalid quantity (zero) is rejected", () => {
  const result = calculateTotalShipmentWeightKg([{ weightKg: 0.35, quantity: 0 }]);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /quantity/i);
});

test("invalid quantity (non-integer) is rejected", () => {
  const result = calculateTotalShipmentWeightKg([{ weightKg: 0.35, quantity: 1.5 }]);
  assert.equal(result.ok, false);
});

test("invalid quantity (negative) is rejected", () => {
  const result = calculateTotalShipmentWeightKg([{ weightKg: 0.35, quantity: -2 }]);
  assert.equal(result.ok, false);
});

test("empty cart is rejected", () => {
  const result = calculateTotalShipmentWeightKg([]);
  assert.equal(result.ok, false);
});
