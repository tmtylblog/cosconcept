/**
 * Inngest Function: Delete Organization
 *
 * Deletes an organization and all related data across PostgreSQL and Neo4j.
 * Runs as a background job to avoid Vercel timeout limits.
 *
 * Deletion order (child tables first to avoid FK constraint issues):
 * 1. specialist_profile_examples (FK → specialist_profiles)
 * 2. specialist_profiles (FK → expert_profiles, service_firms)
 * 3. expert_profiles (FK → service_firms)
 * 4. enrichment_audit_log
 * 5. firm_case_studies
 * 6. firm_services
 * 7. abstraction_profiles
 * 8. lead_shares (FK → leads)
 * 9. leads
 * 10. partnerships
 * 11. partner_preferences
 * 12. email_approval_queue
 * 13. email_threads
 * 14. opportunities
 * 15. referrals
 * 16. scheduled_calls
 * 17. domain_aliases
 * 18. onboarding_events
 * 19. service_firms
 * 20. organizations (cascades members, invitations, subscriptions)
 * 21. Neo4j DETACH DELETE
 */

import { inngest } from "../client";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { getNeo4jDriver } from "@/lib/neo4j";

export const deleteOrganization = inngest.createFunction(
  {
    id: "admin-delete-organization",
    name: "Delete Organization",
    retries: 2,
    concurrency: [{ limit: 1 }],
  },
  { event: "admin/delete-organization" },
  async ({ event, step }) => {
    const { orgId } = event.data;

    // Step 1: Find firm IDs
    const firmIds = await step.run("find-firms", async () => {
      const rows = await db.execute(
        sql`SELECT id FROM service_firms WHERE organization_id = ${orgId}`
      );
      return rows.rows.map((r) => r.id as string);
    });

    // Step 2: Delete child tables per firm
    if (firmIds.length > 0) {
      for (const firmId of firmIds) {
        await step.run(`delete-children-${firmId}`, async () => {
          // Order matters — deepest FK children first
          await safeDelete(sql`DELETE FROM specialist_profile_examples WHERE specialist_profile_id IN (SELECT id FROM specialist_profiles WHERE firm_id = ${firmId})`);
          await safeDelete(sql`DELETE FROM specialist_profiles WHERE firm_id = ${firmId}`);
          await safeDelete(sql`DELETE FROM expert_profiles WHERE firm_id = ${firmId}`);
          await safeDelete(sql`DELETE FROM enrichment_audit_log WHERE firm_id = ${firmId}`);
          await safeDelete(sql`DELETE FROM firm_case_studies WHERE firm_id = ${firmId}`);
          await safeDelete(sql`DELETE FROM firm_services WHERE firm_id = ${firmId}`);
          await safeDelete(sql`DELETE FROM abstraction_profiles WHERE entity_id = ${firmId}`);
          await safeDelete(sql`DELETE FROM lead_shares WHERE lead_id IN (SELECT id FROM leads WHERE firm_id = ${firmId})`);
          await safeDelete(sql`DELETE FROM leads WHERE firm_id = ${firmId}`);
          await safeDelete(sql`DELETE FROM partnerships WHERE firm_a_id = ${firmId} OR firm_b_id = ${firmId}`);
          await safeDelete(sql`DELETE FROM partner_preferences WHERE firm_id = ${firmId}`);
          await safeDelete(sql`DELETE FROM email_approval_queue WHERE firm_id = ${firmId}`);
          await safeDelete(sql`DELETE FROM email_threads WHERE firm_id = ${firmId}`);
          await safeDelete(sql`DELETE FROM opportunities WHERE firm_id = ${firmId}`);
          await safeDelete(sql`DELETE FROM referrals WHERE firm_id = ${firmId}`);
          await safeDelete(sql`DELETE FROM scheduled_calls WHERE firm_id = ${firmId}`);
          await safeDelete(sql`DELETE FROM domain_aliases WHERE firm_id = ${firmId}`);
          await safeDelete(sql`DELETE FROM onboarding_events WHERE firm_id = ${firmId}`);

          return { firmId, status: "children_deleted" };
        });

        // Delete the firm itself
        await step.run(`delete-firm-${firmId}`, async () => {
          await db.execute(sql`DELETE FROM service_firms WHERE id = ${firmId}`);
          return { firmId, status: "firm_deleted" };
        });
      }
    }

    // Step 3: Delete the organization
    // This cascade can be slow on Neon even with zero child rows (FK checks across 20+ tables)
    // but Inngest has no timeout — it just takes a minute or so
    await step.run("delete-org", async () => {
      await db.execute(sql`DELETE FROM organizations WHERE id = ${orgId}`);
      return { orgId, status: "org_deleted" };
    });

    console.warn(`[DeleteOrg] Successfully deleted org ${orgId} with ${firmIds.length} firm(s)`);

    // Step 4: Neo4j cleanup
    if (firmIds.length > 0) {
      await step.run("neo4j-cleanup", async () => {
        try {
          const session = getNeo4jDriver().session();
          try {
            await session.run(
              `UNWIND $firmIds AS fid
               MATCH (f:Company:ServiceFirm {id: fid})
               DETACH DELETE f`,
              { firmIds }
            );
          } finally {
            await session.close();
          }
        } catch (err) {
          console.error("[DeleteOrg] Neo4j cleanup failed:", err);
          // Non-critical — don't fail the job
        }
        return { neo4jCleaned: firmIds.length };
      });
    }

    return {
      orgId,
      firmsDeleted: firmIds.length,
      status: "complete",
    };
  }
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function safeDelete(query: any): Promise<void> {
  try {
    await db.execute(query);
  } catch (err) {
    // Log but don't throw — continue with remaining deletes
    console.error("[DeleteOrg] Table delete failed:", err instanceof Error ? err.message : err);
  }
}
