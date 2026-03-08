/**
 * Join Meeting — Inngest Function
 *
 * Triggered ~2 minutes before a scheduled call's meeting time.
 * Sends a Recall.ai bot named "Ossy" into the meeting to record + transcribe.
 *
 * Scheduled automatically when a calendar invite is parsed in the inbound email webhook.
 */

import { inngest } from "../client";
import { db } from "@/lib/db";
import { scheduledCalls } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createBot } from "@/lib/recall";

export const joinMeeting = inngest.createFunction(
  {
    id: "calls-join-meeting",
    name: "Join Meeting (Recall.ai Bot)",
    retries: 2,
  },
  { event: "calls/join-meeting" },
  async ({ event, step }) => {
    const { scheduledCallId } = event.data as { scheduledCallId: string };

    // Fetch the scheduled call
    const call = await step.run("fetch-scheduled-call", async () => {
      return db.query.scheduledCalls.findFirst({
        where: eq(scheduledCalls.id, scheduledCallId),
      });
    });

    if (!call) throw new Error(`Scheduled call ${scheduledCallId} not found`);

    if (call.status === "cancelled" || call.status === "done") {
      return { skipped: true, reason: `Call already ${call.status}` };
    }

    if (!call.meetingLink) {
      throw new Error(`No meeting link for scheduled call ${scheduledCallId}`);
    }

    // Send Recall.ai bot into the meeting
    const bot = await step.run("create-recall-bot", async () => {
      return createBot(call.meetingLink!, call.meetingTitle ?? "Partnership Call");
    });

    // Store bot ID and update status
    await step.run("update-scheduled-call", async () => {
      await db
        .update(scheduledCalls)
        .set({
          recallBotId: bot.id,
          status: "recording",
          updatedAt: new Date(),
        })
        .where(eq(scheduledCalls.id, scheduledCallId));
    });

    return {
      scheduledCallId,
      botId: bot.id,
      botStatus: bot.status,
      meetingLink: call.meetingLink,
    };
  }
);
