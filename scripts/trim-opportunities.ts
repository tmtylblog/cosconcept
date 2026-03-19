/**
 * One-time script: Trim seeded opportunity data to 3 entries.
 * Deletes all but the 3 most recent opportunities and their associated leads/shares.
 *
 * Usage: npx tsx scripts/trim-opportunities.ts
 */

import "dotenv/config";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { opportunities, leads, leadShares } from "../src/lib/db/schema";
import { desc, notInArray, eq, inArray } from "drizzle-orm";

async function main() {
  const sql = neon(process.env.POSTGRES_URL!);
  const db = drizzle(sql);

  // Get the 3 most recent opportunities
  const keep = await db
    .select({ id: opportunities.id })
    .from(opportunities)
    .orderBy(desc(opportunities.createdAt))
    .limit(3);

  const keepIds = keep.map((r) => r.id);
  console.log(`Keeping ${keepIds.length} opportunities:`, keepIds);

  if (keepIds.length === 0) {
    console.log("No opportunities found — nothing to trim.");
    return;
  }

  // Find opportunities to delete
  const toDelete = await db
    .select({ id: opportunities.id })
    .from(opportunities)
    .where(notInArray(opportunities.id, keepIds));

  const deleteIds = toDelete.map((r) => r.id);
  console.log(`Deleting ${deleteIds.length} opportunities...`);

  if (deleteIds.length === 0) {
    console.log("Nothing to delete.");
    return;
  }

  // Delete associated leads and lead shares
  const associatedLeads = await db
    .select({ id: leads.id })
    .from(leads)
    .where(inArray(leads.opportunityId, deleteIds));

  const leadIds = associatedLeads.map((r) => r.id);
  if (leadIds.length > 0) {
    // Delete lead shares first (FK constraint)
    for (const lid of leadIds) {
      await db.delete(leadShares).where(eq(leadShares.leadId, lid));
    }
    await db.delete(leads).where(inArray(leads.id, leadIds));
    console.log(`Deleted ${leadIds.length} associated leads and their shares.`);
  }

  // Delete the opportunities
  await db.delete(opportunities).where(inArray(opportunities.id, deleteIds));
  console.log(`Deleted ${deleteIds.length} opportunities. ${keepIds.length} remain.`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
