import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { growthOpsInviteCampaigns } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function checkAdmin() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  if (!session?.user || !["superadmin", "admin", "growth_ops"].includes(session.user.role ?? "")) return null;
  return session;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ campaignId: string }> }) {
  if (!await checkAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { campaignId } = await params;
  const body = await req.json() as { status: string };
  await db.update(growthOpsInviteCampaigns)
    .set({ status: body.status, updatedAt: new Date() })
    .where(eq(growthOpsInviteCampaigns.id, campaignId));
  return NextResponse.json({ ok: true });
}
