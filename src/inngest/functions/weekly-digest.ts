/**
 * Weekly Digest — Inngest Cron Function
 *
 * Runs every Monday at 8 AM. For each active firm, generates
 * and sends a weekly partnership activity digest.
 */

import { inngest } from "../client";
import { db } from "@/lib/db";
import {
  serviceFirms,
  partnerships,
  opportunities,
  opportunityShares,
  referrals,
  members,
  users,
} from "@/lib/db/schema";
import { eq, and, gte, desc, or } from "drizzle-orm";
import { buildDigestHtml, buildDigestText } from "@/lib/email/templates/weekly-digest";
import { sendEmail } from "@/lib/email/email-client";

export const weeklyDigest = inngest.createFunction(
  { id: "weekly-digest", name: "Weekly Partnership Digest" },
  { cron: "0 8 * * 1" }, // Every Monday at 8 AM
  async ({ step }) => {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const weekOf = new Date().toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    // Get all active firms
    const firms = await step.run("get-active-firms", async () => {
      return db.select().from(serviceFirms).orderBy(desc(serviceFirms.createdAt));
    });

    let digestsSent = 0;

    for (const firm of firms) {
      await step.run(`digest-${firm.id}`, async () => {
        // Get firm owner's email
        if (!firm.organizationId) return;

        const member = await db.query.members.findFirst({
          where: and(
            eq(members.organizationId, firm.organizationId),
            eq(members.role, "owner")
          ),
        });
        if (!member) return;

        const user = await db.query.users.findFirst({
          where: eq(users.id, member.userId),
          columns: { id: true, name: true, email: true },
        });
        if (!user?.email) return;

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

        // Get recent opportunities
        const recentOpps = await db
          .select()
          .from(opportunities)
          .where(
            and(
              eq(opportunities.firmId, firm.id),
              gte(opportunities.createdAt, oneWeekAgo)
            )
          );

        const oppUpdates = await Promise.all(
          recentOpps.map(async (opp) => {
            const shares = await db
              .select()
              .from(opportunityShares)
              .where(eq(opportunityShares.opportunityId, opp.id));

            return {
              title: opp.title,
              status: opp.status ?? "open",
              sharedWith: shares.length,
              claimed: shares.filter((s) => s.claimedAt).length,
            };
          })
        );

        // Skip firms with no activity
        if (
          activePartnersList.length === 0 &&
          referralsGiven.length === 0 &&
          referralsReceived.length === 0 &&
          recentOpps.length === 0
        ) {
          return;
        }

        // Estimate revenue from referrals
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
          newMatches: [], // Would come from proactive matching — left empty for now
          pendingFollowUps: [], // Would come from stale partnership check — left empty for now
          opportunityUpdates: oppUpdates,
          stats: {
            activePartners: activePartnersList.length,
            referralsGiven: referralsGiven.length,
            referralsReceived: referralsReceived.length,
            estimatedRevenue: totalValue > 0 ? `$${(totalValue / 1000).toFixed(0)}K` : "$0",
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

        if (!result.success) {
          console.error(`[WeeklyDigest] Failed to send digest for firm ${firm.id}:`, result.error);
          return;
        }

        digestsSent++;
      });
    }

    return { firmsProcessed: firms.length, digestsSent };
  }
);
