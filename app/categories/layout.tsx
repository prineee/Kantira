import { STOREFRONT_METADATA } from "@/lib/site/metadata";

export const metadata = STOREFRONT_METADATA;

export default function StorefrontAreaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
