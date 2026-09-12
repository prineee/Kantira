import { ImageOff } from "lucide-react";

// Shared image-or-fallback for every storefront surface. Per Phase 4A's
// brief: never fabricate a product photo — an item with no approved
// product_media row (or no designated public-storefront org yet) gets a
// clean placeholder, not a broken <img> or a stock photo.
export function ProductImage({
  url,
  alt,
  className = "",
}: {
  url: string | null;
  alt: string;
  className?: string;
}) {
  if (!url) {
    return (
      <div
        className={`flex items-center justify-center bg-kantira-navy-50 text-kantira-navy-300 ${className}`}
        role="img"
        aria-label={alt || "No product image available"}
      >
        <ImageOff size={28} strokeWidth={1.5} />
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      className={`object-cover ${className}`}
      loading="lazy"
    />
  );
}
