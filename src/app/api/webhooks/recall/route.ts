/**
 * POST /api/webhooks/recall
 *
 * Receives Recall.ai bot status webhooks.
 * When a bot finishes recording (status = "done" | "call_ended"),
 * fetches the full transcript and fires the Inngest analysis pipeline.
 *
 * Setup in Recall.ai dashboard:
 *   https://us-west-2.recall.ai/dashboard/webhooks/
 *   URL: https://cos-concept.vercel.app/api/webhooks/recall
 *   Events: bot.status_change
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { callRecordings, callTranscripts, serviceFirms } from "@/lib/db/schema";
import { getBotTranscript } from "@/lib/recall";
import { inngest } from "@/inngest/client";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// Only bot.done means transcript is fully processed — call_ended fires too early
const DONE_EVENTS = new Set(["bot.done"]);

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = body.event as string;
  const data = body.data as Record<string, unknown> | undefined;

  // Log every event so we can see the payload structure
  console.log("[Recall webhook] Event:", event, JSON.stringify(data, null, 2));

  // Skip events we don't care about
  if (!DONE_EVENTS.has(event)) {
    return NextResponse.json({ ok: true, skipped: event });
  }

  // bot_id can be at data.bot_id or data.bot.id depending on Recall.ai version
  const botId =
    (data?.bot_id as string | undefined) ??
    ((data?.bot as Record<string, unknown> | undefined)?.id as string | undefined);

  if (!botId) {
    console.error("[Recall webhook] Missing bot_id in payload", data);
    return NextResponse.json({ error: "Missing bot_id" }, { status: 400 });
  }

  console.log(`[Recall webhook] Bot ${botId} done — fetching transcript`);

  // Fetch transcript from Recall.ai
  const transcript = await getBotTranscript(botId);

  if (!transcript || transcript.trim().length < 50) {
    console.warn(`[Recall webhook] Bot ${botId} — transcript too short or empty`);
    return NextResponse.json({ ok: true, skipped: "transcript_too_short" });
  }

  // Extract metadata passed at bot creation time
  const metadata = data?.metadata as Record<string, string> | undefined;
  const bookingUid = metadata?.booking_uid ?? "unknown";
  const eventTitle = metadata?.event_title ?? "Partnership Intro Call";

  // Resolve a firmId — use first firm as fallback for Cal-originated calls
  let firmId: string;
  try {
    const [firm] = await db.select({ id: serviceFirms.id }).from(serviceFirms).limit(1);
    firmId = firm?.id ?? "system";
  } catch {
    firmId = "system";
  }

  // Store recording + transcript
  const recId = uid("rec");
  const txId = uid("tx");

  try {
    await db.insert(callRecordings).values({
      id: recId,
      firmId,
      userId: null,
      callType: "partnership",
    });

    await db.insert(callTranscripts).values({
      id: txId,
      callRecordingId: recId,
      fullText: transcript,
      processingStatus: "pending",
    });
  } catch (err) {
    console.error("[Recall webhook] DB insert failed:", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }

  // Fire Inngest pipeline for AI analysis
  await inngest.send({
    name: "calls/analyze",
    data: {
      callId: recId,
      firmId,
      userId: "system",
      transcript,
      callType: "partnership",
      transcriptId: txId,
      clientContext: `Booking: ${bookingUid} — ${eventTitle}`,
    },
  });

  console.log(`[Recall webhook] Pipeline fired — recId: ${recId}, txId: ${txId}, botId: ${botId}`);
  return NextResponse.json({ ok: true, recordingId: recId, transcriptId: txId });
}
