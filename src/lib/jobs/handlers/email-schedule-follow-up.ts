/**
 * Handler: email-schedule-follow-up
 *
 * NOTE: This handler is scheduled with a 3-day delay via enqueue()'s delayMs option.
 * When it runs, the thread has already had 3 days to respond — check activity then send.
 */

import { db } from "@/lib/db";
import { emailThreads, members, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  buildFollowUpHtml,
  buildFollowUpText,
} from "@/lib/email/templates/follow-up-reminder";
import { sendEmail } from "@/lib/email/email-client";

interface Payload {
  threadId: string;
  firmId: string;
  reason?: string;
  action?: string;
  suggestedDate?: string;
}

export async function handleEmailScheduleFollowUp(
  payload: Record<string, unknown>
): Promise<unknown> {
  const { threadId, firmId, reason, action } = payload as unknown as Payload;

  // Check if thread still needs attention
  const thread = await db.query.emailThreads.findFirst({
    where: eq(emailThreads.id, threadId),
  });

  if (!thread) return { skipped: true, reason: "Thread not found" };

  if (thread.status === "resolved" || thread.status === "archived") {
    return { skipped: true, reason: "Thread resolved or archived" };
  }

  // Get firm owner
  if (!firmId || firmId === "unknown") {
    return { skipped: true, reason: "Unknown firmId" };
  }

  const member = await db.query.members.findFirst({
    where: and(eq(members.organizationId, firmId), eq(members.role, "owner")),
  });
  if (!member) return { skipped: true, reason: "No firm owner found" };

  const user = await db.query.users.findFirst({
    where: eq(users.id, member.userId),
    columns: { id: true, name: true, email: true },
  });
  if (!user?.email) return { skipped: true, reason: "No firm owner email" };

  // Send follow-up
  const html = buildFollowUpHtml({
    recipientName: user.name ?? "there",
    originalSubject: thread.subject,
    daysSinceOriginal: 3,
    contextSnippet: reason ?? action ?? "A conversation needs your attention.",
    actionUrl: "https://joincollectiveos.com/partnerships",
  });

  const text = buildFollowUpText({
    recipientName: user.name ?? "there",
    originalSubject: thread.subject,
    daysSinceOriginal: 3,
    contextSnippet: reason ?? action ?? "A conversation needs your attention.",
    actionUrl: "https://joincollectiveos.com/partnerships",
  });

  const result = await sendEmail({
    to: user.email,
    subject: `Quick follow-up: ${thread.subject}`,
    html,
    text,
    tags: [
      { name: "type", value: "follow_up" },
      { name: "thread", value: threadId },
    ],
  });

  if (!result.success) {
    throw new Error(`Failed to send follow-up for thread ${threadId}: ${result.error}`);
  }

  return { sent: true, to: user.email, thread: thread.subject };
}
