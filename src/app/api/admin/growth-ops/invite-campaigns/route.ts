import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  growthOpsInviteCampaigns,
  growthOpsInviteTargets,
  growthOpsInviteQueue,
  growthOpsLinkedInAccounts,
  growthOpsTargetLists,
} from "@/lib/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { buildInviteSchedule } from "@/lib/growth-ops/invite-scheduler";

export const dynamic = "force-dynamic";

async function checkAdmin() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  if (!session?.user || session.user.role !== "superadmin") return null;
  return session;
}

export async function GET() {
  if (!await checkAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await db
    .select({
      campaign: growthOpsInviteCampaigns,
      accountName: growthOpsLinkedInAccounts.displayName,
      accountStatus: growthOpsLinkedInAccounts.status,
      listName: growthOpsTargetLists.name,
      queuedCount: sql<number>`(
        SELECT count(*)::int FROM growth_ops_invite_queue
        WHERE campaign_id = ${growthOpsInviteCampaigns.id}
        AND status = 'queued'
      )`,
    })
    .from(growthOpsInviteCampaigns)
    .leftJoin(growthOpsLinkedInAccounts, eq(growthOpsLinkedInAccounts.id, growthOpsInviteCampaigns.linkedinAccountId))
    .leftJoin(growthOpsTargetLists, eq(growthOpsTargetLists.id, growthOpsInviteCampaigns.targetListId))
    .orderBy(desc(growthOpsInviteCampaigns.createdAt));

  const campaigns = rows.map((r) => ({
    ...r.campaign,
    accountName: r.accountName ?? "",
    accountStatus: r.accountStatus ?? "",
    listName: r.listName ?? "",
    queuedCount: r.queuedCount ?? 0,
  }));

  return NextResponse.json({ campaigns });
}

export async function POST(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json() as {
    name: string;
    targetListId: string;
    linkedinAccountId: string;
    dailyMin?: number;
    dailyMax?: number;
    inviteMessage?: string;
    activeDays?: string[];
    activeHoursStart?: number;
    activeHoursEnd?: number;
  };

  const dailyMin = body.dailyMin ?? 15;
  const dailyMax = body.dailyMax ?? 19;
  const activeDays = body.activeDays ?? ["mon", "tue", "wed", "thu", "fri", "sat"];
  const activeHoursStart = body.activeHoursStart ?? 8;
  const activeHoursEnd = body.activeHoursEnd ?? 18;

  const campaignId = randomUUID();
  const [campaign] = await db.insert(growthOpsInviteCampaigns).values({
    id: campaignId,
    name: body.name,
    targetListId: body.targetListId,
    linkedinAccountId: body.linkedinAccountId,
    dailyMin,
    dailyMax,
    inviteMessage: body.inviteMessage ?? null,
    activeDays,
    activeHoursStart,
    activeHoursEnd,
    status: "draft",
  }).returning();

  // Pre-build the invite queue for all pending targets in the list
  const targets = await db.select()
    .from(growthOpsInviteTargets)
    .where(eq(growthOpsInviteTargets.listId, body.targetListId));

  const pendingTargetIds = targets
    .filter((t) => t.status === "pending")
    .map((t) => t.id);

  if (pendingTargetIds.length > 0) {
    const dailyTarget = Math.round((dailyMin + dailyMax) / 2);
    const schedule = buildInviteSchedule(
      pendingTargetIds,
      body.linkedinAccountId,
      campaignId,
      { dailyTarget, activeDays, activeHoursStart, activeHoursEnd }
    );
    await db.insert(growthOpsInviteQueue).values(schedule);
  }

  return NextResponse.json({ campaign });
}
