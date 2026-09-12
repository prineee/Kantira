import test from "node:test";
import assert from "node:assert/strict";
import {
  CART_MAX_QUANTITY,
  buildCartSummary,
  parseCartQuantity,
  sumCartQuantities,
  type CartCatalogItem,
} from "./cart";

test("parseCartQuantity accepts valid integers as number or string", () => {
  assert.equal(parseCartQuantity(1), 1);
  assert.equal(parseCartQuantity("5"), 5);
  assert.equal(parseCartQuantity(CART_MAX_QUANTITY), CART_MAX_QUANTITY);
});

test("parseCartQuantity rejects zero, negative, non-integer, and over-max", () => {
  assert.equal(parseCartQuantity(0), null);
  assert.equal(parseCartQuantity(-1), null);
  assert.equal(parseCartQuantity(1.5), null);
  assert.equal(parseCartQuantity(CART_MAX_QUANTITY + 1), null);
  assert.equal(parseCartQuantity("abc"), null);
  assert.equal(parseCartQuantity(""), null);
  assert.equal(parseCartQuantity(null), null);
  assert.equal(parseCartQuantity(undefined), null);
  assert.equal(parseCartQuantity(NaN), null);
  assert.equal(parseCartQuantity(Infinity), null);
});

// This is the "browser cannot supply trusted price" guarantee at the type
// level: CartCatalogItem/CartItemRow simply have no field a caller could
// use to inject a price — buildCartSummary always multiplies the
// caller-supplied *catalog* lookup's sellingPrice (meant to come from a
// live, RLS-scoped items query) by the cart row's quantity, never a value
// from the cart row itself.
test("buildCartSummary computes line totals from the catalog lookup, never from the cart row", () => {
  const itemsById = new Map<string, CartCatalogItem>([
    ["item-1", { sku: "SKU-1", name: "Widget", sellingPrice: 100, categoryName: "Tools", uomCode: "PCS" }],
  ]);
  const summary = buildCartSummary(
    [{ id: "ci-1", item_id: "item-1", quantity: 3 }],
    itemsById,
    new Map(),
  );
  assert.equal(summary.lines.length, 1);
  const [line] = summary.lines;
  assert.equal(line!.lineTotal, 300);
  assert.equal(line!.unitPrice, 100);
  assert.equal(summary.subtotal, 300);
  assert.equal(summary.itemCount, 3);
  assert.equal(summary.hasUnavailableItems, false);
});

test("buildCartSummary flags an item missing from the catalog lookup as unavailable, excluded from subtotal", () => {
  const summary = buildCartSummary(
    [{ id: "ci-1", item_id: "gone-item", quantity: 2 }],
    new Map(),
    new Map(),
  );
  assert.equal(summary.lines.length, 1);
  const [line] = summary.lines;
  assert.equal(line!.available, false);
  assert.equal(line!.lineTotal, null);
  assert.equal(line!.unitPrice, null);
  assert.equal(summary.subtotal, 0);
  assert.equal(summary.hasUnavailableItems, true);
  // Still counted toward the badge/quantity total — it occupies a cart slot.
  assert.equal(summary.itemCount, 2);
});

test("buildCartSummary sums multiple lines and mixed availability correctly", () => {
  const itemsById = new Map<string, CartCatalogItem>([
    ["item-1", { sku: "SKU-1", name: "Widget", sellingPrice: 50, categoryName: null, uomCode: null }],
  ]);
  const summary = buildCartSummary(
    [
      { id: "ci-1", item_id: "item-1", quantity: 2 },
      { id: "ci-2", item_id: "item-2-missing", quantity: 1 },
    ],
    itemsById,
    new Map(),
  );
  assert.equal(summary.subtotal, 100);
  assert.equal(summary.itemCount, 3);
  assert.equal(summary.hasUnavailableItems, true);
});

test("sumCartQuantities matches buildCartSummary's itemCount semantic", () => {
  const rows = [{ quantity: 2 }, { quantity: 5 }];
  assert.equal(sumCartQuantities(rows), 7);
  assert.equal(sumCartQuantities([]), 0);
});
