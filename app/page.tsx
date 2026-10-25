import { redirect } from "next/navigation";
import { resolveIdentity, rootRedirectForIdentity } from "@/lib/auth/resolve-identity";
import CataloguePage, { metadata as cataloguePageMetadata } from "./catalogue/page";

// The public landing page at / is the hospital apparel catalogue. It reuses the
// catalogue page as-is (one implementation, also served at /catalogue), so the
// content, metadata and canonical URL stay in sync. Staff and unresolved
// identities keep landing on /dashboard exactly as before; only a customer or
// an anonymous visitor sees the public page. Access control is unchanged:
// middleware already treats / as public and RLS scopes any data the page reads.
export const metadata = cataloguePageMetadata;

export default async function RootPage() {
  const redirectTarget = rootRedirectForIdentity(await resolveIdentity());
  if (redirectTarget) redirect(redirectTarget);

  return <CataloguePage />;
}
