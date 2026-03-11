import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import neo4j from "neo4j-driver";
import { neo4jWrite } from "@/lib/neo4j";
import { db } from "@/lib/db";
import { partnerPreferences } from "@/lib/db/schema";
import { syncAllPreferencesToGraph } from "@/lib/enrichment/preference-writer";
import { isNull } from "drizzle-orm";

export const dynamic = "force-dynamic";
// Allow up to 5 minutes for migrations on Vercel Pro
export const maxDuration = 300;

/**
 * POST /api/admin/run-migration
 * Body: { job: "client-nodes-to-company" | "partnership-prefs-to-edges" }
 *
 * Runs one-time migrations directly (no Inngest required).
 * Superadmin only.
 */
export async function POST(req: NextRequest) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user || session.user.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { job } = await req.json();

  if (job === "client-nodes-to-company") {
    return runClientNodesToCompany();
  }

  if (job === "partnership-prefs-to-edges") {
    return runPartnershipPrefsToEdges();
  }

  return NextResponse.json({ error: `Unknown job: ${job}` }, { status: 400 });
}

async function runClientNodesToCompany(): Promise<NextResponse> {
  try {
    // Count legacy Client nodes
    const countResult = await neo4jWrite<{ total: number }>(
      `MATCH (c:Client) WHERE NOT c:Company RETURN count(c) AS total`,
      {}
    );
    const total = Number(countResult[0]?.total ?? 0);

    if (total === 0) {
      return NextResponse.json({ ok: true, message: "No legacy Client nodes to migrate", migrated: 0 });
    }

    let migrated = 0;
    const BATCH = neo4j.int(100);

    while (true) {
      // Domain-keyed merge
      await neo4jWrite(
        `MATCH (cl:Client)
         WHERE NOT cl:Company AND cl.domain IS NOT NULL AND cl.domain <> ""
         WITH cl LIMIT $limit
         MERGE (co:Company {domain: cl.domain})
         ON CREATE SET co.name = cl.name,
                       co.enrichmentStatus = "stub",
                       co.isCosCustomer = false,
                       co.source = "migrated_from_client",
                       co.createdAt = datetime()
         ON MATCH SET  co.name = coalesce(co.name, cl.name)
         WITH cl, co
         OPTIONAL MATCH (f:ServiceFirm)-[:HAS_CLIENT]->(cl)
         FOREACH (_ IN CASE WHEN f IS NOT NULL THEN [1] ELSE [] END |
           MERGE (f)-[:HAS_CLIENT]->(co)
         )
         WITH cl, co
         OPTIONAL MATCH (cs:CaseStudy)-[:FOR_CLIENT]->(cl)
         FOREACH (_ IN CASE WHEN cs IS NOT NULL THEN [1] ELSE [] END |
           MERGE (cs)-[:FOR_CLIENT]->(co)
         )
         SET cl.isLegacy = true`,
        { limit: BATCH }
      );

      // Name-keyed merge
      const nameResult = await neo4jWrite<{ count: number }>(
        `MATCH (cl:Client)
         WHERE NOT cl:Company AND (cl.domain IS NULL OR cl.domain = "")
         WITH cl LIMIT $limit
         MERGE (co:Company {name: cl.name})
         ON CREATE SET co.enrichmentStatus = "stub",
                       co.isCosCustomer = false,
                       co.source = "migrated_from_client",
                       co.createdAt = datetime()
         WITH cl, co
         OPTIONAL MATCH (f:ServiceFirm)-[:HAS_CLIENT]->(cl)
         FOREACH (_ IN CASE WHEN f IS NOT NULL THEN [1] ELSE [] END |
           MERGE (f)-[:HAS_CLIENT]->(co)
         )
         WITH cl, co
         OPTIONAL MATCH (cs:CaseStudy)-[:FOR_CLIENT]->(cl)
         FOREACH (_ IN CASE WHEN cs IS NOT NULL THEN [1] ELSE [] END |
           MERGE (cs)-[:FOR_CLIENT]->(co)
         )
         SET cl.isLegacy = true
         RETURN count(cl) AS count`,
        { limit: BATCH }
      );

      const batchCount = Number(nameResult[0]?.count ?? 0);
      migrated += batchCount;
      if (batchCount === 0) break;
    }

    const remainingResult = await neo4jWrite<{ remaining: number }>(
      `MATCH (c:Client) WHERE NOT c:Company RETURN count(c) AS remaining`,
      {}
    );
    const remaining = Number(remainingResult[0]?.remaining ?? 0);

    return NextResponse.json({ ok: true, message: "Migration complete", total, migrated, remaining });
  } catch (err) {
    console.error("[Migration] client-nodes-to-company failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Migration failed" },
      { status: 500 }
    );
  }
}

async function runPartnershipPrefsToEdges(): Promise<NextResponse> {
  try {
    const rows = await db
      .select({ firmId: partnerPreferences.firmId })
      .from(partnerPreferences)
      .where(isNull(partnerPreferences.preferencesSyncedAt));

    const firmIds = rows.map((r) => r.firmId);

    if (firmIds.length === 0) {
      return NextResponse.json({ ok: true, message: "All firm preferences already synced", synced: 0 });
    }

    let synced = 0;
    let errors = 0;

    for (const firmId of firmIds) {
      try {
        await syncAllPreferencesToGraph(firmId);
        synced++;
      } catch (err) {
        errors++;
        console.error(`[Migration] Failed to sync preferences for firm ${firmId}:`, err);
      }
    }

    return NextResponse.json({ ok: true, message: "Migration complete", total: firmIds.length, synced, errors });
  } catch (err) {
    console.error("[Migration] partnership-prefs-to-edges failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Migration failed" },
      { status: 500 }
    );
  }
}
