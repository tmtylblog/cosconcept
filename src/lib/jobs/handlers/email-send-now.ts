/**
 * Handler: email-send-now
 * Sends an approved email from the approval queue.
 */

import { db } from "@/lib/db";
import { emailApprovalQueue, emailMessages, settings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sendEmail } from "@/lib/email/email-client";

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function getSetting(key: string): Promise<string | null> {
  try {
    const row = await db.query.settings.findFirst({
      where: eq(settings.key, key),
    });
    return row?.value ?? null;
  } catch {
    return null;
  }
}

interface Payload {
  queueId: string;
}

export async function handleEmailSendNow(
  payload: Record<string, unknown>
): Promise<unknown> {
  const { queueId } = payload as unknown as Payload;

  const queueEntry = await db.query.emailApprovalQueue.findFirst({
    where: eq(emailApprovalQueue.id, queueId),
  });

  if (!queueEntry) throw new Error(`Queue entry ${queueId} not found`);

  if (queueEntry.status === "sent" || queueEntry.status === "rejected") {
    return { skipped: true, reason: `Already ${queueEntry.status}` };
  }

  // Test mode safeguard: downgrade auto-approved to pending
  const isTestMode = (await getSetting("email_test_mode")) === "true";
  if (isTestMode) {
    await db
      .update(emailApprovalQueue)
      .set({ status: "pending" })
      .where(eq(emailApprovalQueue.id, queueId));
    return { skipped: true, reason: "Test mode active — downgraded to pending" };
  }

  // Send the email
  const result = await sendEmail({
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

  if (!result.success) {
    throw new Error(`Email send failed: ${result.error}`);
  }

  // Mark sent + store outbound message if there's a thread
  await db
    .update(emailApprovalQueue)
    .set({
      status: "sent",
      sentAt: new Date(),
      externalMessageId: result.messageId,
    })
    .where(eq(emailApprovalQueue.id, queueId));

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

  return {
    queueId,
    messageId: result.messageId,
    sentTo: queueEntry.toEmails,
  };
}
