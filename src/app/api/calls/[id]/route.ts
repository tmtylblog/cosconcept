import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scheduledCalls, callTranscripts, coachingReports } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const call = await db.query.scheduledCalls.findFirst({
    where: eq(scheduledCalls.id, id),
  });
  if (!call) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const transcript = call.transcriptId
    ? await db.query.callTranscripts.findFirst({
        where: eq(callTranscripts.id, call.transcriptId),
      })
    : null;

  const report = await db.query.coachingReports.findFirst({
    where: eq(coachingReports.scheduledCallId, id),
  });

  return NextResponse.json({ call, transcript, report });
}
