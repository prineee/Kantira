import test from "node:test";
import assert from "node:assert/strict";
import { CATALOGUE_SHADES } from "./shade-reference";

test("shade codes are unique, positive integers in ascending order", () => {
  const codes = CATALOGUE_SHADES.map((s) => s.code);
  assert.equal(new Set(codes).size, codes.length);
  for (const code of codes) assert.ok(Number.isInteger(code) && code > 0, String(code));
  assert.deepEqual(codes, [...codes].sort((a, b) => a - b));
});

test("shade names are non-empty, trimmed and unique", () => {
  const names = CATALOGUE_SHADES.map((s) => s.name);
  for (const name of names) assert.ok(name.length > 0 && name === name.trim(), name);
  assert.equal(new Set(names).size, names.length);
});

test("indicative colours are valid 6-digit hex values", () => {
  for (const shade of CATALOGUE_SHADES) {
    assert.match(shade.indicativeHex, /^#[0-9A-F]{6}$/, `${shade.name} ${shade.indicativeHex}`);
  }
});

test("the verified list contains the shades the catalogue PDF names, including Balsam 250 and Magenta 251", () => {
  const byCode = new Map(CATALOGUE_SHADES.map((s) => [s.code, s.name]));
  assert.equal(byCode.get(250), "Balsam");
  assert.equal(byCode.get(251), "Magenta");
  assert.equal(CATALOGUE_SHADES.length, 29);
});

test("the list does not pretend to be a 50+ shade range", () => {
  assert.ok(CATALOGUE_SHADES.length < 50);
});
