// Pure, informational storefront setup checklist (Phase 6B-15B). Nothing
// here gates the storefront switch: "storefront ON" means the public
// catalogue is enabled, NOT that checkout is ready. The two readiness
// levels are therefore computed and shown separately.

export type StorefrontSetupFacts = {
  organizationConfigured: boolean;
  storefrontEnabled: boolean;
  // primary_storefront_org_id() resolves to THIS organization. False while
  // the storefront is off, or if another organization is the storefront.
  servesThisOrganization: boolean;
  activeCategoryCount: number;
  activeItemCount: number;
  // Active AND published items (the ones customers can see once ON).
  publishedItemCount: number;
  publishedItemsWithImageCount: number;
  publishedItemsWithWeightCount: number;
  activeStoreCount: number;
  // Published items with available_to_sell > 0 in at least one store.
  publishedItemsInStockCount: number;
  activePickupMappingCount: number;
};

export type ChecklistEntry = {
  key: string;
  label: string;
  done: boolean;
  detail: string;
};

export type StorefrontSetupChecklist = {
  catalogue: ChecklistEntry[];
  checkout: ChecklistEntry[];
  catalogueReady: boolean;
  checkoutReady: boolean;
};

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function buildStorefrontSetupChecklist(
  facts: StorefrontSetupFacts,
): StorefrontSetupChecklist {
  const catalogue: ChecklistEntry[] = [
    {
      key: "organization",
      label: "Organization configured",
      done: facts.organizationConfigured,
      detail: facts.organizationConfigured
        ? "Your Business OS organization exists."
        : "No organization is linked to this account.",
    },
    {
      key: "storefront",
      label: "Storefront enabled",
      done: facts.storefrontEnabled && facts.servesThisOrganization,
      detail: !facts.storefrontEnabled
        ? "The public catalogue is off."
        : facts.servesThisOrganization
          ? "The public catalogue is on."
          : "Enabled, but another organization is currently the public storefront.",
    },
    {
      key: "categories",
      label: "Categories created",
      done: facts.activeCategoryCount > 0,
      detail: `${plural(facts.activeCategoryCount, "active category", "active categories")}. Optional — uncategorised products still appear.`,
    },
    {
      key: "active-products",
      label: "Active products",
      done: facts.activeItemCount > 0,
      detail: `${plural(facts.activeItemCount, "active product")}.`,
    },
    {
      key: "published-products",
      label: "Published products",
      done: facts.publishedItemCount > 0,
      detail: `${plural(facts.publishedItemCount, "active product")} published to the storefront.`,
    },
    {
      key: "images",
      label: "Product images",
      done:
        facts.publishedItemCount > 0 &&
        facts.publishedItemsWithImageCount === facts.publishedItemCount,
      detail: `${facts.publishedItemsWithImageCount} of ${facts.publishedItemCount} published products have an image. Products without one show a placeholder.`,
    },
  ];

  const checkout: ChecklistEntry[] = [
    {
      key: "store",
      label: "Store configured",
      done: facts.activeStoreCount > 0,
      detail: `${plural(facts.activeStoreCount, "active store")}.`,
    },
    {
      key: "stock",
      label: "Stock available",
      done: facts.publishedItemsInStockCount > 0,
      detail: `${facts.publishedItemsInStockCount} of ${facts.publishedItemCount} published products have stock available to sell.`,
    },
    {
      key: "weight",
      label: "Shipping weight set",
      done:
        facts.publishedItemCount > 0 &&
        facts.publishedItemsWithWeightCount === facts.publishedItemCount,
      detail: `${facts.publishedItemsWithWeightCount} of ${facts.publishedItemCount} published products have a weight (required before an item can ship).`,
    },
    {
      key: "pickup",
      label: "Shipping pickup mapping",
      done: facts.activePickupMappingCount > 0,
      detail: `${plural(facts.activePickupMappingCount, "store")} mapped to a Shiprocket pickup location.`,
    },
  ];

  const catalogueReady =
    facts.organizationConfigured &&
    facts.storefrontEnabled &&
    facts.servesThisOrganization &&
    facts.publishedItemCount > 0;

  const checkoutReady = catalogueReady && checkout.every((entry) => entry.done);

  return { catalogue, checkout, catalogueReady, checkoutReady };
}

// Raw, already RLS-scoped rows the /storefront page loads (one query per
// source, never per item). Kept as plain shapes so the derivation below is
// unit-testable without Supabase.
export type StorefrontSetupRows = {
  organizationId: string | null;
  storefrontEnabled: boolean;
  primaryStorefrontOrgId: string | null;
  activeCategoryCount: number;
  items: { id: string | null; is_active: boolean | null; is_published: boolean | null; weight_kg: number | null }[];
  mediaItemIds: string[];
  stores: { id: string; is_active: boolean }[];
  inStockItemIds: string[];
  pickupMappedStoreIds: string[];
};

export function deriveStorefrontSetupFacts(rows: StorefrontSetupRows): StorefrontSetupFacts {
  const activeItems = rows.items.filter((i) => i.id && i.is_active === true);
  const published = activeItems.filter((i) => i.is_published === true);
  const mediaItems = new Set(rows.mediaItemIds);
  const inStock = new Set(rows.inStockItemIds);
  const activeStoreIds = new Set(rows.stores.filter((s) => s.is_active).map((s) => s.id));
  const mappedActiveStores = new Set(rows.pickupMappedStoreIds.filter((id) => activeStoreIds.has(id)));

  return {
    organizationConfigured: rows.organizationId !== null,
    storefrontEnabled: rows.storefrontEnabled,
    servesThisOrganization:
      rows.organizationId !== null && rows.primaryStorefrontOrgId === rows.organizationId,
    activeCategoryCount: rows.activeCategoryCount,
    activeItemCount: activeItems.length,
    publishedItemCount: published.length,
    publishedItemsWithImageCount: published.filter((i) => mediaItems.has(i.id as string)).length,
    publishedItemsWithWeightCount: published.filter((i) => (i.weight_kg ?? 0) > 0).length,
    activeStoreCount: activeStoreIds.size,
    publishedItemsInStockCount: published.filter((i) => inStock.has(i.id as string)).length,
    activePickupMappingCount: mappedActiveStores.size,
  };
}
