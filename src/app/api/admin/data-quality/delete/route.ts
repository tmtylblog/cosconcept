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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function tryDelete(label: string, query: any, steps: string[]): Promise<void> {
  try {
    await db.execute(query);
    steps.push(`${label}: ok`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    steps.push(`${label}: FAILED — ${msg.slice(0, 200)}`);
    // Don't throw — continue deleting other tables
  }
}

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

    // Delete step by step, catching errors at each stage to identify which table blocks
    const steps: string[] = [];

    if (firmIds.length > 0) {
      for (const firmId of firmIds) {
        // Delete child tables that reference expert_profiles first (specialist_profiles has FK to expert_profiles)
        await tryDelete("specialist_profile_examples", sql`DELETE FROM specialist_profile_examples WHERE specialist_profile_id IN (SELECT id FROM specialist_profiles WHERE firm_id = ${firmId})`, steps);
        await tryDelete("specialist_profiles", sql`DELETE FROM specialist_profiles WHERE firm_id = ${firmId}`, steps);
        await tryDelete("expert_profiles", sql`DELETE FROM expert_profiles WHERE firm_id = ${firmId}`, steps);
        await tryDelete("enrichment_audit_log", sql`DELETE FROM enrichment_audit_log WHERE firm_id = ${firmId}`, steps);
        await tryDelete("firm_case_studies", sql`DELETE FROM firm_case_studies WHERE firm_id = ${firmId}`, steps);
        await tryDelete("firm_services", sql`DELETE FROM firm_services WHERE firm_id = ${firmId}`, steps);
        await tryDelete("abstraction_profiles", sql`DELETE FROM abstraction_profiles WHERE entity_id = ${firmId}`, steps);
        await tryDelete("lead_shares (via leads)", sql`DELETE FROM lead_shares WHERE lead_id IN (SELECT id FROM leads WHERE firm_id = ${firmId})`, steps);
        await tryDelete("leads", sql`DELETE FROM leads WHERE firm_id = ${firmId}`, steps);
        await tryDelete("partnerships", sql`DELETE FROM partnerships WHERE firm_a_id = ${firmId} OR firm_b_id = ${firmId}`, steps);
        await tryDelete("partner_preferences", sql`DELETE FROM partner_preferences WHERE firm_id = ${firmId}`, steps);
        await tryDelete("email_approval_queue", sql`DELETE FROM email_approval_queue WHERE firm_id = ${firmId}`, steps);
        await tryDelete("email_threads", sql`DELETE FROM email_threads WHERE firm_id = ${firmId}`, steps);
        await tryDelete("opportunities", sql`DELETE FROM opportunities WHERE firm_id = ${firmId}`, steps);
        await tryDelete("referrals", sql`DELETE FROM referrals WHERE firm_id = ${firmId}`, steps);
        await tryDelete("scheduled_calls", sql`DELETE FROM scheduled_calls WHERE firm_id = ${firmId}`, steps);
        await tryDelete("domain_aliases", sql`DELETE FROM domain_aliases WHERE firm_id = ${firmId}`, steps);
        await tryDelete("onboarding_events", sql`DELETE FROM onboarding_events WHERE firm_id = ${firmId}`, steps);
      }

      // Delete the service firms themselves
      for (const firmId of firmIds) {
        await tryDelete("service_firms", sql`DELETE FROM service_firms WHERE id = ${firmId}`, steps);
      }
    }

    // Now delete the org
    await tryDelete("organizations", sql`DELETE FROM organizations WHERE id = ${orgId}`, steps);

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

    const failedSteps = steps.filter((s) => s.includes("FAILED"));

    return NextResponse.json({
      ok: failedSteps.length === 0,
      deleted: failedSteps.length === 0 ? 1 : 0,
      firmsRemoved: firmIds.length,
      steps,
      failedSteps,
      message: failedSteps.length === 0
        ? `Deleted org + ${firmIds.length} firm(s)`
        : `Partial delete — ${failedSteps.length} step(s) failed. Check steps for details.`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[DataQuality] Delete org ${orgId} failed:`, msg);
    return NextResponse.json({ error: "Delete failed", detail: msg }, { status: 500 });
  }
}
