import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import {
  growthOpsInviteQueue,
  growthOpsInviteTargets,
  growthOpsInviteCampaigns,
  growthOpsLinkedInAccounts,
  growthOpsDailyUsage,
} from "@/lib/db/schema";
import { UnipileClient } from "@/lib/growth-ops/UnipileClient";
import { eq, lte, and, gte, inArray, sql, desc } from "drizzle-orm";

// ── Safety constants ──────────────────────────────────────────────────────────
const MAX_DAILY_INVITES = 25;
const MAX_WEEKLY_INVITES = 80;
const MIN_ACCEPTANCE_RATE = 0.3;  // 30% floor (checked when totalSent >= 10)
const MAX_CONSECUTIVE_SEND_DAYS = 5;
const MIN_CAMPAIGN_GAP_HOURS = 48;
const RANDOM_REST_DAY_PROBABILITY = 0.1;

const DAY_ABBRS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Extract LinkedIn username from a profile URL (/in/USERNAME) */
function extractProviderIdFromUrl(url: string): string | null {
  const match = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
  return match?.[1] ?? null;
}

export async function handleLinkedInInviteScheduler(
  _payload: Record<string, unknown>
): Promise<unknown> {
  const now = new Date();
  const todayStr = todayUTC();
  const currentHourUTC = now.getUTCHours();
  const todayDayAbbr = DAY_ABBRS[now.getUTCDay()];

  // Fetch all active campaigns with their account status in one query
  const activeCampaigns = await db
    .select({
      campaign: growthOpsInviteCampaigns,
      accountStatus: growthOpsLinkedInAccounts.status,
    })
    .from(growthOpsInviteCampaigns)
    .innerJoin(
      growthOpsLinkedInAccounts,
      eq(growthOpsLinkedInAccounts.id, growthOpsInviteCampaigns.linkedinAccountId)
    )
    .where(eq(growthOpsInviteCampaigns.status, "active"));

  const results: Array<{
    campaignId: string;
    sent: number;
    skipped: boolean;
    reason?: string;
  }> = [];

  for (const { campaign, accountStatus } of activeCampaigns) {
    // ── Tier 1: Account status ────────────────────────────────────────────────
    // Primary guard — prevents sending from broken/disconnected accounts
    if ((accountStatus ?? "").toUpperCase() !== "OK") {
      results.push({ campaignId: campaign.id, sent: 0, skipped: true, reason: "account_not_ok" });
      continue;
    }

    // ── Tier 2: Weekly limits + acceptance rate ───────────────────────────────
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weeklySentRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(growthOpsInviteQueue)
      .where(
        and(
          eq(growthOpsInviteQueue.linkedinAccountId, campaign.linkedinAccountId),
          gte(growthOpsInviteQueue.sentAt, weekAgo),
          inArray(growthOpsInviteQueue.status, ["sent", "accepted"])
        )
      );
    const weeklySent = weeklySentRows[0]?.count ?? 0;

    if (weeklySent >= MAX_WEEKLY_INVITES) {
      await db
        .update(growthOpsInviteCampaigns)
        .set({ status: "paused", pauseReason: "Weekly limit reached (80/week)", updatedAt: new Date() })
        .where(eq(growthOpsInviteCampaigns.id, campaign.id));
      results.push({ campaignId: campaign.id, sent: 0, skipped: true, reason: "weekly_limit" });
      continue;
    }

    // Acceptance rate floor: after 10+ sends, require >= 30%
    if (campaign.totalSent >= 10) {
      const rate = campaign.totalSent > 0 ? campaign.totalAccepted / campaign.totalSent : 0;
      if (rate < MIN_ACCEPTANCE_RATE) {
        await db
          .update(growthOpsInviteCampaigns)
          .set({
            status: "paused",
            pauseReason: `Acceptance rate too low (${Math.round(rate * 100)}% < 30%)`,
            updatedAt: new Date(),
          })
          .where(eq(growthOpsInviteCampaigns.id, campaign.id));
        results.push({ campaignId: campaign.id, sent: 0, skipped: true, reason: "acceptance_rate" });
        continue;
      }
    }

    // ── Tier 3: 48h cooldown between campaigns on same account ────────────────
    const cooldownCutoff = new Date(now.getTime() - MIN_CAMPAIGN_GAP_HOURS * 60 * 60 * 1000);
    const recentCompleted = await db
      .select({ id: growthOpsInviteCampaigns.id })
      .from(growthOpsInviteCampaigns)
      .where(
        and(
          eq(growthOpsInviteCampaigns.linkedinAccountId, campaign.linkedinAccountId),
          eq(growthOpsInviteCampaigns.status, "completed"),
          gte(growthOpsInviteCampaigns.completedAt, cooldownCutoff)
        )
      )
      .limit(1);
    if (recentCompleted.length > 0) {
      results.push({ campaignId: campaign.id, sent: 0, skipped: true, reason: "cooldown_48h" });
      continue;
    }

    // ── Tier 4: Max consecutive send days + random rest day ───────────────────
    const recentUsage = await db
      .select({ date: growthOpsDailyUsage.date, invitesSent: growthOpsDailyUsage.invitesSent })
      .from(growthOpsDailyUsage)
      .where(eq(growthOpsDailyUsage.linkedinAccountId, campaign.linkedinAccountId))
      .orderBy(desc(growthOpsDailyUsage.date))
      .limit(7);

    // Count consecutive past days with activity (excluding today)
    let consecutiveDays = 0;
    for (const row of recentUsage) {
      if (row.date === todayStr) continue;
      if ((row.invitesSent ?? 0) > 0) {
        consecutiveDays++;
      } else {
        break;
      }
    }
    if (consecutiveDays >= MAX_CONSECUTIVE_SEND_DAYS) {
      results.push({ campaignId: campaign.id, sent: 0, skipped: true, reason: "max_consecutive_days" });
      continue;
    }

    // ~10% random rest day for humanisation
    if (Math.random() < RANDOM_REST_DAY_PROBABILITY) {
      results.push({ campaignId: campaign.id, sent: 0, skipped: true, reason: "random_rest_day" });
      continue;
    }

    // ── Tier 5: Active days + active hours window ─────────────────────────────
    const activeDays = (campaign.activeDays as string[]) ?? ["mon", "tue", "wed", "thu", "fri", "sat"];
    if (!activeDays.includes(todayDayAbbr)) {
      results.push({ campaignId: campaign.id, sent: 0, skipped: true, reason: "not_active_day" });
      continue;
    }
    if (currentHourUTC < campaign.activeHoursStart || currentHourUTC >= campaign.activeHoursEnd) {
      results.push({ campaignId: campaign.id, sent: 0, skipped: true, reason: "outside_active_hours" });
      continue;
    }

    // ── Daily budget check ────────────────────────────────────────────────────
    const dailyUsageRows = await db
      .select({ invitesSent: growthOpsDailyUsage.invitesSent })
      .from(growthOpsDailyUsage)
      .where(
        and(
          eq(growthOpsDailyUsage.linkedinAccountId, campaign.linkedinAccountId),
          eq(growthOpsDailyUsage.date, todayStr)
        )
      )
      .limit(1);
    const sentToday = dailyUsageRows[0]?.invitesSent ?? 0;

    if (sentToday >= MAX_DAILY_INVITES) {
      results.push({ campaignId: campaign.id, sent: 0, skipped: true, reason: "daily_limit" });
      continue;
    }

    const remainingBudget = Math.min(
      MAX_DAILY_INVITES - sentToday,
      MAX_WEEKLY_INVITES - weeklySent
    );
    if (remainingBudget <= 0) {
      results.push({ campaignId: campaign.id, sent: 0, skipped: true, reason: "no_budget" });
      continue;
    }

    // ── Process due queue items ───────────────────────────────────────────────
    const dueItems = await db
      .select()
      .from(growthOpsInviteQueue)
      .where(
        and(
          eq(growthOpsInviteQueue.campaignId, campaign.id),
          eq(growthOpsInviteQueue.status, "queued"),
          lte(growthOpsInviteQueue.scheduledAt, now)
        )
      )
      .limit(remainingBudget);

    let sent = 0;
    for (const item of dueItems) {
      try {
        // Resolve provider ID: queue cache → target cache → extract from URL
        let providerId = item.unipileProviderId;

        if (!providerId) {
          const [target] = await db
            .select({
              id: growthOpsInviteTargets.id,
              linkedinUrl: growthOpsInviteTargets.linkedinUrl,
              unipileProviderId: growthOpsInviteTargets.unipileProviderId,
            })
            .from(growthOpsInviteTargets)
            .where(eq(growthOpsInviteTargets.id, item.targetId))
            .limit(1);

          if (target) {
            providerId =
              target.unipileProviderId ??
              extractProviderIdFromUrl(target.linkedinUrl);

            if (providerId) {
              // Cache on queue item for next time
              await db
                .update(growthOpsInviteQueue)
                .set({ unipileProviderId: providerId })
                .where(eq(growthOpsInviteQueue.id, item.id));

              // Also cache on target if not already stored
              if (!target.unipileProviderId) {
                await db
                  .update(growthOpsInviteTargets)
                  .set({ unipileProviderId: providerId })
                  .where(eq(growthOpsInviteTargets.id, target.id));
              }
            }
          }
        }

        if (!providerId) {
          await db
            .update(growthOpsInviteQueue)
            .set({ status: "failed", errorMessage: "Could not resolve LinkedIn provider ID" })
            .where(eq(growthOpsInviteQueue.id, item.id));
          continue;
        }

        // Send the invite
        await UnipileClient.sendInvite(
          providerId,
          campaign.linkedinAccountId,
          campaign.inviteMessage ?? undefined
        );

        // Mark queue item as sent
        await db
          .update(growthOpsInviteQueue)
          .set({ status: "sent", sentAt: new Date() })
          .where(eq(growthOpsInviteQueue.id, item.id));

        // Mark target as invited
        await db
          .update(growthOpsInviteTargets)
          .set({ status: "invited", invitedAt: new Date() })
          .where(eq(growthOpsInviteTargets.id, item.targetId));

        sent++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await db
          .update(growthOpsInviteQueue)
          .set({ status: "failed", errorMessage: msg })
          .where(eq(growthOpsInviteQueue.id, item.id));
      }
    }

    if (sent > 0) {
      // Update campaign counters and mark started if first run
      await db
        .update(growthOpsInviteCampaigns)
        .set({
          totalSent: sql`${growthOpsInviteCampaigns.totalSent} + ${sent}`,
          startedAt: campaign.startedAt ?? new Date(),
          updatedAt: new Date(),
        })
        .where(eq(growthOpsInviteCampaigns.id, campaign.id));

      // Upsert daily usage tracking
      const existingUsage = await db
        .select({ id: growthOpsDailyUsage.id, invitesSent: growthOpsDailyUsage.invitesSent })
        .from(growthOpsDailyUsage)
        .where(
          and(
            eq(growthOpsDailyUsage.linkedinAccountId, campaign.linkedinAccountId),
            eq(growthOpsDailyUsage.date, todayStr)
          )
        )
        .limit(1);

      if (existingUsage.length > 0) {
        await db
          .update(growthOpsDailyUsage)
          .set({ invitesSent: (existingUsage[0].invitesSent ?? 0) + sent })
          .where(eq(growthOpsDailyUsage.id, existingUsage[0].id));
      } else {
        await db.insert(growthOpsDailyUsage).values({
          id: randomUUID(),
          linkedinAccountId: campaign.linkedinAccountId,
          date: todayStr,
          invitesSent: sent,
        });
      }
    }

    // Mark campaign complete if no queued items remain
    const remainingRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(growthOpsInviteQueue)
      .where(
        and(
          eq(growthOpsInviteQueue.campaignId, campaign.id),
          eq(growthOpsInviteQueue.status, "queued")
        )
      );
    if ((remainingRows[0]?.count ?? 0) === 0) {
      await db
        .update(growthOpsInviteCampaigns)
        .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
        .where(eq(growthOpsInviteCampaigns.id, campaign.id));
    }

    results.push({ campaignId: campaign.id, sent, skipped: false });
  }

  const totalSent = results.reduce((s, r) => s + r.sent, 0);
  return { processed: activeCampaigns.length, totalSent, results };
}
