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
    const redirectPath = isPostOnboard ? "/firm" : "/dashboard";
    const redirectUrl = new URL(redirectPath, req.url);
    if (entry.domain) {
      redirectUrl.searchParams.set("sandbox_domain", entry.domain);
    }
    redirectUrl.searchParams.set("sandbox_mode", isPostOnboard ? "post" : "pre");

    // Build the redirect response manually (don't use NextResponse.redirect
    // which can conflict with manually appended Set-Cookie headers)
    const response = new Response(null, {
      status: 302,
      headers: { Location: redirectUrl.toString() },
    });

    // Forward ALL Set-Cookie headers from Better Auth's sign-in response
    // This includes the HMAC-signed session token + session data cache
    const setCookieHeaders = signInResponse.headers.getSetCookie?.() ?? [];
    for (const cookie of setCookieHeaders) {
      response.headers.append("Set-Cookie", cookie);
    }

    console.log(`[Sandbox] Enter: forwarding ${setCookieHeaders.length} cookies from Better Auth sign-in`);

    // Set the active organization cookie (Better Auth doesn't set this)
    const isProduction = process.env.NODE_ENV === "production";
    const maxAge = 30 * 24 * 60 * 60; // 30 days

    if (isProduction) {
      response.headers.append(
        "Set-Cookie",
        `__Secure-better-auth.active_organization=${entry.orgId}; Path=/; Max-Age=${maxAge}; SameSite=Lax; Secure`
      );
      response.headers.append(
        "Set-Cookie",
        `better-auth.active_organization=${entry.orgId}; Path=/; Max-Age=${maxAge}; SameSite=Lax; Secure`
      );
    } else {
      response.headers.append(
        "Set-Cookie",
        `better-auth.active_organization=${entry.orgId}; Path=/; Max-Age=${maxAge}; SameSite=Lax`
      );
    }

    // Set sandbox cookies so middleware can persist URL params across navigation
    const secureSuffix = isProduction ? "; Secure" : "";
    if (entry.domain) {
      response.headers.append(
        "Set-Cookie",
        `cos_sandbox_domain=${entry.domain}; Path=/; Max-Age=86400; SameSite=Lax${secureSuffix}`
      );
    }
    response.headers.append(
      "Set-Cookie",
      `cos_sandbox_mode=${isPostOnboard ? "post" : "pre"}; Path=/; Max-Age=86400; SameSite=Lax${secureSuffix}`
    );

    return response;
  } catch (error) {
    console.error("[Sandbox] Enter session error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
