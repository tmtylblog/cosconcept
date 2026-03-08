import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emailApprovalQueue, emailMessages, emailThreads } from "@/lib/db/schema";
import { eq, desc, and, or } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || !["admin", "superadmin"].includes(session.user.role ?? "")) return null;
  return session.user;
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const tab = searchParams.get("tab") ?? "pending";

  if (tab === "pending") {
    const rows = await db
      .select()
      .from(emailApprovalQueue)
      .where(or(eq(emailApprovalQueue.status, "pending"), eq(emailApprovalQueue.status, "auto_approved")))
      .orderBy(desc(emailApprovalQueue.createdAt))
      .limit(50);
    return NextResponse.json({ items: rows });
  }

  if (tab === "sent") {
    const rows = await db
      .select()
      .from(emailMessages)
      .where(eq(emailMessages.direction, "outbound"))
      .orderBy(desc(emailMessages.createdAt))
      .limit(50);
    return NextResponse.json({ items: rows });
  }

  if (tab === "received") {
    const rows = await db
      .select()
      .from(emailMessages)
      .where(eq(emailMessages.direction, "inbound"))
      .orderBy(desc(emailMessages.createdAt))
      .limit(50);
    return NextResponse.json({ items: rows });
  }

  return NextResponse.json({ items: [] });
}
