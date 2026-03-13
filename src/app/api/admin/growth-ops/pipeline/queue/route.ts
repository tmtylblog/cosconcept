import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { acqDealQueue } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { approveDealFromQueue, rejectDealFromQueue } from "@/lib/growth-ops/auto-deal";

export const dynamic = "force-dynamic";

async function checkAdmin() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  if (!session?.user || (session.user as Record<string, unknown>).role !== "superadmin") return null;
  return session;
}

// GET — list queue items
export async function GET(req: NextRequest) {
  const session = await checkAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const status = req.nextUrl.searchParams.get("status") ?? "pending";

  try {
    const items = await db
      .select()
      .from(acqDealQueue)
      .where(eq(acqDealQueue.status, status))
      .orderBy(desc(acqDealQueue.createdAt))
      .limit(100);

    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST — approve or reject
export async function POST(req: NextRequest) {
  const session = await checkAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();

  try {
    if (body.action === "approve") {
      const result = await approveDealFromQueue(body.queueId, session.user.id);
      return NextResponse.json(result);
    }

    if (body.action === "reject") {
      await rejectDealFromQueue(body.queueId, session.user.id);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
