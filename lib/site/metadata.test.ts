import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { STOREFRONT_METADATA } from "./metadata";

const PUBLIC_AREAS = ["shop", "categories", "search", "products", "cart", "checkout", "account", "customer"];

test("storefront metadata is hospital-apparel and not Business OS", () => {
  assert.match(String(STOREFRONT_METADATA.title), /Hospital Apparel/);
  assert.doesNotMatch(String(STOREFRONT_METADATA.description), /Internal|Business OS/);
});

test("every public area has a layout that applies the storefront metadata", () => {
  for (const area of PUBLIC_AREAS) {
    const path = `app/${area}/layout.tsx`;
    assert.ok(existsSync(path), `${path} missing`);
    assert.match(readFileSync(path, "utf8"), /metadata = STOREFRONT_METADATA/);
  }
});

test("root layout keeps the Business OS default for staff routes", () => {
  assert.match(readFileSync("app/layout.tsx", "utf8"), /title: "KANTIRA Business OS"/);
});
