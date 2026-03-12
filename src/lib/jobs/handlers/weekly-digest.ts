/**
 * Handler: weekly-digest
 * Sends weekly partnership activity digest emails to all firm owners.
 * Triggered by Vercel Cron every Monday at 8 AM UTC.
 */

import { db } from "@/lib/db";
import {
  serviceFirms,
  partnerships,
  opportunities,
  leads,
  leadShares,
  referrals,
  members,
  users,
} from "@/lib/db/schema";
import { eq, and, gte, desc, or } from "drizzle-orm";
import { buildDigestHtml, buildDigestText } from "@/lib/email/templates/weekly-digest";
import { sendEmail } from "@/lib/email/email-client";

export async function handleWeeklyDigest(
  _payload: Record<string, unknown>
): Promise<unknown> {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const weekOf = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const firms = await db
    .select()
    .from(serviceFirms)
    .orderBy(desc(serviceFirms.createdAt));

  let digestsSent = 0;

  for (const firm of firms) {
    try {
      if (!firm.organizationId) continue;

      const member = await db.query.members.findFirst({
        where: and(
          eq(members.organizationId, firm.organizationId),
          eq(members.role, "owner")
        ),
      });
      if (!member) continue;

      const user = await db.query.users.findFirst({
        where: eq(users.id, member.userId),
        columns: { id: true, name: true, email: true },
      });
      if (!user?.email) continue;

      // Gather stats
      const activePartnersList = await db
        .select()
        .from(partnerships)
        .where(
          and(
            or(
              eq(partnerships.firmAId, firm.id),
              eq(partnerships.firmBId, firm.id)
            ),
            eq(partnerships.status, "accepted")
          )
        );

      const referralsGiven = await db
        .select()
        .from(referrals)
        .where(
          and(
            eq(referrals.referringFirmId, firm.id),
            gte(referrals.createdAt, oneWeekAgo)
          )
        );

      const referralsReceived = await db
        .select()
        .from(referrals)
        .where(
          and(
            eq(referrals.receivingFirmId, firm.id),
            gte(referrals.createdAt, oneWeekAgo)
          )
        );

      const recentOpps = await db
        .select()
        .from(opportunities)
        .where(
          and(
            eq(opportunities.firmId, firm.id),
            gte(opportunities.createdAt, oneWeekAgo)
          )
        );

      // Skip firms with no activity
      if (
        activePartnersList.length === 0 &&
        referralsGiven.length === 0 &&
        referralsReceived.length === 0 &&
        recentOpps.length === 0
      ) {
        continue;
      }

      const oppUpdates = await Promise.all(
        recentOpps.map(async (opp) => {
          const lead = await db.query.leads.findFirst({
            where: eq(leads.opportunityId, opp.id),
          });
          const shares = lead
            ? await db.select().from(leadShares).where(eq(leadShares.leadId, lead.id))
            : [];
          return {
            title: opp.title,
            status: opp.status ?? "new",
            sharedWith: shares.length,
            claimed: shares.filter((s) => s.claimedAt).length,
          };
        })
      );

      const totalValue = referralsReceived.reduce((acc, r) => {
        if (r.estimatedValue) {
          const match = r.estimatedValue.match(/(\d+)/);
          return acc + (match ? parseInt(match[1]) * 1000 : 0);
        }
        return acc;
      }, 0);

      const digestData = {
        recipientName: user.name ?? "there",
        firmName: firm.name,
        weekOf,
        newMatches: [],
        pendingFollowUps: [],
        opportunityUpdates: oppUpdates,
        stats: {
          activePartners: activePartnersList.length,
          referralsGiven: referralsGiven.length,
          referralsReceived: referralsReceived.length,
          estimatedRevenue:
            totalValue > 0 ? `$${(totalValue / 1000).toFixed(0)}K` : "$0",
        },
        dashboardUrl: "https://joincollectiveos.com/dashboard",
      };

      const html = buildDigestHtml(digestData);
      const text = buildDigestText(digestData);

      const result = await sendEmail({
        to: user.email,
        subject: `Your Weekly Partnership Digest — ${weekOf}`,
        html,
        text,
        tags: [
          { name: "type", value: "weekly_digest" },
          { name: "firm", value: firm.id },
        ],
      });

      if (result.success) {
        digestsSent++;
      } else {
        console.error(`[WeeklyDigest] Failed for firm ${firm.id}:`, result.error);
      }
    } catch (err) {
      console.error(`[WeeklyDigest] Error for firm ${firm.id}:`, err);
    }
  }

  return { firmsProcessed: firms.length, digestsSent };
}
