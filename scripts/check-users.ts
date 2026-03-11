import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";

const sqlClient = neon(process.env.DATABASE_URL!);
const db = drizzle(sqlClient);

async function main() {
  const users = await db.execute(sql`SELECT id, name, email, created_at FROM users ORDER BY created_at`);
  console.log("All users:");
  for (const u of users.rows) {
    console.log(`  ${u.id} | ${u.email} | ${u.name} | ${u.created_at}`);
  }

  const members = await db.execute(sql`SELECT user_id, organization_id, role FROM members`);
  console.log("\nAll memberships:");
  for (const m of members.rows) {
    console.log(`  user=${m.user_id} | org=${m.organization_id} | role=${m.role}`);
  }

  const accounts = await db.execute(sql`SELECT user_id, provider_id, account_id FROM accounts`);
  console.log("\nAll accounts (auth providers):");
  for (const a of accounts.rows) {
    console.log(`  user=${a.user_id} | provider=${a.provider_id} | account=${a.account_id}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
