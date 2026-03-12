/**
 * POST /api/dev/auto-login
 *
 * Automatically creates a session for the dev test user.
 * Only available when DEV_BYPASS_ONBOARDING=true (local development).
 *
 * Flow:
 * 1. Seeds user if not exists (calls seed endpoint internally)
 * 2. Creates a session directly in the DB
 * 3. Sets the session cookie
 * 4. Sets the active organization
 *
 * The client can then reload and be fully authenticated.
 */

import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { users, sessions, organizations, members } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { DEV_USER, DEV_ORG } from "@/lib/dev/test-data";

export const dynamic = "force-dynamic";

function isDev(): boolean {
  return (
    process.env.DEV_BYPASS_ONBOARDING === "true" &&
    process.env.NODE_ENV !== "production"
  );
}

export async function POST() {
  if (!isDev()) {
    return NextResponse.json(
      { error: "Dev endpoints are disabled in production" },
      { status: 403 }
    );
  }

  try {
    // ─── 1. Ensure user is seeded ──────────────────────────
    const seedRes = await fetch(
      `${process.env.BETTER_AUTH_URL ?? "http://localhost:3000"}/api/dev/seed-test-user`,
      { method: "POST" }
    );

    if (!seedRes.ok) {
      const err = await seedRes.text();
      return NextResponse.json(
        { error: "Failed to seed user", detail: err },
        { status: 500 }
      );
    }

    // ─── 2. Find the user ──────────────────────────────────
    const [user] = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.email, DEV_USER.email))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: "User not found after seed" }, { status: 500 });
    }

    // ─── 3. Find the org ───────────────────────────────────
    const [org] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, DEV_ORG.slug))
      .limit(1);

    // ─── 4. Create a session directly ──────────────────────
    // Better Auth session tokens are opaque strings.
    // We create one manually and set the cookie.
    const sessionToken = crypto.randomBytes(32).toString("hex");
    const sessionId = crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    const now = new Date();

    // Delete any existing sessions for this user (clean slate)
    await db.delete(sessions).where(eq(sessions.userId, user.id));

    // Insert new session
    await db.insert(sessions).values({
      id: sessionId,
      userId: user.id,
      token: sessionToken,
      expiresAt,
      ipAddress: "127.0.0.1",
      userAgent: "claude-dev-auto-login",
      createdAt: now,
      updatedAt: now,
    });

    // ─── 5. Build response with session cookie ─────────────
    // Better Auth uses "better-auth.session_token" cookie in development
    // (no __Secure- prefix on HTTP)
    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      organization: org ? { id: org.id } : null,
      sessionId,
      message: "Logged in as dev user. Reload the page to see the app.",
    });

    // Set session cookie — Better Auth reads this to authenticate
    response.cookies.set("better-auth.session_token", sessionToken, {
      httpOnly: true,
      secure: false, // HTTP in local dev
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });

    // Set active organization cookie if org exists
    if (org) {
      response.cookies.set("better-auth.active_organization", org.id, {
        httpOnly: false,
        secure: false,
        sameSite: "lax",
        path: "/",
        expires: expiresAt,
      });
    }

    return response;
  } catch (error) {
    console.error("[Dev Auto-Login] Error:", error);
    return NextResponse.json(
      { error: "Auto-login failed", message: String(error) },
      { status: 500 }
    );
  }
}
