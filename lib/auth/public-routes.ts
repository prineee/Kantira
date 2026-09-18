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

// Phase 6B-12: the customer-facing auth routes, kept structurally separate
// from the staff /login+/signup pair (see isStaffAuthPath below) so an
// authenticated-user redirect never sends a customer toward /dashboard nor
// a staff member toward /account merely for hitting the "wrong" auth route
// — each pair only ever redirects within its own kind.
const CUSTOMER_AUTH_PATH_PREFIXES = ["/customer/login", "/customer/signup"] as const;

export function isCustomerAuthPath(pathname: string): boolean {
  return CUSTOMER_AUTH_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function isStaffAuthPath(pathname: string): boolean {
  return (
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/auth")
  );
}

// Customer-area pages that require a customer session. An unauthenticated
// visitor here is sent to /customer/login, never the generic staff /login
// — everything else non-public/non-auth still falls back to /login
// unchanged, matching this app's existing default for every internal
// Business OS route.
const CUSTOMER_PROTECTED_PATH_PREFIXES = ["/account", "/cart", "/checkout"] as const;

export function isCustomerProtectedPath(pathname: string): boolean {
  return CUSTOMER_PROTECTED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

// API Route Handlers (app/api/**) are a different kind of route entirely —
// they serve JSON/HTTP responses, never HTML pages, and this codebase's
// page-navigation-style "no session -> redirect to /login" behavior makes
// no sense for them (Phase 4D added the first one: the Razorpay webhook,
// app/api/webhooks/razorpay/route.ts, a server-to-server call with no
// Supabase session at all — authenticated instead by an HMAC signature
// checked inside the handler itself). Every route under app/api/ owns its
// own authorization (a Server Action's requireOrgContext()/
// requireCustomerContext() equivalent, or a signature check for a
// webhook) rather than relying on middleware to gate it — so all of
// app/api/ is excluded from the redirect-to-login check, not just this
// one webhook path.
export function isApiRoute(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}
