/**
 * Opportunity Detail API
 *
 * GET   /api/opportunities/[id]  — Get opportunity details
 * PATCH /api/opportunities/[id]  — Update status or details
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { opportunities } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

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

  return NextResponse.json({ opportunity });
}

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

  const existing = await db.query.opportunities.findFirst({
    where: eq(opportunities.id, id),
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (body.status) updates.status = body.status;
  if (body.title) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.evidence !== undefined) updates.evidence = body.evidence;
  if (body.signalType) updates.signalType = body.signalType;
  if (body.priority) updates.priority = body.priority;
  if (body.resolutionApproach) updates.resolutionApproach = body.resolutionApproach;
  if (body.requiredCategories) updates.requiredCategories = body.requiredCategories;
  if (body.requiredSkills) updates.requiredSkills = body.requiredSkills;
  if (body.requiredIndustries) updates.requiredIndustries = body.requiredIndustries;
  if (body.requiredMarkets) updates.requiredMarkets = body.requiredMarkets;
  if (body.estimatedValue !== undefined) updates.estimatedValue = body.estimatedValue;
  if (body.timeline !== undefined) updates.timeline = body.timeline;
  if (body.clientDomain !== undefined) updates.clientDomain = body.clientDomain;
  if (body.clientName !== undefined) updates.clientName = body.clientName;
  if (body.anonymizeClient !== undefined) updates.anonymizeClient = body.anonymizeClient;
  if (body.clientSizeBand !== undefined) updates.clientSizeBand = body.clientSizeBand;
  if (body.attachments) updates.attachments = body.attachments;

  await db.update(opportunities).set(updates).where(eq(opportunities.id, id));

  return NextResponse.json({ success: true });
}
