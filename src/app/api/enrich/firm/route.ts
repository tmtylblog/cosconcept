import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { serviceFirms } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/**
 * GET /api/enrich/firm?organizationId=...
 *
 * Returns persisted enrichment data for a firm (if it exists).
 * Used by EnrichmentProvider to hydrate from DB on mount.
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

    const firmId = `firm_${organizationId}`;
    const rows = await db
      .select({
        enrichmentData: serviceFirms.enrichmentData,
        enrichmentStatus: serviceFirms.enrichmentStatus,
        name: serviceFirms.name,
        website: serviceFirms.website,
      })
      .from(serviceFirms)
      .where(eq(serviceFirms.id, firmId))
      .limit(1);

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
