import test from "node:test";
import assert from "node:assert/strict";
import { readStoreFields, validate } from "./validation";

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

test("readStoreFields trims fields and defaults type to COMPANY", () => {
  const fields = readStoreFields(
    formData({ store_code: " S1 ", store_name: " Main Street ", city: " Patna " }),
  );
  assert.equal(fields.store_code, "S1");
  assert.equal(fields.store_name, "Main Street");
  assert.equal(fields.city, "Patna");
  assert.equal(fields.type, "COMPANY");
});

test("readStoreFields never reads an organization_id field, even if smuggled in", () => {
  const fields = readStoreFields(
    formData({
      store_code: "S1",
      store_name: "Main Street",
      organization_id: "11111111-1111-1111-1111-111111111111",
    }),
  );
  assert.equal((fields as Record<string, unknown>).organization_id, undefined);
});

test("validate rejects a missing store code", () => {
  const fields = readStoreFields(formData({ store_name: "Main Street" }));
  assert.match(validate(fields) ?? "", /code/i);
});

test("validate rejects a missing store name", () => {
  const fields = readStoreFields(formData({ store_code: "S1" }));
  assert.match(validate(fields) ?? "", /name/i);
});

test("validate rejects a store type outside the store_type enum", () => {
  const fields = readStoreFields(
    formData({ store_code: "S1", store_name: "Main Street", type: "WAREHOUSE" }),
  );
  assert.match(validate(fields) ?? "", /type/i);
});

test("validate accepts a complete, valid submission", () => {
  const fields = readStoreFields(
    formData({ store_code: "S1", store_name: "Main Street", type: "FRANCHISE" }),
  );
  assert.equal(validate(fields), null);
});
