import { NextRequest, NextResponse } from "next/server";

/**
 * Middleware: progressive auth gate.
 *
 * App pages are PUBLIC (guests can use the chat).
 * Only specific API routes that need org context are protected.
 * Auth check is cookie-only — full validation happens server-side.
 */

/** Routes that REQUIRE authentication (everything else is public) */
const PROTECTED_API_PATHS = [
  "/api/chat",       // authenticated chat (needs orgId)
  "/api/stripe",     // billing
  "/api/admin",      // super admin
];

/** Routes that are always public even if they match protected patterns */
const PUBLIC_EXCEPTIONS = [
  "/api/chat/guest",         // guest chat endpoint
  "/api/chat/migrate",       // conversation migration
  "/api/admin/neo4j/seed",     // neo4j seed (protected by ADMIN_SECRET header)
  "/api/admin/neo4j/migrate",  // legacy migration (protected by ADMIN_SECRET header)
  "/api/admin/import",         // n8n import endpoints (protected by ADMIN_SECRET header)
  "/api/admin/enrich",         // enrichment backfill endpoints (protected by session OR ADMIN_SECRET)
  "/api/admin/promote-user",   // bootstrap admin role (protected by ADMIN_SECRET header)
  "/api/admin/experts/diagnostic",  // expert data diagnostic (protected by session OR ADMIN_SECRET)
  "/api/sandbox/enter",              // sandbox login token consumption (validates its own token)
];

function isProtectedPath(pathname: string): boolean {
  // Check exceptions first
  if (PUBLIC_EXCEPTIONS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return false;
  }
  // Then check protected paths
  return PROTECTED_API_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Rewrite root URL to /dashboard (URL stays as /, content from /dashboard)
  if (pathname === "/") {
    const response = NextResponse.rewrite(new URL("/dashboard", req.url));
    response.headers.set("x-pathname", pathname);
    return response;
  }

  // Only protect specific API routes
  if (!isProtectedPath(pathname)) {
    // Pass the pathname to server components via custom header
    const response = NextResponse.next();
    response.headers.set("x-pathname", pathname);
    return response;
  }

  // Check for session cookie — just existence, no API call
  const sessionCookie =
    req.cookies.get("better-auth.session_token") ||
    req.cookies.get("__Secure-better-auth.session_token");

  if (!sessionCookie?.value) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  const response = NextResponse.next();
  response.headers.set("x-pathname", pathname);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
