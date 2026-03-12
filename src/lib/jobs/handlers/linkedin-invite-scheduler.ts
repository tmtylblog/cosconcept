import { db } from "@/lib/db";
import { growthOpsInviteQueue, growthOpsInviteTargets, growthOpsInviteCampaigns } from "@/lib/db/schema";
import { UnipileClient } from "@/lib/growth-ops/UnipileClient";
import { eq, lte, and } from "drizzle-orm";

export async function handleLinkedInInviteScheduler(
  _payload: Record<string, unknown>
): Promise<unknown> {
  const now = new Date();

  // Skip Sundays
  if (now.getUTCDay() === 0) {
    return { skipped: true, reason: "Sunday" };
  }

  // Fetch all queued items due now
  const due = await db
    .select()
    .from(growthOpsInviteQueue)
    .where(
      and(
        eq(growthOpsInviteQueue.status, "queued"),
        lte(growthOpsInviteQueue.scheduledAt, now)
      )
    )
    .limit(50);

  if (due.length === 0) {
    return { sent: 0, message: "No items due" };
  }

  let sent = 0;
  let failed = 0;

  for (const item of due) {
    try {
      // Get the target's linkedin URL and provider ID
      const [target] = await db
        .select()
        .from(growthOpsInviteTargets)
        .where(eq(growthOpsInviteTargets.id, item.targetId))
        .limit(1);

      if (!target) {
        await db
          .update(growthOpsInviteQueue)
          .set({ status: "failed", errorMessage: "Target not found" })
          .where(eq(growthOpsInviteQueue.id, item.id));
        failed++;
        continue;
      }

      // Get the invite message from the campaign
      const [campaign] = await db
        .select()
        .from(growthOpsInviteCampaigns)
        .where(eq(growthOpsInviteCampaigns.id, item.campaignId))
        .limit(1);

      // Resolve provider ID if not cached
      let providerId = target.unipileProviderId;
      if (!providerId) {
        try {
          const resolved = await UnipileClient.resolveLinkedInUser(
            target.linkedinUrl,
            item.linkedinAccountId
          ) as { provider_id?: string };
          providerId = resolved.provider_id ?? null;
          if (providerId) {
            await db
              .update(growthOpsInviteTargets)
              .set({ unipileProviderId: providerId })
              .where(eq(growthOpsInviteTargets.id, target.id));
          }
        } catch {
          // Can't resolve — skip
          await db
            .update(growthOpsInviteQueue)
            .set({ status: "failed", errorMessage: "Could not resolve LinkedIn provider ID" })
            .where(eq(growthOpsInviteQueue.id, item.id));
          failed++;
          continue;
        }
      }

      if (!providerId) {
        await db
          .update(growthOpsInviteQueue)
          .set({ status: "failed", errorMessage: "No provider ID available" })
          .where(eq(growthOpsInviteQueue.id, item.id));
        failed++;
        continue;
      }

      // Send the invite
      await UnipileClient.sendInvite(
        providerId,
        item.linkedinAccountId,
        campaign?.inviteMessage ?? undefined
      );

      // Mark as sent
      await db
        .update(growthOpsInviteQueue)
        .set({ status: "sent", sentAt: new Date() })
        .where(eq(growthOpsInviteQueue.id, item.id));

      await db
        .update(growthOpsInviteTargets)
        .set({ status: "invited", invitedAt: new Date() })
        .where(eq(growthOpsInviteTargets.id, target.id));

      sent++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await db
        .update(growthOpsInviteQueue)
        .set({ status: "failed", errorMessage: msg })
        .where(eq(growthOpsInviteQueue.id, item.id));
      failed++;
    }
  }

  return { sent, failed, total: due.length };
}
