import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emailApprovalQueue } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { inngest } from "@/inngest/client";

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

  const entry = await db.query.emailApprovalQueue.findFirst({
    where: eq(emailApprovalQueue.id, id),
  });
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (entry.status === "sent") return NextResponse.json({ error: "Already sent" }, { status: 409 });

  await db
    .update(emailApprovalQueue)
    .set({ status: "approved", reviewedBy: admin.id, reviewedAt: new Date() })
    .where(eq(emailApprovalQueue.id, id));

  // Queue send-now job
  await inngest.send({ name: "email/send-now", data: { queueId: id } });

  return NextResponse.json({ ok: true });
}
