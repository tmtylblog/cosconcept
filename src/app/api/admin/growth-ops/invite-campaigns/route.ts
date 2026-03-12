import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { growthOpsInviteCampaigns, growthOpsInviteTargets, growthOpsInviteQueue } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
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
  const campaigns = await db.select().from(growthOpsInviteCampaigns).orderBy(growthOpsInviteCampaigns.createdAt);
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
  };

  const campaignId = randomUUID();
  const [campaign] = await db.insert(growthOpsInviteCampaigns).values({
    id: campaignId,
    name: body.name,
    targetListId: body.targetListId,
    linkedinAccountId: body.linkedinAccountId,
    dailyMin: body.dailyMin ?? 15,
    dailyMax: body.dailyMax ?? 19,
    inviteMessage: body.inviteMessage ?? null,
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
    const schedule = buildInviteSchedule(
      pendingTargetIds,
      body.linkedinAccountId,
      campaignId,
      campaign.dailyMin,
      campaign.dailyMax
    );
    await db.insert(growthOpsInviteQueue).values(schedule);
  }

  return NextResponse.json({ campaign });
}
