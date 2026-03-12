import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { growthOpsTargetLists } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

async function checkAdmin() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  if (!session?.user || session.user.role !== "superadmin") return null;
  return session;
}

export async function GET() {
  if (!await checkAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const lists = await db.select().from(growthOpsTargetLists).orderBy(growthOpsTargetLists.createdAt);
  return NextResponse.json({ lists });
}

export async function POST(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json() as { name: string; description?: string };
  const [list] = await db.insert(growthOpsTargetLists).values({
    id: randomUUID(),
    name: body.name,
    description: body.description ?? null,
  }).returning();
  return NextResponse.json({ list });
}

export async function DELETE(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  await db.delete(growthOpsTargetLists).where(eq(growthOpsTargetLists.id, id));
  return NextResponse.json({ ok: true });
}
