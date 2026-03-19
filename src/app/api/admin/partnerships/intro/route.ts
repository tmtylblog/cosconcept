import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { partnerships } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { queuePartnershipIntro } from "@/lib/email/send-partnership-intro";

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || !["admin", "superadmin"].includes(session.user.role ?? "")) return null;
  return session.user;
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { partnershipId } = await req.json();
  if (!partnershipId) return NextResponse.json({ error: "partnershipId required" }, { status: 400 });

  const partnership = await db.query.partnerships.findFirst({
    where: eq(partnerships.id, partnershipId),
  });
  if (!partnership) return NextResponse.json({ error: "Partnership not found" }, { status: 404 });

  try {
    const { queueId, autoSent } = await queuePartnershipIntro({
      partnershipId,
      firmAId: partnership.firmAId,
      firmBId: partnership.firmBId,
      matchScore: partnership.matchScore ?? undefined,
      matchExplanation: partnership.matchExplanation ?? undefined,
      senderUserId: admin.id,
    });

    return NextResponse.json({ ok: true, queueId, autoSent });
  } catch (err) {
    console.error("[Intro] Failed to queue intro:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate intro" },
      { status: 500 }
    );
  }
}
