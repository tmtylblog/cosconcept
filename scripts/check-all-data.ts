import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";

const sqlClient = neon(process.env.DATABASE_URL!);
const db = drizzle(sqlClient);

async function main() {
  const orgs = await db.execute(sql`SELECT id, name, slug FROM organizations LIMIT 10`);
  console.log("All orgs:", JSON.stringify(orgs.rows, null, 2));

  const mems = await db.execute(sql`SELECT user_id, organization_id, role FROM members LIMIT 10`);
  console.log("\nAll members:", JSON.stringify(mems.rows, null, 2));

  const firms = await db.execute(sql`SELECT id, organization_id, name, enrichment_status FROM service_firms LIMIT 10`);
  console.log("\nAll firms:", JSON.stringify(firms.rows, null, 2));

  const prefs = await db.execute(sql`SELECT * FROM partner_preferences LIMIT 10`);
  console.log("\nAll partner_preferences:", JSON.stringify(prefs.rows, null, 2));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
