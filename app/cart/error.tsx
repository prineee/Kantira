"use client";

import { StorefrontError } from "@/components/storefront/storefront-error";

export default function CartError({ reset }: { error: Error; reset: () => void }) {
  return <StorefrontError reset={reset} />;
}
