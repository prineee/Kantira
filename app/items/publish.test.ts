import test from "node:test";
import assert from "node:assert/strict";
import { isPublishDeniedError, parsePublishField } from "./publish";

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

test("parsePublishField maps the two valid values", () => {
  assert.equal(parsePublishField(formData({ is_published: "published" })), true);
  assert.equal(parsePublishField(formData({ is_published: "hidden" })), false);
});

test("parsePublishField returns undefined when the field is absent (non-publisher form)", () => {
  assert.equal(parsePublishField(formData({ name: "V-Neck Scrub" })), undefined);
});

test("parsePublishField rejects tampered values instead of coercing them", () => {
  for (const value of ["", "true", "on", "1", "Published", "public"]) {
    assert.equal(parsePublishField(formData({ is_published: value })), null, value);
  }
});

test("isPublishDeniedError recognises the database publish guard", () => {
  assert.equal(
    isPublishDeniedError("Only an OWNER or ADMIN can publish or hide items on the storefront"),
    true,
  );
  assert.equal(isPublishDeniedError("duplicate key value violates unique constraint"), false);
  assert.equal(isPublishDeniedError(null), false);
});
