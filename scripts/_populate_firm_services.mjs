/**
 * Populate firm_services from enrichment_data.extracted.services
 * for all enriched firms that don't yet have firm_services rows.
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1).trim()]));
const sql = neon(env.DATABASE_URL);

function uid() {
  return `svc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// Get all enriched firms with extracted services but no firm_services rows
const firms = await sql`
  SELECT sf.id as firm_id, sf.organization_id,
    sf.enrichment_data->'extracted'->'services' as services,
    sf.enrichment_data->'classification'->'categories' as categories
  FROM service_firms sf
  WHERE sf.enrichment_status = 'enriched'
    AND jsonb_array_length(COALESCE(sf.enrichment_data->'extracted'->'services','[]'::jsonb)) > 0
    AND NOT EXISTS (SELECT 1 FROM firm_services fs WHERE fs.firm_id = sf.id)
`;

console.log(`Populating firm_services for ${firms.length} firms...`);

let inserted = 0;
for (const firm of firms) {
  const services = firm.services || [];
  if (!Array.isArray(services) || services.length === 0) continue;

  // Insert each service as a firm_services row
  for (let i = 0; i < services.length; i++) {
    const name = typeof services[i] === "string" ? services[i] : services[i]?.name;
    if (!name || name.length > 200) continue;

    await sql`
      INSERT INTO firm_services (id, firm_id, organization_id, name, display_order, created_at, updated_at)
      VALUES (${uid()}, ${firm.firm_id}, ${firm.organization_id}, ${name}, ${i}, NOW(), NOW())
      ON CONFLICT DO NOTHING
    `;
    inserted++;
  }

  process.stdout.write(`\r  ${inserted} services inserted for ${firms.indexOf(firm) + 1}/${firms.length} firms`);
}

console.log(`\nDone. ${inserted} firm_services rows created.`);

// Verify
const final = await sql`SELECT COUNT(*) as t, COUNT(DISTINCT firm_id) as f FROM firm_services`;
console.log(`firm_services table: ${final[0].t} total rows, ${final[0].f} firms covered`);
