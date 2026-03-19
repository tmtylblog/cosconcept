/**
 * POST /api/admin/calls/upload
 *
 * Admin-level transcript upload. Creates call recording + transcript records,
 * then fires the Inngest pipeline for opportunity extraction + coaching analysis.
 */

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import {
  callRecordings,
  callTranscripts,
  serviceFirms,
  platformSettings,
  members,
  companyResearch,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { inngest } from "@/inngest/client";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user.role !== "superadmin") {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  const { transcript, firmId, callType, clientDomain } = (await req.json()) as {
    transcript: string;
    firmId?: string;
    callType?: string;
    clientDomain?: string;
  };

  if (!transcript || transcript.length < 100) {
    return Response.json({ error: "Transcript too short (min 100 chars)" }, { status: 400 });
  }

  // Resolve firm — use provided firmId, or look up from admin's membership
  let resolvedFirmId = firmId ?? null;
  let firmName: string | null = null;

  if (resolvedFirmId) {
    const firm = await db
      .select({ id: serviceFirms.id, name: serviceFirms.name })
      .from(serviceFirms)
      .where(eq(serviceFirms.id, resolvedFirmId))
      .limit(1);
    if (firm[0]) {
      firmName = firm[0].name;
    } else {
      return Response.json({ error: "Firm not found" }, { status: 400 });
    }
  }

  // Fallback: look up firm from admin's membership
  if (!resolvedFirmId) {
    const membership = await db
      .select({ orgId: members.organizationId })
      .from(members)
      .where(eq(members.userId, session.user.id))
      .limit(1);
    if (membership[0]) {
      const firm = await db
        .select({ id: serviceFirms.id, name: serviceFirms.name })
        .from(serviceFirms)
        .where(eq(serviceFirms.organizationId, membership[0].orgId))
        .limit(1);
      if (firm[0]) {
        resolvedFirmId = firm[0].id;
        firmName = firm[0].name;
      }
    }
  }

  // Last resort: use the first firm in the system
  if (!resolvedFirmId) {
    const anyFirm = await db
      .select({ id: serviceFirms.id, name: serviceFirms.name })
      .from(serviceFirms)
      .limit(1);
    if (anyFirm[0]) {
      resolvedFirmId = anyFirm[0].id;
      firmName = anyFirm[0].name;
    }
  }

  if (!resolvedFirmId) {
    return Response.json({ error: "No firm available to associate transcript with" }, { status: 400 });
  }

  const recId = uid("rec");
  const txId = uid("tx");

  await db.insert(callRecordings).values({
    id: recId,
    firmId: resolvedFirmId,
    userId: session.user.id,
    callType: (callType as "partnership" | "client" | "unknown") ?? "client",
  });

  await db.insert(callTranscripts).values({
    id: txId,
    callRecordingId: recId,
    fullText: transcript,
    processingStatus: "pending",
  });

  // Load custom extraction prompt if one exists
  let customPrompt: string | undefined;
  try {
    const setting = await db
      .select({ value: platformSettings.value })
      .from(platformSettings)
      .where(eq(platformSettings.key, "opportunity_extraction_prompt"))
      .limit(1);
    if (setting[0]?.value) {
      customPrompt = setting[0].value;
    }
  } catch {
    // Table may not exist yet — ignore
  }

  // Look up existing client research if domain provided
  let clientContext: string | undefined;
  const normalizedDomain = clientDomain?.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");

  if (normalizedDomain) {
    try {
      const [research] = await db
        .select()
        .from(companyResearch)
        .where(eq(companyResearch.domain, normalizedDomain))
        .limit(1);

      if (research) {
        const parts: string[] = [`Client: ${research.companyName} (${normalizedDomain})`];
        if (research.executiveSummary) parts.push(`About: ${research.executiveSummary}`);
        if (research.industryInsight) parts.push(`Industry: ${research.industryInsight}`);
        if (research.growthChallenges) parts.push(`Known challenges: ${research.growthChallenges}`);
        if (research.stageInsight) parts.push(`Stage: ${research.stageInsight}`);
        if (research.offeringSummary) parts.push(`They offer: ${research.offeringSummary}`);
        clientContext = parts.join("\n");
      }
    } catch {
      // companyResearch table query failed — proceed without
    }

    // Fire background research if we don't have data yet
    if (!clientContext) {
      await inngest.send({
        name: "research/company",
        data: { domain: normalizedDomain, firmId: resolvedFirmId, userId: session.user.id },
      });
    }
  }

  // Fire the Inngest pipeline
  await inngest.send({
    name: "calls/analyze",
    data: {
      callId: recId,
      firmId: resolvedFirmId ?? "admin_upload",
      userId: session.user.id,
      transcript,
      callType: callType ?? "client",
      transcriptId: txId,
      customPrompt,
      clientDomain: normalizedDomain,
      clientContext,
    },
  });

  return Response.json({
    transcriptId: txId,
    recordingId: recId,
    firmName,
    status: "processing",
    wordCount: transcript.split(/\s+/).length,
    clientResearched: !!clientContext,
    clientDomain: normalizedDomain || null,
  }, { status: 201 });
}
