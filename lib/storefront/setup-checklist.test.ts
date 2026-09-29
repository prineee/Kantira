import test from "node:test";
import assert from "node:assert/strict";
import {
  buildStorefrontSetupChecklist,
  deriveStorefrontSetupFacts,
  type StorefrontSetupRows,
} from "./setup-checklist";

const ORG = "11111111-1111-1111-1111-111111111111";

function rows(overrides: Partial<StorefrontSetupRows> = {}): StorefrontSetupRows {
  return {
    organizationId: ORG,
    storefrontEnabled: false,
    primaryStorefrontOrgId: null,
    activeCategoryCount: 0,
    items: [],
    mediaItemIds: [],
    stores: [],
    inStockItemIds: [],
    pickupMappedStoreIds: [],
    ...overrides,
  };
}

test("a fresh organization is neither catalogue- nor checkout-ready", () => {
  const checklist = buildStorefrontSetupChecklist(deriveStorefrontSetupFacts(rows()));
  assert.equal(checklist.catalogueReady, false);
  assert.equal(checklist.checkoutReady, false);
  assert.equal(checklist.catalogue.find((e) => e.key === "organization")?.done, true);
  assert.equal(checklist.catalogue.find((e) => e.key === "storefront")?.done, false);
});

test("only active AND published items count as published", () => {
  const facts = deriveStorefrontSetupFacts(
    rows({
      items: [
        { id: "ap", is_active: true, is_published: true, weight_kg: 0.2 },
        { id: "au", is_active: true, is_published: false, weight_kg: 0.2 },
        { id: "ip", is_active: false, is_published: true, weight_kg: 0.2 },
        { id: null, is_active: true, is_published: true, weight_kg: 0.2 },
      ],
    }),
  );
  assert.equal(facts.activeItemCount, 2);
  assert.equal(facts.publishedItemCount, 1);
});

test("catalogue is ready with storefront ON + one published item, even with no store/stock/pickup", () => {
  const checklist = buildStorefrontSetupChecklist(
    deriveStorefrontSetupFacts(
      rows({
        storefrontEnabled: true,
        primaryStorefrontOrgId: ORG,
        items: [{ id: "ap", is_active: true, is_published: true, weight_kg: null }],
      }),
    ),
  );
  assert.equal(checklist.catalogueReady, true);
  assert.equal(checklist.checkoutReady, false);
});

test("storefront enabled but another org is primary is not treated as serving this org", () => {
  const facts = deriveStorefrontSetupFacts(
    rows({
      storefrontEnabled: true,
      primaryStorefrontOrgId: "22222222-2222-2222-2222-222222222222",
      items: [{ id: "ap", is_active: true, is_published: true, weight_kg: 1 }],
    }),
  );
  assert.equal(facts.servesThisOrganization, false);
  const checklist = buildStorefrontSetupChecklist(facts);
  assert.equal(checklist.catalogueReady, false);
  assert.match(checklist.catalogue.find((e) => e.key === "storefront")!.detail, /another organization/);
});

test("checkout readiness needs store, stock on a published item, weight and a pickup mapping on an ACTIVE store", () => {
  const base = rows({
    storefrontEnabled: true,
    primaryStorefrontOrgId: ORG,
    activeCategoryCount: 1,
    items: [{ id: "ap", is_active: true, is_published: true, weight_kg: 0.3 }],
    mediaItemIds: ["ap"],
    stores: [
      { id: "s1", is_active: true },
      { id: "s2", is_active: false },
    ],
    inStockItemIds: ["ap"],
    pickupMappedStoreIds: ["s1"],
  });
  assert.equal(buildStorefrontSetupChecklist(deriveStorefrontSetupFacts(base)).checkoutReady, true);

  const inactiveMapping = { ...base, pickupMappedStoreIds: ["s2"] };
  assert.equal(buildStorefrontSetupChecklist(deriveStorefrontSetupFacts(inactiveMapping)).checkoutReady, false);

  const stockOnHiddenItemOnly = {
    ...base,
    items: [...base.items, { id: "au", is_active: true, is_published: false, weight_kg: 1 }],
    inStockItemIds: ["au"],
  };
  assert.equal(buildStorefrontSetupChecklist(deriveStorefrontSetupFacts(stockOnHiddenItemOnly)).checkoutReady, false);

  const missingWeight = { ...base, items: [{ id: "ap", is_active: true, is_published: true, weight_kg: null }] };
  assert.equal(buildStorefrontSetupChecklist(deriveStorefrontSetupFacts(missingWeight)).checkoutReady, false);
});

test("image check reports how many published items have at least one image", () => {
  const facts = deriveStorefrontSetupFacts(
    rows({
      items: [
        { id: "a", is_active: true, is_published: true, weight_kg: 1 },
        { id: "b", is_active: true, is_published: true, weight_kg: 1 },
      ],
      mediaItemIds: ["a", "a"],
    }),
  );
  assert.equal(facts.publishedItemsWithImageCount, 1);
  const images = buildStorefrontSetupChecklist(facts).catalogue.find((e) => e.key === "images")!;
  assert.equal(images.done, false);
  assert.match(images.detail, /1 of 2/);
});
