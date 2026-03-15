/**
 * GET /api/experts?firmId=...
 * GET /api/experts?organizationId=...
 * List all expert profiles for a firm, with their best specialist profile.
 * Accepts either firmId directly or organizationId (looks up firmId automatically).
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
  const firmIdParam = searchParams.get("firmId");
  const organizationId = searchParams.get("organizationId");

  if (!firmIdParam && !organizationId) {
    return Response.json({ error: "firmId or organizationId required" }, { status: 400 });
  }

  // Resolve firm — either by firmId directly or by organizationId
  let firm: { id: string; organizationId: string } | undefined;
  if (firmIdParam) {
    const [row] = await db
      .select({ id: serviceFirms.id, organizationId: serviceFirms.organizationId })
      .from(serviceFirms)
      .where(eq(serviceFirms.id, firmIdParam))
      .limit(1);
    firm = row;
  } else {
    const [row] = await db
      .select({ id: serviceFirms.id, organizationId: serviceFirms.organizationId })
      .from(serviceFirms)
      .where(eq(serviceFirms.organizationId, organizationId!))
      .limit(1);
    firm = row;
  }

  if (!firm) return Response.json({ experts: [] }); // No firm yet — return empty

  const [membership] = await db
    .select({ id: members.id })
    .from(members)
    .where(eq(members.organizationId, firm.organizationId))
    .limit(1);

  if (!membership) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const firmId = firm.id;

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

  const result = experts
    .map((ep) => {
      // Compute tier from pdlData classification, or auto-classify from evidence
      const pdl = ep.pdlData as Record<string, unknown> | null;
      const pdlClassification = (pdl?.classifiedAs as string) ?? null;
      const hasExperience = Array.isArray(pdl?.experience) && (pdl.experience as unknown[]).length > 0;
      const isFullyEnriched = hasExperience || ep.enrichmentStatus === "enriched";

      const sps = (spByExpert[ep.id] ?? []).sort(
        (a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0)
      );
      const hasSpecialistProfiles = sps.length > 0;

      // Auto-classify: PDL classification wins, else specialist profiles or
      // work history presence → "expert", else null (unclassified)
      const expertTier = pdlClassification
        ?? (hasSpecialistProfiles || hasExperience ? "expert" : null);

      const bestSp = sps[0];
      const strongCount = sps.filter((s) => s.qualityStatus === "strong").length;
      const partialCount = sps.filter((s) => s.qualityStatus === "partial").length;

      return {
        ...ep,
        expertTier,
        isFullyEnriched,
        enrichmentStatus: ep.enrichmentStatus ?? (isFullyEnriched ? "enriched" : "roster"),
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
    })
    // Filter out not_expert tier — users shouldn't see internal ops staff
    .filter((ep) => ep.expertTier !== "not_expert");

  return Response.json({ experts: result });
}
