import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/data/get-org-id";
import { KantiraShell } from "@/components/kantira-shell";
import { signOut } from "@/app/dashboard/actions";
import { cardClass } from "@/lib/ui/form-classes";
import { MediaManager, type MediaItem } from "./media-manager";

const WRITE_ROLES = ["OWNER", "ADMIN", "STOCK"];

// Signed URLs are short-lived on purpose — the product-images bucket is
// private (migration 0015), so every viewer, staff included, needs a fresh
// per-request URL rather than a stored public one.
const SIGNED_URL_TTL_SECONDS = 3600;

export default async function ItemMediaPage({
  params,
}: {
  params: { id: string };
}) {
  const { supabase, profile, organization } = await getOrgContext();
  const canWrite = WRITE_ROLES.includes(profile.role);

  const { data: item } = await supabase
    .from("items")
    .select("id, sku, name")
    .eq("id", params.id)
    .maybeSingle();

  if (!item) {
    notFound();
  }

  const { data: mediaRows } = await supabase
    .from("product_media")
    .select("id, storage_path, alt_text, is_primary")
    .eq("item_id", item.id)
    .order("sort_order", { ascending: true });

  const media: MediaItem[] = await Promise.all(
    (mediaRows ?? []).map(async (row) => {
      const { data: signed } = await supabase.storage
        .from("product-images")
        .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS);

      return {
        id: row.id,
        url: signed?.signedUrl ?? null,
        altText: row.alt_text,
        isPrimary: row.is_primary,
      };
    }),
  );

  return (
    <KantiraShell
      orgName={organization?.name ?? "—"}
      role={profile.role}
      signOutAction={signOut}
    >
      <div className="mb-6">
        <Link href="/items" className="text-sm font-medium text-brand-royal">
          ← Back to items
        </Link>
        <h2 className="mt-2 text-xl font-bold text-kantira-navy-900">
          Images — {item.name}
        </h2>
        <p className="text-sm text-brand-slate">SKU {item.sku}</p>
      </div>

      <section className={cardClass}>
        {canWrite ? (
          <MediaManager itemId={item.id} initialMedia={media} />
        ) : media.length > 0 ? (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {media.map((m) => (
              <li
                key={m.id}
                className="aspect-square overflow-hidden rounded-md bg-kantira-navy-50"
              >
                {m.url ? (
                  <img
                    src={m.url}
                    alt={m.altText ?? ""}
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-brand-slate">No images uploaded yet.</p>
        )}
      </section>
    </KantiraShell>
  );
}
