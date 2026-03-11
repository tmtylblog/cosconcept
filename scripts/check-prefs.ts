import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

async function main() {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, "freddie@chameleon.co")).limit(1);
  console.log("User:", user ? { id: user.id, name: user.name, email: user.email } : "NOT FOUND");
  if (!user) return;

  const memberRows = await db
    .select({ orgId: schema.members.organizationId, role: schema.members.role })
    .from(schema.members)
    .where(eq(schema.members.userId, user.id));
  console.log("Memberships:", JSON.stringify(memberRows));

  for (const m of memberRows) {
    const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, m.orgId)).limit(1);
    console.log("Org:", org ? { id: org.id, name: org.name } : "NOT FOUND");

    const firmRows = await db.select().from(schema.serviceFirms).where(eq(schema.serviceFirms.organizationId, m.orgId));
    console.log("Firms:", JSON.stringify(firmRows.map((f) => ({ id: f.id, name: f.name, enrichmentStatus: f.enrichmentStatus }))));

    for (const firm of firmRows) {
      const prefRows = await db.select().from(schema.partnerPreferences).where(eq(schema.partnerPreferences.firmId, firm.id));
      if (prefRows.length === 0) {
        console.log("NO partner preferences found for firm:", firm.id);
      } else {
        for (const p of prefRows) {
          console.log("\n=== Partner Preferences for", firm.id, "===");
          console.log("  preferredFirmTypes:", JSON.stringify(p.preferredFirmTypes));
          console.log("  preferredSizeBands:", JSON.stringify(p.preferredSizeBands));
          console.log("  preferredIndustries:", JSON.stringify(p.preferredIndustries));
          console.log("  preferredMarkets:", JSON.stringify(p.preferredMarkets));
          console.log("  rawOnboardingData:", JSON.stringify(p.rawOnboardingData, null, 2));
        }
      }
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
