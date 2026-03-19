/**
 * GET /api/sandbox/enter?token=xxx
 *
 * Consumes a one-time sandbox login token, signs in via Better Auth's
 * internal sign-in API (which handles session creation + signed cookies),
 * and redirects to the app.
 *
 * This route is in PUBLIC_EXCEPTIONS in middleware.ts because
 * the browser needs to access it without an existing session.
 */

import { NextRequest, NextResponse } from "next/server";
import { consumeToken } from "@/lib/sandbox/token-store";
import { SANDBOX_PASSWORD } from "@/lib/sandbox/create-test-user";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const entry = await consumeToken(token);
  if (!entry) {
    return NextResponse.json(
      { error: "Invalid or expired token. Go back to the sandbox page and click Launch again." },
      { status: 401 }
    );
  }

  try {
    // Use Better Auth's internal sign-in API to create a proper session
    // with signed cookies. This is the only reliable way to get the cookie
    // format right (HMAC-signed, session data cache cookie, etc.).
    const signInResponse = await auth.api.signInEmail({
      body: {
        email: entry.email,
        password: SANDBOX_PASSWORD,
      },
      asResponse: true,
      headers: req.headers,
    });

    if (!signInResponse.ok) {
      const errText = await signInResponse.text();
      console.error("[Sandbox] Better Auth sign-in failed:", signInResponse.status, errText);
      return NextResponse.json(
        { error: `Sign-in failed: ${errText}` },
        { status: 500 }
      );
    }

    // Build redirect URL
    const isPostOnboard = entry.mode === "pre-onboarded";
    const redirectPath = isPostOnboard ? "/discover" : "/dashboard";
    const redirectUrl = new URL(redirectPath, req.url);
    if (entry.domain) {
      redirectUrl.searchParams.set("sandbox_domain", entry.domain);
    }
    redirectUrl.searchParams.set("sandbox_mode", isPostOnboard ? "post" : "pre");

    const response = NextResponse.redirect(redirectUrl);

    // Forward ALL Set-Cookie headers from Better Auth's response
    // This includes the signed session token + session data cache
    const setCookieHeaders = signInResponse.headers.getSetCookie?.()
      ?? (signInResponse.headers as unknown as { raw?: () => Record<string, string[]> }).raw?.()?.["set-cookie"]
      ?? [];
    for (const cookie of setCookieHeaders) {
      response.headers.append("Set-Cookie", cookie);
    }

    // Also set the active organization cookie (Better Auth doesn't do this)
    const isProduction = process.env.NODE_ENV === "production";
    const orgCookieName = isProduction
      ? "__Secure-better-auth.active_organization"
      : "better-auth.active_organization";

    response.cookies.set(orgCookieName, entry.orgId, {
      httpOnly: false,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    if (isProduction) {
      response.cookies.set("better-auth.active_organization", entry.orgId, {
        httpOnly: false,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 30 * 24 * 60 * 60,
      });
    }

    // Set sandbox domain cookie for the layout's auto-enrich
    if (entry.domain) {
      response.cookies.set("cos_sandbox_domain", entry.domain, {
        httpOnly: false,
        secure: isProduction,
        sameSite: "lax",
        path: "/",
        maxAge: 86400, // 24 hours
      });
    }

    return response;
  } catch (error) {
    console.error("[Sandbox] Enter session error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
