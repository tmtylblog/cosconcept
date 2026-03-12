/**
 * Call Data API
 *
 * POST /api/calls — Submit call recording/transcript for analysis
 * GET  /api/calls — List calls for user's firm
 */

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { enqueue } from "@/lib/jobs/queue";
import { runNextJob } from "@/lib/jobs/runner";

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * POST — Submit a call transcript for analysis.
 *
 * Body: {
 *   firmId: string,
 *   transcript: string,
 *   platform?: "google_meet" | "zoom" | "teams" | "phone" | "other",
 *   duration?: number (seconds),
 *   participants?: string[],
 *   callType?: "sales" | "partner" | "client" | "internal" | "other"
 * }
 */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    firmId,
    transcript,
    platform = "other",
    duration,
    participants,
    callType = "other",
  } = body;

  if (!firmId || !transcript) {
    return NextResponse.json(
      { error: "firmId and transcript are required" },
      { status: 400 }
    );
  }

  const callId = generateId("call");

  // Queue the analysis pipeline
  await enqueue("calls-analyze", {
    callId,
    firmId,
    userId: session.user.id,
    transcript,
    platform,
    duration: duration ?? null,
    participants: participants ?? [],
    callType,
  });
  after(runNextJob().catch(() => {}));

  return NextResponse.json(
    { callId, status: "queued_for_analysis" },
    { status: 201 }
  );
}
