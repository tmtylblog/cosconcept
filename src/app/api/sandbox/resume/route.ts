/**
 * POST /api/sandbox/resume
 *
 * Generates a new one-time login token for an existing sandbox user.
 * This allows the superadmin to re-enter a test session without creating
 * a new user. Auth: superadmin session required.
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, members, serviceFirms } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createToken } from "@/lib/sandbox/token-store";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Auth: superadmin only
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user || session.user.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const userId = body.userId as string;

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    // Verify this is a sandbox user
    const [user] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!user.email.match(/^support\+sandbox-.*@joincollectiveos\.com$/)) {
      return NextResponse.json({ error: "Not a sandbox user" }, { status: 400 });
    }

    // Find their org
    const [membership] = await db
      .select({ orgId: members.organizationId })
      .from(members)
      .where(eq(members.userId, userId))
      .limit(1);

    if (!membership) {
      return NextResponse.json({ error: "No org found for user" }, { status: 404 });
    }

    // Look up firm domain for the redirect hint
    const firmId = `firm_${membership.orgId}`;
    const [firm] = await db
      .select({ website: serviceFirms.website })
      .from(serviceFirms)
      .where(eq(serviceFirms.id, firmId))
      .limit(1);
    const domain = firm?.website?.replace(/^https?:\/\//, "").replace(/\/+$/, "") || undefined;

    const token = await createToken({
      userId,
      orgId: membership.orgId,
      domain,
    });
    const loginUrl = `/api/sandbox/enter?token=${token}`;

    return NextResponse.json({ success: true, loginUrl });
  } catch (error) {
    console.error("[Sandbox] Resume error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
