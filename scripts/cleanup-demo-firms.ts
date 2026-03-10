/**
 * Cleanup script: removes all demo firms created by seed-demo-firms.ts.
 * Identifies them by organization name starting with "Test ".
 *
 * Usage:  npx tsx scripts/cleanup-demo-firms.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { like, eq, inArray } from "drizzle-orm";
import {
  organizations,
  serviceFirms,
  partnerPreferences,
  abstractionProfiles,
} from "../src/lib/db/schema";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

async function cleanup() {
  console.log("Cleaning up demo firms (name starts with 'Test ')...\n");

  // 1. Find all test organizations
  const testOrgs = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(like(organizations.name, "Test %"));

  if (testOrgs.length === 0) {
    console.log("No test organizations found. Nothing to clean up.");
    return;
  }

  console.log(`Found ${testOrgs.length} test organizations to remove.`);
  const orgIds = testOrgs.map((o) => o.id);

  // 2. Find related service firms
  const testFirms = await db
    .select({ id: serviceFirms.id })
    .from(serviceFirms)
    .where(inArray(serviceFirms.organizationId, orgIds));

  const firmIds = testFirms.map((f) => f.id);
  console.log(`  Found ${firmIds.length} service firms to remove.`);

  // 3. Delete abstraction profiles for these firms
  if (firmIds.length > 0) {
    const absDeleted = await db
      .delete(abstractionProfiles)
      .where(inArray(abstractionProfiles.entityId, firmIds));
    console.log(`  Deleted abstraction profiles`);

    // 4. Delete partner preferences for these firms
    const prefDeleted = await db
      .delete(partnerPreferences)
      .where(inArray(partnerPreferences.firmId, firmIds));
    console.log(`  Deleted partner preferences`);

    // 5. Delete service firms
    const firmDeleted = await db
      .delete(serviceFirms)
      .where(inArray(serviceFirms.id, firmIds));
    console.log(`  Deleted service firms`);
  }

  // 6. Delete organizations (cascade will handle members, subscriptions, invitations)
  const orgDeleted = await db
    .delete(organizations)
    .where(inArray(organizations.id, orgIds));
  console.log(`  Deleted ${testOrgs.length} organizations`);
}

cleanup()
  .then(() => {
    console.log("\nDone! All test firms cleaned up.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Cleanup failed:", err);
    process.exit(1);
  });
