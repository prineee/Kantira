"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/actions/auth";

type ActionState = { error: string | null };

const MEDIA_WRITE_ROLES = ["OWNER", "ADMIN", "STOCK"] as const;

const ALLOWED_MIME_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Matches the product-images bucket's file_size_limit (10485760 bytes,
// migration 0015) — checked here too so the failure is a friendly form
// error instead of an opaque storage-API rejection.
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export async function uploadProductMedia(
  itemId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireOrgContext();
  if (ctx.error) return { error: ctx.error };
  const { supabase, profile } = ctx;

  if (!MEDIA_WRITE_ROLES.includes(profile.role as (typeof MEDIA_WRITE_ROLES)[number])) {
    return { error: "You do not have permission to manage product images." };
  }

  const { data: item } = await supabase
    .from("items")
    .select("id")
    .eq("id", itemId)
    .maybeSingle();

  if (!item) {
    return { error: "Item not found in this organization." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an image file to upload." };
  }

  const extension = ALLOWED_MIME_TYPES[file.type];
  if (!extension) {
    return { error: "Only JPEG, PNG, or WEBP images are allowed." };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { error: "Image must be 10 MB or smaller." };
  }

  const altText = String(formData.get("alt_text") ?? "").trim();

  // Path shape (organization_id/item_id/...) is required by the
  // product_images_insert_staff storage policy (migration 0015), which
  // reads both segments back out of the object path to authorize the
  // upload — not just a naming convention.
  const storagePath = `${profile.organization_id}/${itemId}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("product-images")
    .upload(storagePath, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    return { error: uploadError.message };
  }

  const { count: existingCount } = await supabase
    .from("product_media")
    .select("id", { count: "exact", head: true })
    .eq("item_id", itemId);

  const { data: lastMedia } = await supabase
    .from("product_media")
    .select("sort_order")
    .eq("item_id", itemId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error: insertError } = await supabase.from("product_media").insert({
    item_id: itemId,
    storage_path: storagePath,
    alt_text: altText || null,
    sort_order: (lastMedia?.sort_order ?? -1) + 1,
    is_primary: (existingCount ?? 0) === 0,
  });

  if (insertError) {
    // Don't leave an orphaned object in storage if the DB row failed.
    await supabase.storage.from("product-images").remove([storagePath]);
    return { error: insertError.message };
  }

  revalidatePath(`/items/${itemId}/media`);
  return { error: null };
}

export async function deleteProductMedia(
  itemId: string,
  mediaId: string,
): Promise<{ error: string | null }> {
  const ctx = await requireOrgContext();
  if (ctx.error) return { error: ctx.error };
  const { supabase, profile } = ctx;

  if (!MEDIA_WRITE_ROLES.includes(profile.role as (typeof MEDIA_WRITE_ROLES)[number])) {
    return { error: "You do not have permission to manage product images." };
  }

  const { data: storagePath, error: rpcError } = await supabase.rpc(
    "delete_product_media",
    { p_media_id: mediaId },
  );

  if (rpcError) {
    return { error: rpcError.message };
  }

  if (storagePath) {
    await supabase.storage.from("product-images").remove([storagePath]);
  }

  revalidatePath(`/items/${itemId}/media`);
  return { error: null };
}

export async function setPrimaryProductMedia(
  itemId: string,
  mediaId: string,
): Promise<{ error: string | null }> {
  const ctx = await requireOrgContext();
  if (ctx.error) return { error: ctx.error };
  const { supabase, profile } = ctx;

  if (!MEDIA_WRITE_ROLES.includes(profile.role as (typeof MEDIA_WRITE_ROLES)[number])) {
    return { error: "You do not have permission to manage product images." };
  }

  const { error } = await supabase.rpc("set_primary_product_media", {
    p_media_id: mediaId,
  });

  if (error) return { error: error.message };

  revalidatePath(`/items/${itemId}/media`);
  return { error: null };
}

export async function reorderProductMedia(
  itemId: string,
  mediaIds: string[],
): Promise<{ error: string | null }> {
  const ctx = await requireOrgContext();
  if (ctx.error) return { error: ctx.error };
  const { supabase, profile } = ctx;

  if (!MEDIA_WRITE_ROLES.includes(profile.role as (typeof MEDIA_WRITE_ROLES)[number])) {
    return { error: "You do not have permission to manage product images." };
  }

  const { error } = await supabase.rpc("reorder_product_media", {
    p_item_id: itemId,
    p_media_ids: mediaIds,
  });

  if (error) return { error: error.message };

  revalidatePath(`/items/${itemId}/media`);
  return { error: null };
}
