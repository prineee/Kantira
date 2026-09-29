import test from "node:test";
import assert from "node:assert/strict";
import { countImagesByItem, isVisibleToCustomers, itemStorefrontStatus } from "./visibility";

test("customer visibility requires storefront ON, active AND published", () => {
  const cases: [boolean, boolean, boolean, boolean][] = [
    // storefrontEnabled, isActive, isPublished, expected
    [true, true, true, true],
    [true, true, false, false],
    [true, false, true, false],
    [true, false, false, false],
    [false, true, true, false],
    [false, false, false, false],
  ];
  for (const [storefrontEnabled, isActive, isPublished, expected] of cases) {
    assert.equal(
      isVisibleToCustomers({ storefrontEnabled, isActive, isPublished }),
      expected,
      JSON.stringify({ storefrontEnabled, isActive, isPublished }),
    );
  }
});

test("null flags are treated as not visible", () => {
  assert.equal(isVisibleToCustomers({ storefrontEnabled: true, isActive: null, isPublished: true }), false);
  assert.equal(isVisibleToCustomers({ storefrontEnabled: true, isActive: true, isPublished: null }), false);
});

test("itemStorefrontStatus distinguishes published, hidden and published-but-inactive", () => {
  assert.equal(itemStorefrontStatus({ is_active: true, is_published: true }), "PUBLISHED");
  assert.equal(itemStorefrontStatus({ is_active: true, is_published: false }), "HIDDEN");
  assert.equal(itemStorefrontStatus({ is_active: false, is_published: true }), "PUBLISHED_INACTIVE");
  assert.equal(itemStorefrontStatus({ is_active: false, is_published: false }), "HIDDEN");
  assert.equal(itemStorefrontStatus({ is_active: null, is_published: null }), "HIDDEN");
});

test("countImagesByItem counts per item from one list", () => {
  const counts = countImagesByItem([{ item_id: "a" }, { item_id: "b" }, { item_id: "a" }]);
  assert.equal(counts.get("a"), 2);
  assert.equal(counts.get("b"), 1);
  assert.equal(counts.get("c"), undefined);
});
