import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { attributionEvents, acqContacts, users } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function checkAdmin() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  if (!session?.user || session.user.role !== "superadmin") return null;
  return session;
}

export async function GET() {
  if (!await checkAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Join attribution_events with users and acq_contacts for display
  const rows = await db
    .select({
      id: attributionEvents.id,
      userId: attributionEvents.userId,
      matchMethod: attributionEvents.matchMethod,
      instantlyCampaignName: attributionEvents.instantlyCampaignName,
      linkedinCampaignId: attributionEvents.linkedinCampaignId,
      matchedAt: attributionEvents.matchedAt,
      createdAt: attributionEvents.createdAt,
      // User fields
      userName: users.name,
      userEmail: users.email,
      // Contact fields
      contactFirstName: acqContacts.firstName,
      contactLastName: acqContacts.lastName,
      contactEmail: acqContacts.email,
    })
    .from(attributionEvents)
    .leftJoin(users, eq(users.id, attributionEvents.userId))
    .leftJoin(acqContacts, eq(acqContacts.id, attributionEvents.contactId))
    .orderBy(desc(attributionEvents.createdAt))
    .limit(500);

  const total = rows.length;
  const matched = rows.filter((r) => r.matchMethod !== "none").length;
  const byMethod: Record<string, number> = {};
  for (const row of rows) {
    byMethod[row.matchMethod] = (byMethod[row.matchMethod] ?? 0) + 1;
  }

  return NextResponse.json({ rows, total, matched, byMethod });
}
