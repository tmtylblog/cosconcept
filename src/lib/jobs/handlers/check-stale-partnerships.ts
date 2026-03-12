/**
 * Handler: check-stale-partnerships
 * Finds and nudges stale partnership requests / idle partnerships.
 * Triggered by Vercel Cron daily at 9 AM UTC.
 */

import { db } from "@/lib/db";
import { partnerships, serviceFirms, members, users } from "@/lib/db/schema";
import { eq, and, lt } from "drizzle-orm";
import {
  buildFollowUpHtml,
  buildFollowUpText,
} from "@/lib/email/templates/follow-up-reminder";
import { sendEmail } from "@/lib/email/email-client";

export async function handleCheckStalePartnerships(
  _payload: Record<string, unknown>
): Promise<unknown> {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const staleRequests = await db
    .select()
    .from(partnerships)
    .where(
      and(
        eq(partnerships.status, "requested"),
        lt(partnerships.createdAt, threeDaysAgo)
      )
    );

  const idlePartnerships = await db
    .select()
    .from(partnerships)
    .where(
      and(
        eq(partnerships.status, "accepted"),
        lt(partnerships.updatedAt, twoWeeksAgo)
      )
    );

  let nudgesSent = 0;

  for (const partnership of staleRequests) {
    try {
      const firmB = await db.query.serviceFirms.findFirst({
        where: eq(serviceFirms.id, partnership.firmBId),
        columns: { id: true, name: true, organizationId: true },
      });
      if (!firmB?.organizationId) continue;

      const member = await db.query.members.findFirst({
        where: and(
          eq(members.organizationId, firmB.organizationId),
          eq(members.role, "owner")
        ),
      });
      if (!member) continue;

      const user = await db.query.users.findFirst({
        where: eq(users.id, member.userId),
        columns: { name: true, email: true },
      });
      if (!user?.email) continue;

      const firmA = await db.query.serviceFirms.findFirst({
        where: eq(serviceFirms.id, partnership.firmAId),
        columns: { name: true },
      });

      const daysSince = Math.ceil(
        (Date.now() - new Date(partnership.createdAt).getTime()) /
          (24 * 60 * 60 * 1000)
      );

      const html = buildFollowUpHtml({
        recipientName: user.name ?? "there",
        originalSubject: `Partnership request from ${firmA?.name ?? "a firm"}`,
        daysSinceOriginal: daysSince,
        partnerFirmName: firmA?.name,
        contextSnippet: `${firmA?.name ?? "A firm"} requested a partnership with you. They're still waiting for your response.`,
        actionUrl: "https://joincollectiveos.com/partnerships",
      });

      const text = buildFollowUpText({
        recipientName: user.name ?? "there",
        originalSubject: `Partnership request from ${firmA?.name ?? "a firm"}`,
        daysSinceOriginal: daysSince,
        partnerFirmName: firmA?.name,
        contextSnippet: `${firmA?.name ?? "A firm"} requested a partnership with you. They're still waiting for your response.`,
        actionUrl: "https://joincollectiveos.com/partnerships",
      });

      const result = await sendEmail({
        to: user.email,
        subject: `Pending partnership request from ${firmA?.name ?? "a partner"}`,
        html,
        text,
        tags: [
          { name: "type", value: "stale_partnership_nudge" },
          { name: "partnership", value: partnership.id },
        ],
      });

      if (result.success) nudgesSent++;
    } catch (err) {
      console.error(
        `[StalePartnerships] Error for partnership ${partnership.id}:`,
        err
      );
    }
  }

  return {
    staleRequests: staleRequests.length,
    idlePartnerships: idlePartnerships.length,
    nudgesSent,
  };
}
