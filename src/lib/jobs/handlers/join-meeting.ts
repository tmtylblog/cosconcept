/**
 * Handler: calls-join-meeting
 * Sends a Recall.ai bot into a scheduled meeting.
 */

import { db } from "@/lib/db";
import { scheduledCalls } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createBot } from "@/lib/recall";

interface Payload {
  scheduledCallId: string;
}

export async function handleJoinMeeting(
  payload: Record<string, unknown>
): Promise<unknown> {
  const { scheduledCallId } = payload as unknown as Payload;

  const call = await db.query.scheduledCalls.findFirst({
    where: eq(scheduledCalls.id, scheduledCallId),
  });

  if (!call) throw new Error(`Scheduled call ${scheduledCallId} not found`);

  if (call.status === "cancelled" || call.status === "done") {
    return { skipped: true, reason: `Call already ${call.status}` };
  }

  if (!call.meetingLink) {
    throw new Error(`No meeting link for scheduled call ${scheduledCallId}`);
  }

  const bot = await createBot(call.meetingLink, call.meetingTitle ?? "Partnership Call");

  await db
    .update(scheduledCalls)
    .set({
      recallBotId: bot.id,
      status: "recording",
      updatedAt: new Date(),
    })
    .where(eq(scheduledCalls.id, scheduledCallId));

  return {
    scheduledCallId,
    botId: bot.id,
    botStatus: bot.status,
    meetingLink: call.meetingLink,
  };
}
