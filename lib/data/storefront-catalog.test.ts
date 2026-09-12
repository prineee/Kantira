import test from "node:test";
import assert from "node:assert/strict";
import {
  STOREFRONT_ITEM_SELECT,
  buildCategoryTree,
  buildIlikePattern,
  dedupeById,
  escapeIlikePattern,
  isValidUuid,
  parsePageParam,
  paginationRange,
  totalPagesFor,
} from "./storefront-catalog";

test("storefront item select never references cost_price or other internal-only columns", () => {
  for (const forbidden of [
    "cost_price",
    "created_by",
    "reorder_level",
    "track_inventory",
    "hsn_code",
    "barcode",
    "weight_kg",
  ]) {
    assert.equal(
      STOREFRONT_ITEM_SELECT.includes(forbidden),
      false,
      `STOREFRONT_ITEM_SELECT must not include ${forbidden}`,
    );
  }
});

test("escapeIlikePattern neutralizes ILIKE wildcards", () => {
  assert.equal(escapeIlikePattern("50% off"), "50\\% off");
  assert.equal(escapeIlikePattern("a_b"), "a\\_b");
  assert.equal(escapeIlikePattern("back\\slash"), "back\\\\slash");
  assert.equal(escapeIlikePattern("plain text"), "plain text");
});

test("buildIlikePattern trims and wraps in wildcards", () => {
  assert.equal(buildIlikePattern("  rice  "), "%rice%");
  assert.equal(buildIlikePattern("50%"), "%50\\%%");
});

test("buildCategoryTree nests children under their parent, sorted by name", () => {
  const tree = buildCategoryTree([
    { id: "c2", name: "Snacks", parent_category_id: null },
    { id: "c1", name: "Grocery", parent_category_id: null },
    { id: "c3", name: "Chips", parent_category_id: "c2" },
    { id: "c4", name: "Biscuits", parent_category_id: "c2" },
  ]);

  assert.deepEqual(
    tree.map((n) => n.name),
    ["Grocery", "Snacks"],
  );
  const snacks = tree.find((n) => n.id === "c2")!;
  assert.deepEqual(
    snacks.children.map((n) => n.name),
    ["Biscuits", "Chips"],
  );
});

test("buildCategoryTree treats an orphaned parent reference as top-level", () => {
  const tree = buildCategoryTree([
    { id: "c1", name: "Orphan", parent_category_id: "does-not-exist" },
  ]);
  assert.deepEqual(tree.map((n) => n.id), ["c1"]);
});

test("parsePageParam clamps invalid/negative/missing input to page 1", () => {
  assert.equal(parsePageParam(undefined), 1);
  assert.equal(parsePageParam("0"), 1);
  assert.equal(parsePageParam("-3"), 1);
  assert.equal(parsePageParam("abc"), 1);
  assert.equal(parsePageParam(["2", "9"]), 2);
  assert.equal(parsePageParam("5"), 5);
});

test("paginationRange computes zero-indexed inclusive ranges", () => {
  assert.deepEqual(paginationRange(1, 24), { from: 0, to: 23 });
  assert.deepEqual(paginationRange(2, 24), { from: 24, to: 47 });
});

test("totalPagesFor always returns at least 1 page", () => {
  assert.equal(totalPagesFor(0, 24), 1);
  assert.equal(totalPagesFor(24, 24), 1);
  assert.equal(totalPagesFor(25, 24), 2);
});

test("isValidUuid accepts a well-formed UUID and rejects everything else", () => {
  assert.equal(isValidUuid("123e4567-e89b-12d3-a456-426614174000"), true);
  assert.equal(isValidUuid("not-a-uuid"), false);
  assert.equal(isValidUuid("../../etc/passwd"), false);
  assert.equal(isValidUuid(""), false);
});

test("dedupeById merges multiple result lists and sorts by name", () => {
  const merged = dedupeById(
    [{ id: "1", name: "Rice" }],
    [{ id: "1", name: "Rice" }, { id: "2", name: "Atta" }],
  );
  assert.deepEqual(
    merged.map((m) => m.id),
    ["2", "1"],
  );
});
