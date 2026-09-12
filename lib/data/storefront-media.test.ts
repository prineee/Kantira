import test from "node:test";
import assert from "node:assert/strict";
import { pickPrimaryMediaByItem } from "./storefront-media";

test("prefers the row marked is_primary over sort_order", () => {
  const result = pickPrimaryMediaByItem([
    { item_id: "i1", storage_path: "a.jpg", is_primary: false, sort_order: 0 },
    { item_id: "i1", storage_path: "b.jpg", is_primary: true, sort_order: 1 },
  ]);
  assert.equal(result.get("i1")?.storage_path, "b.jpg");
});

test("falls back to lowest sort_order when nothing is primary", () => {
  const result = pickPrimaryMediaByItem([
    { item_id: "i1", storage_path: "b.jpg", is_primary: false, sort_order: 2 },
    { item_id: "i1", storage_path: "a.jpg", is_primary: false, sort_order: 0 },
  ]);
  assert.equal(result.get("i1")?.storage_path, "a.jpg");
});

test("keeps each item's own pick independent", () => {
  const result = pickPrimaryMediaByItem([
    { item_id: "i1", storage_path: "a.jpg", is_primary: true, sort_order: 0 },
    { item_id: "i2", storage_path: "c.jpg", is_primary: false, sort_order: 0 },
  ]);
  assert.equal(result.size, 2);
  assert.equal(result.get("i1")?.storage_path, "a.jpg");
  assert.equal(result.get("i2")?.storage_path, "c.jpg");
});

test("returns an empty map for no rows", () => {
  assert.equal(pickPrimaryMediaByItem([]).size, 0);
});
