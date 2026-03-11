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
  const enriched = await sql`
    SELECT name, domain, logo_url, description, industry, employee_count_exact, employee_range,
           estimated_revenue, city, state, country, company_type, founded_year,
           linkedin_url, tags, funding_raised, latest_funding_stage, enrichment_sources
    FROM imported_clients
    WHERE enriched_at IS NOT NULL
    LIMIT 3
  `;

  for (const c of enriched) {
    console.log(`\n═══ ${c.name} (${c.domain}) ═══`);
    console.log(`  Logo:        ${c.logo_url}`);
    console.log(`  Description: ${c.description?.substring(0, 120)}...`);
    console.log(`  Industry:    ${c.industry}`);
    console.log(`  Employees:   ${c.employee_count_exact} (${c.employee_range})`);
    console.log(`  Revenue:     ${c.estimated_revenue}`);
    console.log(`  Location:    ${c.city}, ${c.state}, ${c.country}`);
    console.log(`  Type:        ${c.company_type}`);
    console.log(`  Founded:     ${c.founded_year}`);
    console.log(`  LinkedIn:    ${c.linkedin_url}`);
    console.log(`  Funding:     ${c.funding_raised} (${c.latest_funding_stage})`);
    console.log(`  Tags:        ${JSON.stringify(c.tags)?.substring(0, 100)}`);
    console.log(`  Sources:     ${JSON.stringify(c.enrichment_sources)}`);
  }
}
main().catch(console.error);
