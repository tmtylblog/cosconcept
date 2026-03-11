import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL!;
const sqlClient = neon(DATABASE_URL);
const db = drizzle(sqlClient);

async function main() {
  // Find chameleon users
  const users = await db.execute(sql`SELECT id, email FROM users WHERE email LIKE '%chameleon%'`);
  console.log("Users:", JSON.stringify(users.rows, null, 2));

  // Find memberships
  for (const u of users.rows) {
    const mems = await db.execute(sql`SELECT user_id, organization_id FROM members WHERE user_id = ${u.id as string}`);
    console.log(`\nMemberships for ${u.email}:`, JSON.stringify(mems.rows, null, 2));

    for (const m of mems.rows) {
      const orgId = m.organization_id as string;
      const firms = await db.execute(sql`SELECT id, organization_id, name FROM service_firms WHERE organization_id = ${orgId}`);
      console.log(`Firms for org ${orgId}:`, JSON.stringify(firms.rows, null, 2));

      for (const f of firms.rows) {
        const firmId = f.id as string;
        const prefs = await db.execute(sql`SELECT preferred_firm_types, preferred_size_bands, preferred_industries, preferred_markets, raw_onboarding_data FROM partner_preferences WHERE firm_id = ${firmId}`);
        console.log(`Partner prefs for firm ${firmId}:`, JSON.stringify(prefs.rows, null, 2));
      }
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
