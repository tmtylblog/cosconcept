/**
 * Follow-Up Reminders — Inngest Functions
 *
 * 1. Schedule follow-up: Creates a delayed event for a specific thread
 * 2. Check stale partnerships: Cron job that finds partnerships needing nudges
 * 3. Send follow-up: Actually sends the reminder email
 */

import { inngest } from "../client";
import { db } from "@/lib/db";
import {
  partnerships,
  partnershipEvents,
  emailThreads,
  emailApprovalQueue,
  serviceFirms,
  members,
  users,
} from "@/lib/db/schema";
import { eq, and, lt, or } from "drizzle-orm";
import { buildFollowUpHtml, buildFollowUpText } from "@/lib/email/templates/follow-up-reminder";
import { sendEmail } from "@/lib/email/email-client";

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Schedule a follow-up reminder for a specific email thread.
 * Delays for 3 days then checks if the thread has had activity.
 */
export const scheduleFollowUp = inngest.createFunction(
  { id: "schedule-follow-up", name: "Schedule Follow-Up Reminder" },
  { event: "email/schedule-follow-up" },
  async ({ event, step }) => {
    const { threadId, firmId, reason, action } = event.data;

    // Wait 3 days
    await step.sleep("wait-for-response", "3d");

    // Check if the thread has had activity since we scheduled this
    const thread = await step.run("check-thread-activity", async () => {
      return db.query.emailThreads.findFirst({
        where: eq(emailThreads.id, threadId),
      });
    });

    if (!thread || thread.status === "resolved" || thread.status === "archived") {
      return { skipped: true, reason: "Thread resolved or archived" };
    }

    // Thread is still active with no resolution — send reminder
    const firmOwner = await step.run("get-firm-owner", async () => {
      if (!firmId || firmId === "unknown") return null;

      const member = await db.query.members.findFirst({
        where: and(
          eq(members.organizationId, firmId),
          eq(members.role, "owner")
        ),
      });
      if (!member) return null;

      const user = await db.query.users.findFirst({
        where: eq(users.id, member.userId),
        columns: { id: true, name: true, email: true },
      });
      return user;
    });

    if (!firmOwner?.email) {
      return { skipped: true, reason: "No firm owner email found" };
    }

    // Queue the follow-up email for approval
    await step.run("queue-follow-up-email", async () => {
      const html = buildFollowUpHtml({
        recipientName: firmOwner.name ?? "there",
        originalSubject: thread!.subject,
        daysSinceOriginal: 3,
        contextSnippet: reason ?? action ?? "A conversation needs your attention.",
        actionUrl: `https://joincollectiveos.com/partnerships`,
      });

      const text = buildFollowUpText({
        recipientName: firmOwner.name ?? "there",
        originalSubject: thread!.subject,
        daysSinceOriginal: 3,
        contextSnippet: reason ?? action ?? "A conversation needs your attention.",
        actionUrl: `https://joincollectiveos.com/partnerships`,
      });

      // Auto-send follow-up reminders (tier 1: auto-send)
      await sendEmail({
        to: firmOwner.email,
        subject: `Quick follow-up: ${thread!.subject}`,
        html,
        text,
        tags: [
          { name: "type", value: "follow_up" },
          { name: "thread", value: threadId },
        ],
      });
    });

    return { sent: true, to: firmOwner.email, thread: thread!.subject };
  }
);

/**
 * Check for stale partnerships — runs daily.
 * Finds partnerships that have been in "requested" state for >3 days
 * or "accepted" partnerships with no activity for >14 days.
 */
export const checkStalePartnerships = inngest.createFunction(
  { id: "check-stale-partnerships", name: "Check Stale Partnerships" },
  { cron: "0 9 * * *" }, // Daily at 9 AM
  async ({ step }) => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    // Find stale requested partnerships (no response in 3 days)
    const staleRequests = await step.run("find-stale-requests", async () => {
      return db
        .select()
        .from(partnerships)
        .where(
          and(
            eq(partnerships.status, "requested"),
            lt(partnerships.createdAt, threeDaysAgo)
          )
        );
    });

    // Find idle accepted partnerships (no events in 14 days)
    const idlePartnerships = await step.run("find-idle-partnerships", async () => {
      return db
        .select()
        .from(partnerships)
        .where(
          and(
            eq(partnerships.status, "accepted"),
            lt(partnerships.updatedAt, twoWeeksAgo)
          )
        );
    });

    // Send nudges for stale requests
    let nudgesSent = 0;
    for (const partnership of staleRequests) {
      await step.run(`nudge-stale-${partnership.id}`, async () => {
        // Get the receiving firm (firmB) owner
        const firmB = await db.query.serviceFirms.findFirst({
          where: eq(serviceFirms.id, partnership.firmBId),
          columns: { id: true, name: true, organizationId: true },
        });

        if (!firmB?.organizationId) return;

        const member = await db.query.members.findFirst({
          where: and(
            eq(members.organizationId, firmB.organizationId),
            eq(members.role, "owner")
          ),
        });
        if (!member) return;

        const user = await db.query.users.findFirst({
          where: eq(users.id, member.userId),
          columns: { name: true, email: true },
        });
        if (!user?.email) return;

        // Get firm A name for context
        const firmA = await db.query.serviceFirms.findFirst({
          where: eq(serviceFirms.id, partnership.firmAId),
          columns: { name: true },
        });

        const html = buildFollowUpHtml({
          recipientName: user.name ?? "there",
          originalSubject: `Partnership request from ${firmA?.name ?? "a firm"}`,
          daysSinceOriginal: Math.ceil(
            (Date.now() - new Date(partnership.createdAt).getTime()) / (24 * 60 * 60 * 1000)
          ),
          partnerFirmName: firmA?.name,
          contextSnippet: `${firmA?.name ?? "A firm"} requested a partnership with you. They're still waiting for your response.`,
          actionUrl: `https://joincollectiveos.com/partnerships`,
        });

        const text = buildFollowUpText({
          recipientName: user.name ?? "there",
          originalSubject: `Partnership request from ${firmA?.name ?? "a firm"}`,
          daysSinceOriginal: Math.ceil(
            (Date.now() - new Date(partnership.createdAt).getTime()) / (24 * 60 * 60 * 1000)
          ),
          partnerFirmName: firmA?.name,
          contextSnippet: `${firmA?.name ?? "A firm"} requested a partnership with you. They're still waiting for your response.`,
          actionUrl: `https://joincollectiveos.com/partnerships`,
        });

        await sendEmail({
          to: user.email,
          subject: `Pending partnership request from ${firmA?.name ?? "a partner"}`,
          html,
          text,
          tags: [
            { name: "type", value: "stale_partnership_nudge" },
            { name: "partnership", value: partnership.id },
          ],
        });

        nudgesSent++;
      });
    }

    return {
      staleRequests: staleRequests.length,
      idlePartnerships: idlePartnerships.length,
      nudgesSent,
    };
  }
);
