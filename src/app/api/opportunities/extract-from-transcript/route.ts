/**
 * POST /api/opportunities/extract-from-transcript
 *
 * Synchronous transcript extraction — runs AI opportunity detection inline
 * (no Inngest roundtrip) so results can be shown immediately in the chat UI.
 * Also creates callRecordings + callTranscripts records for admin visibility.
 */

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import {
  serviceFirms,
  members,
  callRecordings,
  callTranscripts,
  opportunities,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { extractOpportunities } from "@/lib/ai/opportunity-extractor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { transcript, organizationId } = (await req.json()) as {
    transcript: string;
    organizationId?: string;
  };

  if (!transcript || transcript.length < 100) {
    return new Response(JSON.stringify({ error: "Transcript too short" }), { status: 400 });
  }

  // Resolve firm
  let firmId: string | null = null;
  let firmName: string | null = null;
  let firmCategories: string[] = [];

  if (organizationId) {
    const firm = await db
      .select({ id: serviceFirms.id, name: serviceFirms.name, enrichmentData: serviceFirms.enrichmentData })
      .from(serviceFirms)
      .where(eq(serviceFirms.organizationId, organizationId))
      .limit(1);

    if (firm[0]) {
      firmId = firm[0].id;
      firmName = firm[0].name;
      const enrichment = firm[0].enrichmentData as { classification?: { categories?: string[] } } | null;
      firmCategories = enrichment?.classification?.categories ?? [];
    }
  }

  if (!firmId) {
    // Fallback: look up from user's membership
    const membership = await db
      .select({ orgId: members.organizationId })
      .from(members)
      .where(eq(members.userId, session.user.id))
      .limit(1);

    if (membership[0]) {
      const firm = await db
        .select({ id: serviceFirms.id, name: serviceFirms.name, enrichmentData: serviceFirms.enrichmentData })
        .from(serviceFirms)
        .where(eq(serviceFirms.organizationId, membership[0].orgId))
        .limit(1);

      if (firm[0]) {
        firmId = firm[0].id;
        firmName = firm[0].name;
        const enrichment = firm[0].enrichmentData as { classification?: { categories?: string[] } } | null;
        firmCategories = enrichment?.classification?.categories ?? [];
      }
    }
  }

  if (!firmId) {
    return new Response(JSON.stringify({ error: "No firm found" }), { status: 400 });
  }

  // Store transcript record
  const recId = uid("rec");
  const txId = uid("tx");

  await db.insert(callRecordings).values({
    id: recId,
    firmId,
    userId: session.user.id,
    callType: "client",
  });

  await db.insert(callTranscripts).values({
    id: txId,
    callRecordingId: recId,
    fullText: transcript,
    processingStatus: "done",
  });

  // Run extraction synchronously
  const extracted = await extractOpportunities(transcript, {
    firmName: firmName ?? undefined,
    firmCategories: firmCategories.length > 0 ? firmCategories : undefined,
    source: "call",
  });

  // Insert into DB and collect inserted records
  const inserted: {
    id: string;
    title: string;
    description: string;
    evidence: string | null;
    signalType: string;
    priority: string;
    resolutionApproach: string;
    requiredCategories: string[];
    requiredSkills: string[];
    requiredIndustries: string[];
    estimatedValue: string | null;
    timeline: string | null;
    clientName: string | null;
  }[] = [];

  for (const opp of extracted) {
    const oppId = uid("opp");
    await db.insert(opportunities).values({
      id: oppId,
      firmId,
      createdBy: session.user.id,
      title: opp.title,
      description: opp.description,
      evidence: opp.evidence ?? null,
      signalType: opp.signalType ?? "direct",
      priority: opp.priority ?? "medium",
      resolutionApproach: opp.resolutionApproach ?? "network",
      requiredCategories: opp.requiredCategories ?? [],
      requiredSkills: opp.requiredSkills ?? [],
      requiredIndustries: opp.requiredIndustries ?? [],
      requiredMarkets: opp.requiredMarkets ?? [],
      estimatedValue: opp.estimatedValue ?? null,
      timeline: opp.timeline ?? null,
      clientName: opp.clientName ?? null,
      clientSizeBand: (opp.clientSizeBand ?? null) as "individual" | "micro_1_10" | "small_11_50" | "emerging_51_200" | "mid_201_500" | "upper_mid_501_1000" | "large_1001_5000" | "major_5001_10000" | "global_10000_plus" | null,
      source: "call",
      sourceId: txId,
      status: "new",
    });

    inserted.push({
      id: oppId,
      title: opp.title,
      description: opp.description,
      evidence: opp.evidence ?? null,
      signalType: opp.signalType ?? "direct",
      priority: opp.priority ?? "medium",
      resolutionApproach: opp.resolutionApproach ?? "network",
      requiredCategories: opp.requiredCategories ?? [],
      requiredSkills: opp.requiredSkills ?? [],
      requiredIndustries: opp.requiredIndustries ?? [],
      estimatedValue: opp.estimatedValue ?? null,
      timeline: opp.timeline ?? null,
      clientName: opp.clientName ?? null,
    });
  }

  return Response.json({
    transcriptId: txId,
    recordingId: recId,
    totalFound: inserted.length,
    opportunities: inserted,
  });
}
