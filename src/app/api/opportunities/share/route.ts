/**
 * Promote Opportunity to Lead
 *
 * POST /api/opportunities/share
 *
 * Creates a Lead from an Opportunity — the shareable version that can be
 * posted to the partner network. Scores lead quality automatically.
 * Marks the source opportunity as "actioned".
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { opportunities, leads } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { scoreLeadQuality } from "@/lib/opportunities/quality-scorer";
type SizeBand = "individual" | "micro_1_10" | "small_11_50" | "emerging_51_200" | "mid_201_500" | "upper_mid_501_1000" | "large_1001_5000" | "major_5001_10000" | "global_10000_plus";

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { opportunityId, overrides = {} } = body as {
    opportunityId: string;
    overrides?: Record<string, unknown>;
  };

  if (!opportunityId) {
    return NextResponse.json({ error: "opportunityId is required" }, { status: 400 });
  }

  const opp = await db.query.opportunities.findFirst({
    where: eq(opportunities.id, opportunityId),
  });

  if (!opp) {
    return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
  }

  const leadData = {
    title: (overrides.title as string) ?? opp.title,
    description: (overrides.description as string) ?? opp.description ?? "",
    evidence: (overrides.evidence as string | undefined) ?? opp.evidence ?? undefined,
    requiredCategories: (overrides.requiredCategories as string[]) ?? opp.requiredCategories ?? [],
    requiredSkills: (overrides.requiredSkills as string[]) ?? opp.requiredSkills ?? [],
    requiredIndustries: (overrides.requiredIndustries as string[]) ?? opp.requiredIndustries ?? [],
    requiredMarkets: (overrides.requiredMarkets as string[]) ?? opp.requiredMarkets ?? [],
    estimatedValue: (overrides.estimatedValue as string | undefined) ?? opp.estimatedValue ?? undefined,
    timeline: (overrides.timeline as string | undefined) ?? opp.timeline ?? undefined,
    clientDomain: (overrides.clientDomain as string | undefined) ?? opp.clientDomain ?? undefined,
    clientName: (overrides.clientName as string | undefined) ?? opp.clientName ?? undefined,
    anonymizeClient: (overrides.anonymizeClient as boolean | undefined) ?? opp.anonymizeClient,
    clientSizeBand: (overrides.clientSizeBand as string | undefined) ?? opp.clientSizeBand ?? undefined,
    source: opp.source,
    attachments: (overrides.attachments as { name: string; url: string; type: string; size: number }[] | undefined) ?? (opp.attachments as { name: string; url: string; type: string; size: number }[] | null) ?? [],
  };

  if (!leadData.description) {
    return NextResponse.json(
      { error: "A description is required to create a lead" },
      { status: 400 }
    );
  }

  const { score, breakdown } = scoreLeadQuality(leadData);
  const leadId = generateId("lead");

  await db.insert(leads).values({
    id: leadId,
    firmId: opp.firmId,
    createdBy: session.user.id,
    opportunityId: opp.id,
    title: leadData.title,
    description: leadData.description,
    evidence: leadData.evidence ?? null,
    requiredCategories: leadData.requiredCategories,
    requiredSkills: leadData.requiredSkills,
    requiredIndustries: leadData.requiredIndustries,
    requiredMarkets: leadData.requiredMarkets,
    estimatedValue: leadData.estimatedValue ?? null,
    timeline: leadData.timeline ?? null,
    clientDomain: leadData.clientDomain ?? null,
    clientName: leadData.clientName ?? null,
    anonymizeClient: leadData.anonymizeClient,
    clientSizeBand: (leadData.clientSizeBand as SizeBand | null | undefined) ?? null,
    attachments: leadData.attachments,
    qualityScore: score,
    qualityBreakdown: breakdown,
    status: "open",
  });

  // Mark the opportunity as actioned
  await db
    .update(opportunities)
    .set({ status: "actioned", updatedAt: new Date() })
    .where(eq(opportunities.id, opportunityId));

  return NextResponse.json(
    { lead: { id: leadId, qualityScore: score } },
    { status: 201 }
  );
}
