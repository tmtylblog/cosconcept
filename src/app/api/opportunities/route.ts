/**
 * Opportunity API — CRUD
 *
 * GET  /api/opportunities — List opportunities (own + shared with us)
 * POST /api/opportunities — Create a new opportunity
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import {
  opportunities,
  opportunityShares,
} from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import type { CreateOpportunityInput } from "@/types/partnerships";

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * GET — List opportunities for user's firm (own + shared).
 * Query: ?firmId=xxx&status=open
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const firmId = url.searchParams.get("firmId");

  if (!firmId) {
    return NextResponse.json({ error: "firmId is required" }, { status: 400 });
  }

  // Get own opportunities
  const ownOpportunities = await db
    .select()
    .from(opportunities)
    .where(eq(opportunities.firmId, firmId))
    .orderBy(desc(opportunities.createdAt));

  // Get opportunities shared with us
  const sharedWithUs = await db
    .select({
      share: opportunityShares,
      opportunity: opportunities,
    })
    .from(opportunityShares)
    .innerJoin(opportunities, eq(opportunityShares.opportunityId, opportunities.id))
    .where(eq(opportunityShares.sharedWithFirmId, firmId))
    .orderBy(desc(opportunityShares.createdAt));

  // Get share counts for own opportunities
  const ownWithShares = await Promise.all(
    ownOpportunities.map(async (opp) => {
      const shares = await db
        .select()
        .from(opportunityShares)
        .where(eq(opportunityShares.opportunityId, opp.id));

      return {
        ...opp,
        shareCount: shares.length,
        claimedCount: shares.filter((s) => s.claimedAt).length,
        isOwn: true,
      };
    })
  );

  const sharedOpportunities = sharedWithUs.map((s) => ({
    ...s.opportunity,
    shareId: s.share.id,
    viewedAt: s.share.viewedAt,
    claimedAt: s.share.claimedAt,
    isOwn: false,
  }));

  return NextResponse.json({
    own: ownWithShares,
    shared: sharedOpportunities,
  });
}

/**
 * POST — Create a new opportunity.
 * Body: { firmId, title, description, requiredSkills, ... }
 */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as CreateOpportunityInput & { firmId: string };
  const { firmId, title, description, requiredSkills, requiredIndustries, estimatedValue, timeline, clientType, source = "manual" } = body;

  if (!firmId || !title) {
    return NextResponse.json(
      { error: "firmId and title are required" },
      { status: 400 }
    );
  }

  const oppId = generateId("opp");

  await db.insert(opportunities).values({
    id: oppId,
    firmId,
    createdBy: session.user.id,
    title,
    description: description ?? null,
    requiredSkills: requiredSkills ?? null,
    requiredIndustries: requiredIndustries ?? null,
    estimatedValue: estimatedValue ?? null,
    timeline: timeline ?? null,
    clientType: clientType ?? null,
    source,
    status: "open",
  });

  return NextResponse.json(
    { opportunity: { id: oppId, title, status: "open" } },
    { status: 201 }
  );
}
