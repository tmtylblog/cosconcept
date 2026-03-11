/**
 * POST /api/partner-sync/provision-user
 *
 * When CORE grants a Chameleon team member COS access,
 * this creates their COS account and adds them to the org.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, members, organizations, serviceFirms } from "@/lib/db/schema";
import { eq, ilike } from "drizzle-orm";
import { authenticatePartner } from "../lib/auth";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = authenticatePartner(req);
  if (auth instanceof NextResponse) return auth;

  let body: { name?: string; email?: string; organizationId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, email } = body;

  if (!email) {
    return NextResponse.json(
      { error: "email is required" },
      { status: 400 }
    );
  }

  try {
    // Find or resolve the partner's organization
    // Look for a service_firm matching the partner (chameleon.co domain)
    const emailDomain = email.split("@")[1];
    let orgId: string | undefined;

    // Check if user already exists
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (existingUser) {
      // User exists — check if they're already in a matching org
      const [membership] = await db
        .select({ orgId: members.organizationId })
        .from(members)
        .where(eq(members.userId, existingUser.id))
        .limit(1);

      return NextResponse.json({
        success: true,
        message: "User already exists",
        userId: existingUser.id,
        organizationId: membership?.orgId ?? null,
      });
    }

    // Find an org that has a firm matching this email domain
    if (emailDomain) {
      const [firm] = await db
        .select({ orgId: serviceFirms.organizationId })
        .from(serviceFirms)
        .where(ilike(serviceFirms.website, `%${emailDomain}%`))
        .limit(1);

      orgId = firm?.orgId ?? undefined;
    }

    // Create the user account
    // Better Auth stores users in the users table directly
    const userId = crypto.randomBytes(16).toString("hex");
    const now = new Date();

    await db.insert(users).values({
      id: userId,
      name: name ?? email.split("@")[0],
      email: email.toLowerCase(),
      emailVerified: true,
      role: "user",
      createdAt: now,
      updatedAt: now,
    });

    // Add to org if found
    if (orgId) {
      const memberId = crypto.randomBytes(16).toString("hex");
      await db.insert(members).values({
        id: memberId,
        userId,
        organizationId: orgId,
        role: "member",
        createdAt: now,
      });
    }

    return NextResponse.json({
      success: true,
      userId,
      organizationId: orgId ?? null,
    });
  } catch (err) {
    console.error("[Partner Sync] provision-user failed:", err);
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}
