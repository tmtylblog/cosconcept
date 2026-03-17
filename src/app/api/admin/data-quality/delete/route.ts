/**
 * POST /api/admin/data-quality/delete
 *
 * Bulk delete organizations (and cascade to their service firms + all related data).
 * Also cleans up Neo4j ServiceFirm nodes.
 *
 * Body: { orgIds: string[] }
 * Returns: { deleted, failed, neo4jCleaned }
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  serviceFirms,
  abstractionProfiles,
} from "@/lib/db/schema";
import { inArray, sql } from "drizzle-orm";
import { getNeo4jDriver } from "@/lib/neo4j";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // 2 minutes — cascade deletes can be slow

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const orgIds: string[] = body.orgIds;

  if (!orgIds || !Array.isArray(orgIds) || orgIds.length === 0) {
    return NextResponse.json({ error: "orgIds array required" }, { status: 400 });
  }

  if (orgIds.length > 50) {
    return NextResponse.json({ error: "Max 50 organizations per request" }, { status: 400 });
  }

  try {
    // 1. Find firm IDs for these orgs (needed for Neo4j cleanup)
    const firms = await db
      .select({ id: serviceFirms.id })
      .from(serviceFirms)
      .where(inArray(serviceFirms.organizationId, orgIds));
    const firmIds = firms.map((f) => f.id);

    // 2. Delete abstraction profiles (not FK-cascaded from serviceFirms)
    if (firmIds.length > 0) {
      await db
        .delete(abstractionProfiles)
        .where(inArray(abstractionProfiles.entityId, firmIds));
    }

    // 3. Delete all organizations in a single SQL statement (much faster than one-by-one)
    let deleted = 0;
    const failed: string[] = [];

    try {
      await db.execute(
        sql`DELETE FROM organizations WHERE id IN ${orgIds}`
      );
      deleted = orgIds.length;
    } catch (err) {
      // If bulk fails, fall back to one-by-one to identify which ones fail
      console.error("[DataQuality] Bulk delete failed, trying one-by-one:", err);
      for (const orgId of orgIds) {
        try {
          await db.execute(sql`DELETE FROM organizations WHERE id = ${orgId}`);
          deleted++;
        } catch (innerErr) {
          console.error(`[DataQuality] Failed to delete org ${orgId}:`, innerErr);
          failed.push(orgId);
        }
      }
    }

    // 4. Clean up Neo4j ServiceFirm nodes (batch query — much faster)
    let neo4jCleaned = 0;
    if (firmIds.length > 0) {
      try {
        const neo4jSession = getNeo4jDriver().session();
        try {
          const result = await neo4jSession.run(
            `UNWIND $firmIds AS fid
             MATCH (f:Company:ServiceFirm {id: fid})
             DETACH DELETE f
             RETURN count(f) AS deleted`,
            { firmIds }
          );
          neo4jCleaned = result.records[0]?.get("deleted")?.toNumber?.() ?? firmIds.length;
        } finally {
          await neo4jSession.close();
        }
      } catch (err) {
        console.error("[DataQuality] Neo4j cleanup error:", err);
      }
    }

    return NextResponse.json({
      ok: true,
      deleted,
      failed: failed.length > 0 ? failed : undefined,
      firmsRemoved: firmIds.length,
      neo4jCleaned,
      message: `Deleted ${deleted} organizations, ${firmIds.length} firms, ${neo4jCleaned} graph nodes.${failed.length > 0 ? ` ${failed.length} failed.` : ""}`,
    });
  } catch (error) {
    console.error("[DataQuality] Bulk delete error:", error);
    return NextResponse.json({ error: "Bulk delete failed" }, { status: 500 });
  }
}
