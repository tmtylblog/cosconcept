/**
 * Recall.ai Transcript Webhook
 *
 * Recall.ai POSTs here when a meeting ends and transcript is ready.
 * Flow:
 *   1. Validate Authorization header
 *   2. Parse bot_id and transcript data
 *   3. Look up scheduled call by recallBotId
 *   4. Assemble full transcript + diarized segments
 *   5. Store call_recording + call_transcript rows
 *   6. Fire Inngest calls/analyze event
 *   7. Return 200 immediately
 *
 * Configure webhook URL in Recall.ai dashboard pointing to this endpoint.
 */

import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { db } from "@/lib/db";
import {
  scheduledCalls,
  callRecordings,
  callTranscripts,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { after } from "next/server";
import { enqueue } from "@/lib/jobs/queue";
import { runNextJob } from "@/lib/jobs/runner";

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// Recall.ai transcript word type
interface RecallWord {
  text: string;
  start_time: number; // seconds
  end_time: number;
}

// Recall.ai transcript segment
interface RecallSegment {
  speaker: string;
  words: RecallWord[];
}

function assembleTranscript(segments: RecallSegment[]): {
  fullText: string;
  diarized: { speaker: string; startMs: number; endMs: number; text: string }[];
} {
  const diarized = segments.map((seg) => {
    const text = seg.words.map((w) => w.text).join(" ");
    const startMs = Math.round((seg.words[0]?.start_time ?? 0) * 1000);
    const endMs = Math.round((seg.words[seg.words.length - 1]?.end_time ?? 0) * 1000);
    return { speaker: seg.speaker, startMs, endMs, text };
  });

  const fullText = diarized
    .map((s) => `${s.speaker}: ${s.text}`)
    .join("\n");

  return { fullText, diarized };
}

export async function POST(req: NextRequest) {
  // Validate Recall.ai webhook signature (Svix HMAC signing)
  const webhookSecret = process.env.RECALL_WEBHOOK_SECRET ?? "";
  const body = await req.text();

  if (webhookSecret) {
    const svixId = req.headers.get("svix-id") ?? "";
    const svixTimestamp = req.headers.get("svix-timestamp") ?? "";
    const svixSignature = req.headers.get("svix-signature") ?? "";

    if (!svixId || !svixTimestamp || !svixSignature) {
      console.warn("[RecallWebhook] Missing Svix signature headers");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      const wh = new Webhook(webhookSecret);
      wh.verify(body, {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      });
    } catch {
      console.warn("[RecallWebhook] Svix signature verification failed");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Recall.ai webhook payload: { bot_id, transcript: RecallSegment[], status, ... }
  const botId = (payload.bot_id ?? payload.id) as string | undefined;
  const rawSegments = (payload.transcript ?? (payload.data as Record<string, unknown> | undefined)?.transcript ?? []) as RecallSegment[];
  const durationSeconds = (payload.duration_seconds ?? payload.duration) as number | undefined;

  if (!botId) {
    console.error("[RecallWebhook] Missing bot_id in payload");
    return NextResponse.json({ error: "Missing bot_id" }, { status: 400 });
  }

  // Look up scheduled call by Recall bot ID
  const scheduledCall = await db.query.scheduledCalls.findFirst({
    where: eq(scheduledCalls.recallBotId, botId),
  });

  if (!scheduledCall) {
    console.warn(`[RecallWebhook] No scheduled call found for bot ${botId}`);
    // Return 200 so Recall doesn't retry — we just don't have a matching call
    return NextResponse.json({ ok: true, warning: "No matching scheduled call" });
  }

  const { fullText, diarized } = assembleTranscript(rawSegments);

  // Create call_recording row
  const recordingId = generateId("cr");
  await db.insert(callRecordings).values({
    id: recordingId,
    firmId: scheduledCall.firmId,
    userId: scheduledCall.userId ?? undefined,
    scheduledCallId: scheduledCall.id,
    callType: scheduledCall.callType ?? "unknown",
    partnerFirmId: null, // Will be resolved from partnership if linked
    platform: scheduledCall.platform ?? "other",
    durationSeconds: durationSeconds ? Math.round(durationSeconds) : null,
    processedAt: new Date(),
  });

  // Create call_transcript row
  const transcriptId = generateId("ct");
  await db.insert(callTranscripts).values({
    id: transcriptId,
    callRecordingId: recordingId,
    scheduledCallId: scheduledCall.id,
    fullText,
    segments: diarized,
    processingStatus: "done",
  });

  // Update scheduled call status
  await db
    .update(scheduledCalls)
    .set({
      status: "done",
      transcriptId,
      updatedAt: new Date(),
    })
    .where(eq(scheduledCalls.id, scheduledCall.id));

  // Queue post-call analysis
  await enqueue("calls-analyze", {
    callId: recordingId,
    firmId: scheduledCall.firmId,
    userId: scheduledCall.userId ?? undefined,
    transcript: fullText,
    callType: scheduledCall.callType ?? "unknown",
    partnershipId: scheduledCall.partnershipId ?? undefined,
    scheduledCallId: scheduledCall.id,
    transcriptId,
  });
  after(runNextJob().catch(() => {}));

  return NextResponse.json({ ok: true });
}
