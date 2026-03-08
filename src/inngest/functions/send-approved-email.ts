/**
 * Send Approved Email — Inngest Function
 *
 * Triggered by email/send-now event (auto-approved) or when an admin
 * clicks Approve in the email queue UI.
 *
 * In test mode, auto-approved emails are downgraded to pending.
 */

import { inngest } from "../client";
import { db } from "@/lib/db";
import { emailApprovalQueue, emailMessages, settings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sendEmail } from "@/lib/email/email-client";

async function getSetting(key: string): Promise<string | null> {
  try {
    const row = await db.query.settings.findFirst({ where: eq(settings.key, key) });
    return row?.value ?? null;
  } catch {
    return null;
  }
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const sendApprovedEmail = inngest.createFunction(
  {
    id: "send-approved-email",
    name: "Send Approved Email",
    retries: 2,
  },
  { event: "email/send-now" },
  async ({ event, step }) => {
    const { queueId } = event.data as { queueId: string };

    // Fetch queue entry
    const queueEntry = await step.run("fetch-queue-entry", async () => {
      return db.query.emailApprovalQueue.findFirst({
        where: eq(emailApprovalQueue.id, queueId),
      });
    });

    if (!queueEntry) {
      throw new Error(`Queue entry ${queueId} not found`);
    }

    if (queueEntry.status === "sent" || queueEntry.status === "rejected") {
      return { skipped: true, reason: `Already ${queueEntry.status}` };
    }

    // Test mode safeguard: downgrade auto-approved to pending
    const isTestMode = await step.run("check-test-mode", async () => {
      return (await getSetting("email_test_mode")) === "true";
    });

    if (isTestMode) {
      await db
        .update(emailApprovalQueue)
        .set({ status: "pending" })
        .where(eq(emailApprovalQueue.id, queueId));
      return { skipped: true, reason: "Test mode active — downgraded to pending" };
    }

    // Send the email
    const result = await step.run("send-email", async () => {
      return sendEmail({
        to: queueEntry.toEmails as string[],
        cc: (queueEntry.ccEmails as string[] | undefined) ?? undefined,
        subject: queueEntry.subject,
        html: queueEntry.bodyHtml,
        text: queueEntry.bodyText ?? undefined,
        replyTo: "ossy@joincollectiveos.com",
        tags: [
          { name: "type", value: queueEntry.emailType },
          { name: "queue_id", value: queueEntry.id },
        ],
      });
    });

    if (!result.success) {
      throw new Error(`Email send failed: ${result.error}`);
    }

    // Update queue status and store outbound message
    await step.run("mark-sent", async () => {
      await db
        .update(emailApprovalQueue)
        .set({
          status: "sent",
          sentAt: new Date(),
          externalMessageId: result.messageId,
        })
        .where(eq(emailApprovalQueue.id, queueId));

      // Store as outbound email message if we have a thread context
      const ctx = queueEntry.context as { reason?: string; threadId?: string } | null;
      if (ctx?.threadId) {
        await db.insert(emailMessages).values({
          id: generateId("emsg"),
          threadId: ctx.threadId,
          externalMessageId: result.messageId,
          direction: "outbound",
          fromEmail: "ossy@joincollectiveos.com",
          fromName: "Ossy from Collective OS",
          toEmails: queueEntry.toEmails as string[],
          ccEmails: (queueEntry.ccEmails as string[] | null) ?? null,
          subject: queueEntry.subject,
          bodyHtml: queueEntry.bodyHtml,
          bodyText: queueEntry.bodyText ?? null,
        });
      }
    });

    return {
      queueId,
      messageId: result.messageId,
      sentTo: queueEntry.toEmails,
    };
  }
);
