import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emailApprovalQueue } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || !["admin", "superadmin"].includes(session.user.role ?? "")) return null;
  return session.user;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  await db
    .update(emailApprovalQueue)
    .set({ status: "rejected", reviewedBy: admin.id, reviewedAt: new Date() })
    .where(eq(emailApprovalQueue.id, id));

  return NextResponse.json({ ok: true });
}
