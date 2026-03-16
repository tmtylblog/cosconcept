import { headers } from "next/headers";
import { eq, and, not, like, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { serviceFirms } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

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

    // Try non-legacy firm first (app-created firms have richer data)
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
      )
      .limit(1);

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
        .where(eq(serviceFirms.organizationId, organizationId))
        .limit(1);
    }

    if (rows.length === 0 || !rows[0].enrichmentData) {
      return Response.json({ enrichmentData: null });
    }

    return Response.json({
      enrichmentData: rows[0].enrichmentData,
      enrichmentStatus: rows[0].enrichmentStatus,
      name: rows[0].name,
      website: rows[0].website,
    });
  } catch (error) {
    console.error("[Enrich/Firm] Failed to load enrichment data:", error);
    return Response.json(
      { error: "Failed to load enrichment data" },
      { status: 500 }
    );
  }
}
