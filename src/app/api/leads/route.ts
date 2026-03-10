/**
 * Leads API
 *
 * GET  /api/leads?firmId=xxx   — List leads created by this firm + leads shared with us
 * POST /api/leads              — Create a lead directly (without an opportunity)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { leads, leadShares } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { scoreLeadQuality } from "@/lib/opportunities/quality-scorer";
type SizeBand = "individual" | "micro_1_10" | "small_11_50" | "emerging_51_200" | "mid_201_500" | "upper_mid_501_1000" | "large_1001_5000" | "major_5001_10000" | "global_10000_plus";

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const firmId = new URL(req.url).searchParams.get("firmId");
  if (!firmId) {
    return NextResponse.json({ error: "firmId is required" }, { status: 400 });
  }

  // Leads this firm created
  const ownLeads = await db
    .select()
    .from(leads)
    .where(eq(leads.firmId, firmId))
    .orderBy(desc(leads.createdAt));

  // Leads shared with this firm
  const sharedWithUs = await db
    .select({ share: leadShares, lead: leads })
    .from(leadShares)
    .innerJoin(leads, eq(leadShares.leadId, leads.id))
    .where(eq(leadShares.sharedWithFirmId, firmId))
    .orderBy(desc(leadShares.createdAt));

  return NextResponse.json({
    own: ownLeads.map((l) => ({ ...l, isOwn: true })),
    shared: sharedWithUs.map((s) => ({
      ...s.lead,
      shareId: s.share.id,
      viewedAt: s.share.viewedAt,
      claimedAt: s.share.claimedAt,
      isOwn: false,
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    firmId,
    title,
    description,
    evidence,
    requiredCategories = [],
    requiredSkills = [],
    requiredIndustries = [],
    requiredMarkets = [],
    estimatedValue,
    timeline,
    clientDomain,
    clientName,
    anonymizeClient = false,
    clientSizeBand,
    clientType,
    attachments = [],
  } = body;

  if (!firmId || !title || !description) {
    return NextResponse.json(
      { error: "firmId, title, and description are required" },
      { status: 400 }
    );
  }

  const { score, breakdown } = scoreLeadQuality({
    title,
    description,
    evidence,
    requiredCategories,
    requiredSkills,
    requiredIndustries,
    estimatedValue,
    timeline,
    clientDomain,
    clientSizeBand,
    source: "manual",
    attachments,
  });

  const id = generateId("lead");

  await db.insert(leads).values({
    id,
    firmId,
    createdBy: session.user.id,
    opportunityId: null,
    title,
    description,
    evidence: evidence ?? null,
    requiredCategories,
    requiredSkills,
    requiredIndustries,
    requiredMarkets,
    estimatedValue: estimatedValue ?? null,
    timeline: timeline ?? null,
    clientDomain: clientDomain ?? null,
    clientName: clientName ?? null,
    anonymizeClient,
    clientSizeBand: (clientSizeBand as SizeBand | null | undefined) ?? null,
    clientType: clientType ?? null,
    attachments,
    qualityScore: score,
    qualityBreakdown: breakdown,
    status: "open",
  });

  return NextResponse.json({ lead: { id, qualityScore: score } }, { status: 201 });
}
