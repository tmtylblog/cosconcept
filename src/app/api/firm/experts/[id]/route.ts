/**
 * PATCH /api/firm/experts/[id]
 *
 * Update expert profile fields (roster status, etc.)
 * Requires org membership — the expert must belong to the caller's firm.
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { expertProfiles, serviceFirms, members } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const VALID_ROSTER_STATUSES = ["active", "prior", "incorrect"];
const VALID_TIERS = ["expert", "potential_expert", "not_expert"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    const headersList = await headers();
    session = await auth.api.getSession({ headers: headersList });
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    const { rosterStatus, expertTier } = body;

    // Validate roster status
    if (rosterStatus && !VALID_ROSTER_STATUSES.includes(rosterStatus)) {
      return NextResponse.json({ error: "Invalid roster status" }, { status: 400 });
    }

    // Validate expert tier
    if (expertTier && !VALID_TIERS.includes(expertTier)) {
      return NextResponse.json({ error: "Invalid expert tier" }, { status: 400 });
    }

    // Find the expert
    const [expert] = await db
      .select({ id: expertProfiles.id, firmId: expertProfiles.firmId })
      .from(expertProfiles)
      .where(eq(expertProfiles.id, id))
      .limit(1);

    if (!expert) {
      return NextResponse.json({ error: "Expert not found" }, { status: 404 });
    }

    // Verify caller is a member of the expert's firm org
    const [firm] = await db
      .select({ organizationId: serviceFirms.organizationId })
      .from(serviceFirms)
      .where(eq(serviceFirms.id, expert.firmId))
      .limit(1);

    if (!firm?.organizationId) {
      return NextResponse.json({ error: "Firm not found" }, { status: 404 });
    }

    // Check membership (admin/superadmin bypass)
    const isAdmin = ["admin", "superadmin"].includes(session.user.role ?? "");
    if (!isAdmin) {
      const [membership] = await db
        .select({ id: members.id })
        .from(members)
        .where(
          and(
            eq(members.organizationId, firm.organizationId),
            eq(members.userId, session.user.id)
          )
        )
        .limit(1);

      if (!membership) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Build update
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (rosterStatus) updates.rosterStatus = rosterStatus;

    // If changing tier, update the classifiedAs field in pdlData
    if (expertTier) {
      const [current] = await db
        .select({ pdlData: expertProfiles.pdlData })
        .from(expertProfiles)
        .where(eq(expertProfiles.id, id))
        .limit(1);

      const existingPdl = (current?.pdlData as Record<string, unknown>) ?? {};
      updates.pdlData = { ...existingPdl, classifiedAs: expertTier };
    }

    await db
      .update(expertProfiles)
      .set(updates)
      .where(eq(expertProfiles.id, id));

    return NextResponse.json({ ok: true, rosterStatus });
  } catch (error) {
    console.error("[FirmExperts] PATCH error:", error);
    return NextResponse.json({ error: "Failed to update expert" }, { status: 500 });
  }
}
