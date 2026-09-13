import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { isApiRoute, isPublicStorefrontPath } from "@/lib/auth/public-routes";

/**
 * Refreshes the Supabase auth session on every request and redirects
 * unauthenticated users away from protected routes. This is the mechanism
 * that keeps session cookies valid across server components; it does not
 * itself enforce data access — RLS does that.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthRoute =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/signup") ||
    request.nextUrl.pathname.startsWith("/auth");

  // Public storefront routes (Phase 4A): logged-out shoppers must be able
  // to browse the catalog. This never relaxes data access on its own — the
  // pages behind these routes read through the same anon/authenticated RLS
  // policies (items_select_public, product_categories_select_public, etc.)
  // either way; this only stops middleware from bouncing an anonymous
  // visitor to /login before the page ever renders.
  const isPublicStorefrontRoute = isPublicStorefrontPath(
    request.nextUrl.pathname,
  );

  // API Route Handlers (app/api/**) own their own authorization (a
  // signature check for a webhook, requireCustomerContext() equivalent for
  // anything session-based) — never gated by this page-navigation redirect.
  // Phase 4D added the first one: app/api/webhooks/razorpay/route.ts,
  // which has no Supabase session at all and would otherwise be redirected
  // to /login on every request, breaking the webhook entirely.
  if (isApiRoute(request.nextUrl.pathname)) {
    return supabaseResponse;
  }

  if (!user && !isAuthRoute && !isPublicStorefrontRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (
    user &&
    (request.nextUrl.pathname.startsWith("/login") ||
      request.nextUrl.pathname.startsWith("/signup"))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
