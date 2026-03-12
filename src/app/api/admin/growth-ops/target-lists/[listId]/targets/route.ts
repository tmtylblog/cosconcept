import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { growthOpsInviteTargets } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

async function checkAdmin() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  if (!session?.user || session.user.role !== "superadmin") return null;
  return session;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ listId: string }> }) {
  if (!await checkAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { listId } = await params;
  const targets = await db.select().from(growthOpsInviteTargets)
    .where(eq(growthOpsInviteTargets.listId, listId))
    .orderBy(growthOpsInviteTargets.createdAt);
  return NextResponse.json({ targets });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ listId: string }> }) {
  if (!await checkAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { listId } = await params;
  const body = await req.json() as { targets: Array<{ firstName: string; linkedinUrl: string }> };
  const inserted = await db.insert(growthOpsInviteTargets).values(
    body.targets.map((t) => ({
      id: randomUUID(),
      listId,
      firstName: t.firstName,
      linkedinUrl: t.linkedinUrl,
    }))
  ).returning();
  return NextResponse.json({ inserted: inserted.length });
}
