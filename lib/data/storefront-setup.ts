import type { createClient } from "@/lib/supabase/server";
import type { StorefrontSetupRows } from "@/lib/storefront/setup-checklist";

type StaffSupabaseClient = ReturnType<typeof createClient>;

// Loads everything the /storefront checklist needs with the caller's own
// staff session — every read is RLS-scoped to current_org_id(); no
// service-role client, no organization_id taken from input. One query per
// source (never one per item), all issued in parallel.
export async function loadStorefrontSetupRows(
  supabase: StaffSupabaseClient,
  organizationId: string,
): Promise<StorefrontSetupRows> {
  const [
    { data: organization },
    { data: primaryStorefrontOrgId },
    { count: activeCategoryCount },
    { data: items },
    { data: media },
    { data: stores },
    { data: inStock },
    { data: pickupMappings },
  ] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, is_public_storefront")
      .eq("id", organizationId)
      .maybeSingle(),
    supabase.rpc("primary_storefront_org_id"),
    supabase
      .from("product_categories")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
    supabase.rpc("items_catalog_for_staff").select("id, is_active, is_published, weight_kg"),
    supabase.from("product_media").select("item_id"),
    supabase.from("stores").select("id, is_active"),
    supabase.from("available_to_sell").select("item_id").gt("available_quantity", 0),
    supabase.from("store_shipping_config").select("store_id").eq("active", true),
  ]);

  return {
    organizationId: organization?.id ?? null,
    storefrontEnabled: organization?.is_public_storefront === true,
    primaryStorefrontOrgId: primaryStorefrontOrgId ?? null,
    activeCategoryCount: activeCategoryCount ?? 0,
    items: items ?? [],
    mediaItemIds: (media ?? []).map((m) => m.item_id),
    stores: stores ?? [],
    inStockItemIds: (inStock ?? []).flatMap((row) => (row.item_id ? [row.item_id] : [])),
    pickupMappedStoreIds: (pickupMappings ?? []).map((m) => m.store_id),
  };
}
