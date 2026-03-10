/**
 * Lead Detail API
 *
 * GET   /api/leads/[id]  — Lead details with share info
 * PATCH /api/leads/[id]  — Update lead status or details
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { leads, leadShares, serviceFirms } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { scoreLeadQuality } from "@/lib/opportunities/quality-scorer";
type SizeBand = "individual" | "micro_1_10" | "small_11_50" | "emerging_51_200" | "mid_201_500" | "upper_mid_501_1000" | "large_1001_5000" | "major_5001_10000" | "global_10000_plus";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, id),
  });

  if (!lead) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const shares = await db
    .select({
      share: leadShares,
      firm: { id: serviceFirms.id, name: serviceFirms.name, website: serviceFirms.website },
    })
    .from(leadShares)
    .leftJoin(serviceFirms, eq(leadShares.sharedWithFirmId, serviceFirms.id))
    .where(eq(leadShares.leadId, id));

  return NextResponse.json({
    lead: {
      ...lead,
      shares: shares.map((s) => ({ ...s.share, firm: s.firm })),
    },
  });
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

  const existing = await db.query.leads.findFirst({ where: eq(leads.id, id) });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (body.status) updates.status = body.status;
  if (body.title) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.evidence !== undefined) updates.evidence = body.evidence;
  if (body.requiredCategories) updates.requiredCategories = body.requiredCategories;
  if (body.requiredSkills) updates.requiredSkills = body.requiredSkills;
  if (body.requiredIndustries) updates.requiredIndustries = body.requiredIndustries;
  if (body.requiredMarkets) updates.requiredMarkets = body.requiredMarkets;
  if (body.estimatedValue !== undefined) updates.estimatedValue = body.estimatedValue;
  if (body.timeline !== undefined) updates.timeline = body.timeline;
  if (body.clientDomain !== undefined) updates.clientDomain = body.clientDomain;
  if (body.clientName !== undefined) updates.clientName = body.clientName;
  if (body.anonymizeClient !== undefined) updates.anonymizeClient = body.anonymizeClient;
  if (body.clientSizeBand !== undefined) updates.clientSizeBand = body.clientSizeBand as SizeBand | null;
  if (body.clientType !== undefined) updates.clientType = body.clientType;
  if (body.attachments) updates.attachments = body.attachments;

  // Re-score if content fields changed
  const contentChanged =
    body.description || body.requiredCategories || body.requiredSkills ||
    body.estimatedValue !== undefined || body.timeline !== undefined ||
    body.clientDomain !== undefined || body.attachments;

  if (contentChanged) {
    const merged = { ...existing, ...updates };
    const { score, breakdown } = scoreLeadQuality({
      title: merged.title as string,
      description: merged.description as string,
      evidence: merged.evidence as string | undefined,
      requiredCategories: merged.requiredCategories as string[],
      requiredSkills: merged.requiredSkills as string[],
      requiredIndustries: merged.requiredIndustries as string[],
      estimatedValue: merged.estimatedValue as string | undefined,
      timeline: merged.timeline as string | undefined,
      clientDomain: merged.clientDomain as string | undefined,
      clientSizeBand: merged.clientSizeBand as string | undefined,
      source: existing.opportunityId ? "call" : "manual",
      attachments: merged.attachments as { name: string }[],
    });
    updates.qualityScore = score;
    updates.qualityBreakdown = breakdown;
  }

  await db.update(leads).set(updates).where(eq(leads.id, id));

  return NextResponse.json({ success: true });
}
