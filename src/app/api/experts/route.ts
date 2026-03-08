/**
 * GET /api/experts?firmId=...
 * List all expert profiles for a firm, with their best specialist profile.
 */

import { headers } from "next/headers";
import { eq, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  expertProfiles,
  specialistProfiles,
  serviceFirms,
  members,
} from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const firmId = searchParams.get("firmId");

  if (!firmId) {
    return Response.json({ error: "firmId required" }, { status: 400 });
  }

  // Verify the user belongs to the org that owns this firm
  const [firm] = await db
    .select({ id: serviceFirms.id, organizationId: serviceFirms.organizationId })
    .from(serviceFirms)
    .where(eq(serviceFirms.id, firmId))
    .limit(1);

  if (!firm) return Response.json({ error: "Firm not found" }, { status: 404 });

  const [membership] = await db
    .select({ id: members.id })
    .from(members)
    .where(eq(members.organizationId, firm.organizationId))
    .limit(1);

  if (!membership) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Load experts with their specialist profiles
  const experts = await db
    .select()
    .from(expertProfiles)
    .where(eq(expertProfiles.firmId, firmId))
    .orderBy(desc(expertProfiles.updatedAt));

  // Load specialist profiles for each expert
  const spList = await db
    .select()
    .from(specialistProfiles)
    .where(eq(specialistProfiles.firmId, firmId));

  // Group sp by expertProfileId
  const spByExpert: Record<string, typeof spList> = {};
  for (const sp of spList) {
    if (!spByExpert[sp.expertProfileId]) spByExpert[sp.expertProfileId] = [];
    spByExpert[sp.expertProfileId].push(sp);
  }

  const result = experts.map((ep) => {
    const sps = (spByExpert[ep.id] ?? []).sort(
      (a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0)
    );
    const bestSp = sps[0];
    const strongCount = sps.filter((s) => s.qualityStatus === "strong").length;
    const partialCount = sps.filter((s) => s.qualityStatus === "partial").length;

    return {
      ...ep,
      specialistProfiles: sps,
      bestSpecialistTitle: bestSp?.qualityStatus === "strong" ? bestSp.title : null,
      qualitySummary:
        sps.length === 0
          ? "No specialist profiles yet"
          : [
              strongCount > 0 ? `${strongCount} Strong` : null,
              partialCount > 0 ? `${partialCount} Partial` : null,
            ]
              .filter(Boolean)
              .join(" · ") || `${sps.length} profiles`,
    };
  });

  return Response.json({ experts: result });
}
