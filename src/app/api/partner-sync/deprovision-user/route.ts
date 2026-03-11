/**
 * POST /api/partner-sync/deprovision-user
 *
 * When COS access is revoked in CORE, removes the user
 * from the partner's organization (does not delete the user account).
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, members, serviceFirms } from "@/lib/db/schema";
import { eq, and, ilike } from "drizzle-orm";
import { authenticatePartner } from "../lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = authenticatePartner(req);
  if (auth instanceof NextResponse) return auth;

  let body: { email?: string; partnerId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { email } = body;

  if (!email) {
    return NextResponse.json(
      { error: "email is required" },
      { status: 400 }
    );
  }

  try {
    // Find the user
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (!user) {
      return NextResponse.json({
        success: true,
        message: "User not found — already deprovisioned",
      });
    }

    // Find the partner's org via email domain
    const emailDomain = email.split("@")[1];
    let orgId: string | undefined;

    if (emailDomain) {
      const [firm] = await db
        .select({ orgId: serviceFirms.organizationId })
        .from(serviceFirms)
        .where(ilike(serviceFirms.website, `%${emailDomain}%`))
        .limit(1);

      orgId = firm?.orgId ?? undefined;
    }

    if (orgId) {
      // Remove membership (don't delete the user account)
      await db
        .delete(members)
        .where(
          and(
            eq(members.userId, user.id),
            eq(members.organizationId, orgId)
          )
        );
    }

    return NextResponse.json({
      success: true,
      userId: user.id,
      removedFromOrg: orgId ?? null,
    });
  } catch (err) {
    console.error("[Partner Sync] deprovision-user failed:", err);
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}
