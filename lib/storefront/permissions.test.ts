import test from "node:test";
import assert from "node:assert/strict";
import { canPublishItems, canToggleStorefront, canViewStorefrontSettings } from "./permissions";

const ALL_ROLES = ["OWNER", "ADMIN", "STORE_MANAGER", "SALES", "STOCK", "ACCOUNTANT", "FRANCHISE"];

test("only OWNER may toggle the storefront (organization-level config is OWNER-only)", () => {
  assert.deepEqual(ALL_ROLES.filter(canToggleStorefront), ["OWNER"]);
});

test("only OWNER and ADMIN may publish or hide items", () => {
  assert.deepEqual(ALL_ROLES.filter(canPublishItems), ["OWNER", "ADMIN"]);
});

test("only OWNER and ADMIN may open storefront settings", () => {
  assert.deepEqual(ALL_ROLES.filter(canViewStorefrontSettings), ["OWNER", "ADMIN"]);
});

test("missing, empty, customer-like or case-mangled roles are never authorized", () => {
  for (const role of [null, undefined, "", "owner", "CUSTOMER", " OWNER"]) {
    assert.equal(canToggleStorefront(role), false, String(role));
    assert.equal(canPublishItems(role), false, String(role));
    assert.equal(canViewStorefrontSettings(role), false, String(role));
  }
});
