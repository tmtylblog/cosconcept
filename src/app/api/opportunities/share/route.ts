/**
 * Opportunity Sharing API
 *
 * POST /api/opportunities/share — Share an opportunity with partner firms
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { opportunities, opportunityShares, partnerships } from "@/lib/db/schema";
import { eq, or, and } from "drizzle-orm";
import type { ShareOpportunityInput } from "@/types/partnerships";

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * POST — Share an opportunity with selected partner firms.
 * Body: { opportunityId, firmIds }
 */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as ShareOpportunityInput & {
    opportunityId: string;
  };
  const { opportunityId, firmIds } = body;

  if (!opportunityId || !firmIds?.length) {
    return NextResponse.json(
      { error: "opportunityId and firmIds are required" },
      { status: 400 }
    );
  }

  // Verify opportunity exists
  const opportunity = await db.query.opportunities.findFirst({
    where: eq(opportunities.id, opportunityId),
  });

  if (!opportunity) {
    return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
  }

  // Verify firms are trusted partners
  const validFirmIds: string[] = [];
  for (const targetFirmId of firmIds) {
    const isPartner = await db.query.partnerships.findFirst({
      where: and(
        or(
          and(
            eq(partnerships.firmAId, opportunity.firmId),
            eq(partnerships.firmBId, targetFirmId)
          ),
          and(
            eq(partnerships.firmAId, targetFirmId),
            eq(partnerships.firmBId, opportunity.firmId)
          )
        ),
        eq(partnerships.status, "accepted")
      ),
    });

    if (isPartner) {
      validFirmIds.push(targetFirmId);
    }
  }

  if (validFirmIds.length === 0) {
    return NextResponse.json(
      { error: "No valid partner firms to share with" },
      { status: 400 }
    );
  }

  // Create shares (skip duplicates)
  const created: string[] = [];
  for (const targetFirmId of validFirmIds) {
    const existing = await db.query.opportunityShares.findFirst({
      where: and(
        eq(opportunityShares.opportunityId, opportunityId),
        eq(opportunityShares.sharedWithFirmId, targetFirmId)
      ),
    });

    if (!existing) {
      const shareId = generateId("osh");
      await db.insert(opportunityShares).values({
        id: shareId,
        opportunityId,
        sharedWithFirmId: targetFirmId,
        sharedBy: session.user.id,
      });
      created.push(targetFirmId);
    }
  }

  // Update opportunity status to "shared" if currently "open"
  if (opportunity.status === "open" && created.length > 0) {
    await db
      .update(opportunities)
      .set({ status: "shared", updatedAt: new Date() })
      .where(eq(opportunities.id, opportunityId));
  }

  return NextResponse.json({
    shared: created.length,
    skipped: validFirmIds.length - created.length,
    invalidPartners: firmIds.length - validFirmIds.length,
  });
}
