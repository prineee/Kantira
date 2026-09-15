import test from "node:test";
import assert from "node:assert/strict";
import { validatePackageData } from "./package";

const VALID = { deadWeightKg: 2.5, lengthCm: 30, breadthCm: 20, heightCm: 15 };

test("valid package data is accepted", () => {
  const result = validatePackageData(VALID);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.data, VALID);
  }
});

test("missing dead weight is rejected", () => {
  const result = validatePackageData({ ...VALID, deadWeightKg: null });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /Dead weight/);
});

test("missing length is rejected", () => {
  const result = validatePackageData({ ...VALID, lengthCm: null });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /Length/);
});

test("missing breadth is rejected", () => {
  const result = validatePackageData({ ...VALID, breadthCm: undefined });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /Breadth/);
});

test("missing height (empty string) is rejected", () => {
  const result = validatePackageData({ ...VALID, heightCm: "" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /Height/);
});

test("zero values are rejected", () => {
  assert.equal(validatePackageData({ ...VALID, deadWeightKg: 0 }).ok, false);
  assert.equal(validatePackageData({ ...VALID, lengthCm: 0 }).ok, false);
  assert.equal(validatePackageData({ ...VALID, breadthCm: 0 }).ok, false);
  assert.equal(validatePackageData({ ...VALID, heightCm: 0 }).ok, false);
});

test("negative values are rejected", () => {
  assert.equal(validatePackageData({ ...VALID, deadWeightKg: -1 }).ok, false);
  assert.equal(validatePackageData({ ...VALID, lengthCm: -30 }).ok, false);
});

test("NaN is rejected", () => {
  const result = validatePackageData({ ...VALID, deadWeightKg: NaN });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /valid number/);
});

test("Infinity is rejected", () => {
  assert.equal(validatePackageData({ ...VALID, lengthCm: Infinity }).ok, false);
  assert.equal(validatePackageData({ ...VALID, lengthCm: -Infinity }).ok, false);
});

test("string-encoded numbers are accepted (form input)", () => {
  const result = validatePackageData({
    deadWeightKg: "2.5",
    lengthCm: "30",
    breadthCm: "20",
    heightCm: "15",
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.data, VALID);
});

test("non-numeric string is rejected", () => {
  const result = validatePackageData({ ...VALID, deadWeightKg: "abc" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /valid number/);
});

test("an absurdly large value is rejected as a likely data-entry error", () => {
  const result = validatePackageData({ ...VALID, lengthCm: 100000 });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /data-entry error/);
});

test("partial package data (only one field provided) is rejected, not silently defaulted", () => {
  const result = validatePackageData({
    deadWeightKg: 2.5,
    lengthCm: null,
    breadthCm: null,
    heightCm: null,
  });
  assert.equal(result.ok, false);
});
