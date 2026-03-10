import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import {
  callTranscripts,
  callRecordings,
  serviceFirms,
  opportunities,
  coachingReports,
} from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user.role !== "superadmin") {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "150"), 300);
  const offset = parseInt(searchParams.get("offset") ?? "0");
  const firmIdFilter = searchParams.get("firmId") ?? null;
  const sourceFilter = searchParams.get("source") ?? null; // "manual" | "recall"

  const rows = await db
    .select({
      id: callTranscripts.id,
      fullText: callTranscripts.fullText,
      processingStatus: callTranscripts.processingStatus,
      deepgramJobId: callTranscripts.deepgramJobId,
      coachingReportId: callTranscripts.coachingReportId,
      createdAt: callTranscripts.createdAt,
      firmId: callRecordings.firmId,
      firmName: serviceFirms.name,
      callType: callRecordings.callType,
      coachingScore: coachingReports.overallScore,
      opportunityCount:
        sql<number>`(SELECT COUNT(*) FROM opportunities WHERE source = 'call' AND source_id = ${callTranscripts.id})`.as(
          "opportunity_count"
        ),
    })
    .from(callTranscripts)
    .leftJoin(callRecordings, eq(callTranscripts.callRecordingId, callRecordings.id))
    .leftJoin(serviceFirms, eq(callRecordings.firmId, serviceFirms.id))
    .leftJoin(coachingReports, eq(callTranscripts.coachingReportId, coachingReports.id))
    .orderBy(desc(callTranscripts.createdAt))
    .limit(limit)
    .offset(offset);

  // Apply filters after fetch (simpler than conditional WHERE in Drizzle for nullable joins)
  let filtered = rows;
  if (firmIdFilter) {
    filtered = filtered.filter((r) => r.firmId === firmIdFilter);
  }
  if (sourceFilter === "manual") {
    filtered = filtered.filter((r) => !r.deepgramJobId);
  } else if (sourceFilter === "recall") {
    filtered = filtered.filter((r) => !!r.deepgramJobId);
  }

  const result = filtered.map((r) => ({
    id: r.id,
    firmId: r.firmId ?? null,
    firmName: r.firmName ?? "Unknown",
    source: r.deepgramJobId ? "recall" : "manual",
    callType: r.callType ?? "unknown",
    processingStatus: r.processingStatus,
    wordCount: r.fullText ? r.fullText.trim().split(/\s+/).length : 0,
    preview: r.fullText ? r.fullText.slice(0, 400) : null,
    coachingScore: r.coachingScore ?? null,
    opportunityCount: Number(r.opportunityCount),
    createdAt: r.createdAt,
  }));

  const total = result.length;
  const processed = result.filter((r) => r.processingStatus === "done").length;
  const totalOpps = result.reduce((sum, r) => sum + r.opportunityCount, 0);
  const scoresWithData = result.filter((r) => r.coachingScore != null);
  const avgCoaching =
    scoresWithData.length > 0
      ? Math.round(
          scoresWithData.reduce((sum, r) => sum + (r.coachingScore ?? 0), 0) /
            scoresWithData.length
        )
      : 0;

  return Response.json({ stats: { total, processed, totalOpps, avgCoaching }, transcripts: result });
}
