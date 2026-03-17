/**
 * POST /api/admin/data-quality/delete
 *
 * Delete a single organization and all its data.
 * Explicitly deletes heavy child tables first to avoid cascade timeout,
 * then deletes the org (which cascades the lightweight remainder).
 *
 * Body: { orgIds: string[] } (send one at a time from the UI)
 * Returns: { ok, deleted, message }
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { getNeo4jDriver } from "@/lib/neo4j";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

  // Process one org at a time (UI sends one at a time)
  const orgId = orgIds[0];

  try {
    // Find firm IDs for this org
    const firmRows = await db.execute(
      sql`SELECT id FROM service_firms WHERE organization_id = ${orgId}`
    );
    const firmIds = firmRows.rows.map((r) => r.id as string);

    if (firmIds.length > 0) {
      // Delete heavy child tables explicitly (fastest approach — avoids cascade bottleneck)
      // These are the tables with the most rows per firm
      for (const firmId of firmIds) {
        await db.execute(sql`DELETE FROM enrichment_audit_log WHERE firm_id = ${firmId}`);
        await db.execute(sql`DELETE FROM specialist_profiles WHERE firm_id = ${firmId}`);
        await db.execute(sql`DELETE FROM expert_profiles WHERE firm_id = ${firmId}`);
        await db.execute(sql`DELETE FROM firm_case_studies WHERE firm_id = ${firmId}`);
        await db.execute(sql`DELETE FROM firm_services WHERE firm_id = ${firmId}`);
        await db.execute(sql`DELETE FROM abstraction_profiles WHERE entity_id = ${firmId}`);
        await db.execute(sql`DELETE FROM partnerships WHERE firm_a_id = ${firmId} OR firm_b_id = ${firmId}`);
        await db.execute(sql`DELETE FROM partner_preferences WHERE firm_id = ${firmId}`);
        await db.execute(sql`DELETE FROM email_threads WHERE firm_id = ${firmId}`);
        await db.execute(sql`DELETE FROM email_approval_queue WHERE firm_id = ${firmId}`);
        await db.execute(sql`DELETE FROM leads WHERE firm_id = ${firmId}`);
        await db.execute(sql`DELETE FROM opportunities WHERE firm_id = ${firmId}`);
        await db.execute(sql`DELETE FROM referrals WHERE firm_id = ${firmId}`);
      }

      // Delete the service firms themselves
      for (const firmId of firmIds) {
        await db.execute(sql`DELETE FROM service_firms WHERE id = ${firmId}`);
      }
    }

    // Now delete the org (only lightweight cascades left: members, invitations, subscriptions)
    await db.execute(sql`DELETE FROM organizations WHERE id = ${orgId}`);

    // Neo4j cleanup (non-blocking — don't fail the request if Neo4j is slow)
    if (firmIds.length > 0) {
      try {
        const neo4jSession = getNeo4jDriver().session();
        try {
          await neo4jSession.run(
            `UNWIND $firmIds AS fid
             MATCH (f:Company:ServiceFirm {id: fid})
             DETACH DELETE f`,
            { firmIds }
          );
        } finally {
          await neo4jSession.close();
        }
      } catch {
        // Non-critical — graph nodes orphaned but harmless
      }
    }

    return NextResponse.json({
      ok: true,
      deleted: 1,
      firmsRemoved: firmIds.length,
      message: `Deleted org + ${firmIds.length} firm(s)`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[DataQuality] Delete org ${orgId} failed:`, msg);
    return NextResponse.json({ error: "Delete failed", detail: msg }, { status: 500 });
  }
}
