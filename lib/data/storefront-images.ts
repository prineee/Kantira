import type { createClient } from "@/lib/supabase/server";
import {
  STOREFRONT_MEDIA_SELECT,
  STOREFRONT_SIGNED_URL_TTL_SECONDS,
} from "./storefront-catalog";
import { pickPrimaryMediaByItem } from "./storefront-media";

type StorefrontSupabaseClient = ReturnType<typeof createClient>;

// Resolves one signed URL per item (its primary image, or lowest
// sort_order if none is marked primary) for grid/card surfaces. Uses
// createSignedUrl(s) rather than getPublicUrl() — the product-images
// bucket is private, so a public URL would 400/403 (see
// docs/architecture/PHASE_5_ARCHITECTURE_DECISIONS.md section 6.2). Both
// `anon` and `authenticated` hold the same product_images_select_public
// storage policy (migration 0015), so this works identically for
// logged-out shoppers and logged-in customers/staff.
export async function getPrimaryImageUrls(
  supabase: StorefrontSupabaseClient,
  itemIds: string[],
): Promise<Map<string, string>> {
  if (itemIds.length === 0) return new Map();

  const { data: mediaRows } = await supabase
    .from("product_media")
    .select(STOREFRONT_MEDIA_SELECT)
    .in("item_id", itemIds);

  const primaryByItem = pickPrimaryMediaByItem(mediaRows ?? []);
  const paths = Array.from(primaryByItem.values(), (m) => m.storage_path);
  if (paths.length === 0) return new Map();

  const { data: signed } = await supabase.storage
    .from("product-images")
    .createSignedUrls(paths, STOREFRONT_SIGNED_URL_TTL_SECONDS);

  const urlByPath = new Map(
    (signed ?? [])
      .filter((s) => s.signedUrl && s.path)
      .map((s) => [s.path as string, s.signedUrl as string]),
  );

  const result = new Map<string, string>();
  for (const [itemId, media] of primaryByItem) {
    const url = urlByPath.get(media.storage_path);
    if (url) result.set(itemId, url);
  }
  return result;
}

// Full ordered gallery for a single product detail page.
export async function getItemGalleryUrls(
  supabase: StorefrontSupabaseClient,
  itemId: string,
): Promise<{ url: string; altText: string | null; isPrimary: boolean }[]> {
  const { data: mediaRows } = await supabase
    .from("product_media")
    .select(STOREFRONT_MEDIA_SELECT)
    .eq("item_id", itemId)
    .order("sort_order", { ascending: true });

  if (!mediaRows || mediaRows.length === 0) return [];

  const paths = mediaRows.map((m) => m.storage_path);
  const { data: signed } = await supabase.storage
    .from("product-images")
    .createSignedUrls(paths, STOREFRONT_SIGNED_URL_TTL_SECONDS);

  const urlByPath = new Map(
    (signed ?? [])
      .filter((s) => s.signedUrl && s.path)
      .map((s) => [s.path as string, s.signedUrl as string]),
  );

  return mediaRows
    .map((row) => ({
      url: urlByPath.get(row.storage_path) ?? null,
      altText: row.alt_text,
      isPrimary: row.is_primary,
    }))
    .filter((m): m is { url: string; altText: string | null; isPrimary: boolean } => m.url !== null);
}
