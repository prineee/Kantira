// Routes reachable without an authenticated session, per Phase 4A's
// requirement that logged-out shoppers can browse the catalog. Pure
// path-matching logic only — lib/supabase/middleware.ts is the only caller
// that combines this with the existing auth-route allowance and the
// no-session redirect. Kept as a standalone module (rather than inlined in
// middleware.ts) so the route list itself is unit-testable without needing
// a NextRequest fixture.
//
// Deliberately NOT included: /account (customer landing — needs its own
// authenticated customer session, unchanged from Phase 3B) and every
// internal Business OS route (/dashboard, /items, /stores, ...).
const PUBLIC_STOREFRONT_PATH_PREFIXES = [
  "/shop",
  "/categories",
  "/search",
  "/products",
] as const;

export function isPublicStorefrontPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_STOREFRONT_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
