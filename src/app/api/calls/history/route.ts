import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scheduledCalls, coachingReports, callRecordings } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getActiveOrganization } from "@/lib/auth-helpers";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const firmId = searchParams.get("firmId");
  if (!firmId) return NextResponse.json({ error: "firmId required" }, { status: 400 });

  // Get scheduled calls (which have linked transcripts and coaching reports)
  const calls = await db.query.scheduledCalls.findMany({
    where: eq(scheduledCalls.firmId, firmId),
    orderBy: [desc(scheduledCalls.createdAt)],
    limit: 50,
  });

  // Fetch coaching reports for completed calls
  const callIds = calls.map((c) => c.id);
  const reports: Record<string, { overallScore: number | null; topRecommendation: string | null }> = {};

  for (const callId of callIds) {
    const report = await db.query.coachingReports.findFirst({
      where: eq(coachingReports.scheduledCallId, callId),
      columns: { overallScore: true, topRecommendation: true },
    });
    if (report) reports[callId] = report;
  }

  const enriched = calls.map((c) => ({
    ...c,
    coaching: reports[c.id] ?? null,
  }));

  return NextResponse.json({ calls: enriched });
}
