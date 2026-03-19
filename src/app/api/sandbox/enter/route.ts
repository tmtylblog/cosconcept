/**
 * GET /api/sandbox/enter?token=xxx
 *
 * Consumes a one-time sandbox login token, creates a DB session,
 * sets session cookies, and redirects to /dashboard.
 *
 * This route is in PUBLIC_EXCEPTIONS in middleware.ts because
 * the browser needs to access it without an existing session.
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { consumeToken } from "@/lib/sandbox/token-store";

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
    // Create a session directly in the DB (same pattern as auto-login)
    const sessionToken = crypto.randomBytes(32).toString("hex");
    const sessionId = crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    const now = new Date();

    await db.insert(sessions).values({
      id: sessionId,
      userId: entry.userId,
      token: sessionToken,
      expiresAt,
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
      userAgent: "sandbox-session",
      createdAt: now,
      updatedAt: now,
    });

    // Redirect with session cookies.
    // Post-onboard → /discover (onboarding already complete)
    // Pre-onboard → /dashboard (full onboarding flow)
    const isProduction = process.env.NODE_ENV === "production";
    const isPostOnboard = entry.mode === "pre-onboarded";
    const redirectPath = isPostOnboard ? "/discover" : "/dashboard";
    const redirectUrl = new URL(redirectPath, req.url);
    // Pass sandbox info so the client can identify the session type and enrich the right domain
    if (entry.domain) {
      redirectUrl.searchParams.set("sandbox_domain", entry.domain);
    }
    redirectUrl.searchParams.set("sandbox_mode", isPostOnboard ? "post" : "pre");
    const response = NextResponse.redirect(redirectUrl);

    const sessionCookieName = isProduction
      ? "__Secure-better-auth.session_token"
      : "better-auth.session_token";
    const orgCookieName = isProduction
      ? "__Secure-better-auth.active_organization"
      : "better-auth.active_organization";

    // Set session cookie
    response.cookies.set(sessionCookieName, sessionToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });

    // Also set the unprefixed version in production (some code checks both)
    if (isProduction) {
      response.cookies.set("better-auth.session_token", sessionToken, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        expires: expiresAt,
      });
    }

    // Set active organization cookie
    response.cookies.set(orgCookieName, entry.orgId, {
      httpOnly: false,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });

    if (isProduction) {
      response.cookies.set("better-auth.active_organization", entry.orgId, {
        httpOnly: false,
        secure: true,
        sameSite: "lax",
        path: "/",
        expires: expiresAt,
      });
    }

    // Set sandbox domain cookie so the layout auto-enrich uses the correct domain
    // (not the joincollectiveos.com email domain). Persists across redirects.
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
