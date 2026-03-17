import { headers } from "next/headers";
import { eq, and, not, like } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { serviceFirms } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/** Score a firm row to pick the best candidate. Higher = better. */
function scoreFirmRow(row: {
  enrichmentData: unknown;
  enrichmentStatus: string | null;
  website: string | null;
}) {
  let score = 0;
  const ed = row.enrichmentData as {
    extracted?: { clients?: string[]; services?: string[] };
  } | null;

  // +100: has clients (strongest signal of real enrichment)
  if (ed?.extracted?.clients?.length) score += 100;
  // +50: has services
  if (ed?.extracted?.services?.length) score += 50;
  // +30: marked as enriched
  if (row.enrichmentStatus === "enriched") score += 30;
  // +20: has a real business website
  if (row.website && !row.website.includes("joincollectiveos.com")) score += 20;
  // +10: has any enrichment data
  if (ed) score += 10;

  return score;
}

/**
 * GET /api/enrich/firm?organizationId=...
 *
 * Returns persisted enrichment data for a firm (if it exists).
 * Used by EnrichmentProvider to hydrate from DB on mount.
 *
 * Looks up by organizationId column. When multiple firm records exist
 * for the same org (legacy import + app-created), prefers the non-legacy
 * record (id NOT starting with "firm_leg_").
 */
export async function GET(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const organizationId = url.searchParams.get("organizationId");

    if (!organizationId) {
      return Response.json({ error: "organizationId is required" }, { status: 400 });
    }

    // Fetch ALL non-legacy firms for this org, then pick the best one.
    // Multiple firm records can exist (e.g. auto-created "Collective OS" + enriched "Chameleon Collective").
    // Using LIMIT 1 without ORDER BY was non-deterministic and often picked the wrong one.
    let rows = await db
      .select({
        enrichmentData: serviceFirms.enrichmentData,
        enrichmentStatus: serviceFirms.enrichmentStatus,
        name: serviceFirms.name,
        website: serviceFirms.website,
      })
      .from(serviceFirms)
      .where(
        and(
          eq(serviceFirms.organizationId, organizationId),
          not(like(serviceFirms.id, "firm_leg_%"))
        )
      );

    // Fallback: any firm for this org (including legacy)
    if (rows.length === 0) {
      rows = await db
        .select({
          enrichmentData: serviceFirms.enrichmentData,
          enrichmentStatus: serviceFirms.enrichmentStatus,
          name: serviceFirms.name,
          website: serviceFirms.website,
        })
        .from(serviceFirms)
        .where(eq(serviceFirms.organizationId, organizationId));
    }

    if (rows.length === 0) {
      return Response.json({ enrichmentData: null });
    }

    // Pick the best firm record from candidates:
    // 1. Has clients in enrichment data
    // 2. Has enrichmentStatus = 'enriched'
    // 3. Has a real website (not joincollectiveos.com)
    // 4. Has any enrichment data at all
    // 5. First result as last resort
    const best = rows.reduce((pick, row) => {
      const pickScore = scoreFirmRow(pick);
      const rowScore = scoreFirmRow(row);
      return rowScore > pickScore ? row : pick;
    });

    if (!best.enrichmentData) {
      return Response.json({ enrichmentData: null });
    }

    console.log(
      `[Enrich/Firm] Picked "${best.name}" from ${rows.length} candidates ` +
      `(clients: ${(best.enrichmentData as Record<string, unknown>)?.extracted ? ((best.enrichmentData as { extracted?: { clients?: string[] } }).extracted?.clients?.length ?? 0) : 0})`
    );

    return Response.json({
      enrichmentData: best.enrichmentData,
      enrichmentStatus: best.enrichmentStatus,
      name: best.name,
      website: best.website,
    });
  } catch (error) {
    console.error("[Enrich/Firm] Failed to load enrichment data:", error);
    return Response.json(
      { error: "Failed to load enrichment data" },
      { status: 500 }
    );
  }
}
