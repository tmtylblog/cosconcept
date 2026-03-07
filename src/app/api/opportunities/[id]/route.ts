/**
 * Opportunity Detail API
 *
 * GET   /api/opportunities/[id] — Get details
 * PATCH /api/opportunities/[id] — Update status or details
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { opportunities, opportunityShares, serviceFirms } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET — Opportunity details with share info.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const opportunity = await db.query.opportunities.findFirst({
    where: eq(opportunities.id, id),
  });

  if (!opportunity) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Get shares with firm names
  const shares = await db
    .select({
      share: opportunityShares,
      firm: {
        id: serviceFirms.id,
        name: serviceFirms.name,
        website: serviceFirms.website,
      },
    })
    .from(opportunityShares)
    .leftJoin(serviceFirms, eq(opportunityShares.sharedWithFirmId, serviceFirms.id))
    .where(eq(opportunityShares.opportunityId, id));

  return NextResponse.json({
    opportunity: {
      ...opportunity,
      shares: shares.map((s) => ({
        ...s.share,
        firm: s.firm,
      })),
    },
  });
}

/**
 * PATCH — Update opportunity (status, details).
 * Body: { status?, title?, description?, ... }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  const opportunity = await db.query.opportunities.findFirst({
    where: eq(opportunities.id, id),
  });

  if (!opportunity) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (body.status) updates.status = body.status;
  if (body.title) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.requiredSkills) updates.requiredSkills = body.requiredSkills;
  if (body.requiredIndustries) updates.requiredIndustries = body.requiredIndustries;
  if (body.estimatedValue !== undefined) updates.estimatedValue = body.estimatedValue;
  if (body.timeline !== undefined) updates.timeline = body.timeline;
  if (body.clientType !== undefined) updates.clientType = body.clientType;

  await db
    .update(opportunities)
    .set(updates)
    .where(eq(opportunities.id, id));

  return NextResponse.json({ success: true });
}
