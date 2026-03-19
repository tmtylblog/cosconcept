/**
 * GET /api/admin/growth-ops/dashboard/linkedin
 *
 * LinkedIn analytics per account: outreach volume, response rates,
 * and deal outcomes broken down by pipeline stage.
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  growthOpsLinkedInAccounts,
  growthOpsInviteQueue,
  growthOpsInviteCampaigns,
  acqDeals,
  acqPipelineStages,
} from "@/lib/db/schema";
import { eq, gte, and, asc, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["superadmin", "admin", "growth_ops"];

function getPeriodDate(period: string): Date {
  const now = new Date();
  switch (period) {
    case "7d": return new Date(now.getTime() - 7 * 86400000);
    case "30d": return new Date(now.getTime() - 30 * 86400000);
    case "90d": return new Date(now.getTime() - 90 * 86400000);
    case "all": return new Date(0);
    default: return new Date(now.getTime() - 30 * 86400000);
  }
}

export async function GET(req: NextRequest) {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  if (
    !session?.user ||
    !ALLOWED_ROLES.includes((session.user as Record<string, unknown>).role as string)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const period = req.nextUrl.searchParams.get("period") ?? "30d";
  const since = getPeriodDate(period);

  try {
    // Fetch all LinkedIn accounts
    const accounts = await db
      .select({
        id: growthOpsLinkedInAccounts.id,
        displayName: growthOpsLinkedInAccounts.displayName,
        linkedinUsername: growthOpsLinkedInAccounts.linkedinUsername,
        status: growthOpsLinkedInAccounts.status,
        accountType: growthOpsLinkedInAccounts.accountType,
        notes: growthOpsLinkedInAccounts.notes,
      })
      .from(growthOpsLinkedInAccounts)
      .orderBy(asc(growthOpsLinkedInAccounts.createdAt));

    // Fetch invite queue stats per account in the period
    const inviteStats = await db
      .select({
        linkedinAccountId: growthOpsInviteQueue.linkedinAccountId,
        status: growthOpsInviteQueue.status,
        cnt: sql<number>`count(*)`,
      })
      .from(growthOpsInviteQueue)
      .where(gte(growthOpsInviteQueue.createdAt, since))
      .groupBy(growthOpsInviteQueue.linkedinAccountId, growthOpsInviteQueue.status);

    // Build campaign → account mapping
    const campaigns = await db
      .select({ id: growthOpsInviteCampaigns.id, linkedinAccountId: growthOpsInviteCampaigns.linkedinAccountId })
      .from(growthOpsInviteCampaigns);
    const campaignToAccount = new Map<string, string>();
    for (const c of campaigns) campaignToAccount.set(c.id, c.linkedinAccountId);

    // Fetch all LinkedIn-sourced deals in the period
    const linkedinDeals = await db
      .select({
        id: acqDeals.id,
        source: acqDeals.source,
        sourceCampaignId: acqDeals.sourceCampaignId,
        stageId: acqDeals.stageId,
        status: acqDeals.status,
        dealValue: acqDeals.dealValue,
      })
      .from(acqDeals)
      .where(
        and(
          gte(acqDeals.createdAt, since),
          eq(acqDeals.sourceChannel, "linkedin"),
        )
      );

    // Fetch pipeline stages for labeling
    const stages = await db
      .select({ id: acqPipelineStages.id, label: acqPipelineStages.label, color: acqPipelineStages.color })
      .from(acqPipelineStages)
      .where(eq(acqPipelineStages.pipelineId, "default"))
      .orderBy(asc(acqPipelineStages.displayOrder));

    // Build per-account stats
    const accountStats = accounts.map((acct) => {
      // Invite queue numbers
      const acctInvites = inviteStats.filter((r) => r.linkedinAccountId === acct.id);
      const sent = acctInvites.filter((r) => r.status === "sent").reduce((s, r) => s + Number(r.cnt), 0);
      const accepted = acctInvites.filter((r) => r.status === "accepted").reduce((s, r) => s + Number(r.cnt), 0);
      const queued = acctInvites.filter((r) => r.status === "queued").reduce((s, r) => s + Number(r.cnt), 0);
      const failed = acctInvites.filter((r) => r.status === "failed").reduce((s, r) => s + Number(r.cnt), 0);
      const totalOutreach = sent + accepted;
      const responseRate = totalOutreach > 0 ? Math.round((accepted / totalOutreach) * 100) : 0;

      // Deals linked to this account via campaign
      const acctDeals = linkedinDeals.filter((d) =>
        d.sourceCampaignId && campaignToAccount.get(d.sourceCampaignId) === acct.id
      );
      const totalDeals = acctDeals.length;
      const openDeals = acctDeals.filter((d) => d.status === "open").length;
      const wonDeals = acctDeals.filter((d) => d.status === "won").length;
      const lostDeals = acctDeals.filter((d) => d.status === "lost").length;
      const pipelineValue = acctDeals
        .filter((d) => d.status === "open" && d.dealValue)
        .reduce((s, d) => s + (parseFloat(d.dealValue!) || 0), 0);

      // Deals by stage
      const dealsByStage = stages.map((st) => ({
        label: st.label,
        color: st.color,
        count: acctDeals.filter((d) => d.stageId === st.id).length,
      })).filter((s) => s.count > 0);

      return {
        id: acct.id,
        displayName: acct.displayName,
        linkedinUsername: acct.linkedinUsername,
        status: acct.status,
        accountType: acct.accountType,
        notes: acct.notes ?? null,
        outreach: { sent, accepted, queued, failed, totalOutreach, responseRate },
        deals: { total: totalDeals, open: openDeals, won: wonDeals, lost: lostDeals, pipelineValue, byStage: dealsByStage },
      };
    });

    // Totals across all accounts
    const totalOutreach = accountStats.reduce((s, a) => s + a.outreach.totalOutreach, 0);
    const totalAccepted = accountStats.reduce((s, a) => s + a.outreach.accepted, 0);
    const totals = {
      totalOutreach,
      totalAccepted,
      totalDeals: linkedinDeals.length,
      totalWon: linkedinDeals.filter((d) => d.status === "won").length,
      totalPipelineValue: linkedinDeals
        .filter((d) => d.status === "open" && d.dealValue)
        .reduce((s, d) => s + (parseFloat(d.dealValue!) || 0), 0),
      overallResponseRate: totalOutreach > 0 ? Math.round((totalAccepted / totalOutreach) * 100) : 0,
    };

    return NextResponse.json({
      accounts: accountStats,
      totals,
      unlinkedDeals: linkedinDeals.filter((d) => !d.sourceCampaignId || !campaignToAccount.has(d.sourceCampaignId)).length,
      stages: stages.map((s) => ({ label: s.label, color: s.color })),
      period,
    });
  } catch (err) {
    console.error("[LinkedIn Dashboard] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
