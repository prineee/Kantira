import test from "node:test";
import assert from "node:assert/strict";
import { rupeesToPaise, paiseToRupees } from "./money";

test("rupeesToPaise converts whole and fractional rupee amounts exactly", () => {
  assert.equal(rupeesToPaise(100), 10000);
  assert.equal(rupeesToPaise("100.00"), 10000);
  assert.equal(rupeesToPaise(19.99), 1999);
  assert.equal(rupeesToPaise("19.99"), 1999);
  assert.equal(rupeesToPaise(0.5), 50);
  assert.equal(rupeesToPaise("0.05"), 5);
  assert.equal(rupeesToPaise(0), 0);
});

test("rupeesToPaise never drifts across a large set of two-decimal values (no floating-point error)", () => {
  for (let cents = 0; cents <= 10000; cents += 7) {
    const rupees = (cents / 100).toFixed(2);
    assert.equal(rupeesToPaise(rupees), cents, `mismatch for ${rupees}`);
  }
});

test("rupeesToPaise rejects negative and malformed input", () => {
  assert.throws(() => rupeesToPaise(-1));
  assert.throws(() => rupeesToPaise("-5.00"));
  assert.throws(() => rupeesToPaise("abc"));
  assert.throws(() => rupeesToPaise("12.345"));
});

test("paiseToRupees converts back exactly", () => {
  assert.equal(paiseToRupees(10000), 100);
  assert.equal(paiseToRupees(1999), 19.99);
  assert.equal(paiseToRupees(5), 0.05);
  assert.equal(paiseToRupees(0), 0);
});

test("rupeesToPaise/paiseToRupees round-trip for typical order totals", () => {
  for (const amount of [1, 9.99, 149.5, 999.99, 12345.67]) {
    assert.equal(paiseToRupees(rupeesToPaise(amount)), amount);
  }
});
