/**
 * @deprecated Track A: imported_clients table was truncated.
 * This script will return empty results. Client data now comes
 * from firm_case_studies.auto_tags.clientName.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const stats = await sql`
    SELECT
      COUNT(*)::int as total,
      COUNT(website)::int as has_website,
      COUNT(industry)::int as has_industry,
      COUNT(employee_count)::int as has_employee_count
    FROM imported_clients
  `;
  console.log("Client stats:", JSON.stringify(stats[0], null, 2));

  const samples = await sql`
    SELECT name, website, industry, employee_count
    FROM imported_clients
    WHERE website IS NOT NULL
    LIMIT 5
  `;
  console.log("\nSamples with websites:", JSON.stringify(samples, null, 2));

  const noWeb = await sql`
    SELECT name, industry
    FROM imported_clients
    WHERE website IS NULL
    LIMIT 5
  `;
  console.log("\nWithout websites:", JSON.stringify(noWeb, null, 2));

  // Check legacy_data for hidden domains
  const legacyCheck = await sql`
    SELECT name, legacy_data->>'website' as ld_website, legacy_data->>'domain' as ld_domain
    FROM imported_clients
    WHERE website IS NULL
    AND (legacy_data->>'website' IS NOT NULL OR legacy_data->>'domain' IS NOT NULL)
    LIMIT 5
  `;
  console.log("\nHidden domains in legacy_data:", JSON.stringify(legacyCheck, null, 2));

  // Count how many have domains hidden in legacy_data
  const hiddenCount = await sql`
    SELECT COUNT(*)::int as count
    FROM imported_clients
    WHERE website IS NULL
    AND (legacy_data->>'website' IS NOT NULL OR legacy_data->>'domain' IS NOT NULL)
  `;
  console.log("\nClients with hidden domains:", hiddenCount[0]);
}

main().catch(console.error);
