import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1).trim()]));
const sql = neon(env.DATABASE_URL);

const [firms, services, cases, experts] = await Promise.all([
  sql`SELECT COUNT(*) as total,
    COUNT(*) FILTER (WHERE enrichment_status='enriched') as enriched
  FROM service_firms`,

  sql`SELECT
    (SELECT COUNT(DISTINCT sf.id) FROM service_firms sf WHERE sf.enrichment_status='enriched'
      AND EXISTS (SELECT 1 FROM firm_services fs WHERE fs.firm_id = sf.id)) as with_services,
    (SELECT COUNT(DISTINCT sf.id) FROM service_firms sf WHERE sf.enrichment_status='enriched'
      AND NOT EXISTS (SELECT 1 FROM firm_services fs WHERE fs.firm_id = sf.id)) as missing_services`,

  sql`SELECT
    (SELECT COUNT(DISTINCT sf.id) FROM service_firms sf WHERE sf.enrichment_status='enriched'
      AND EXISTS (SELECT 1 FROM firm_case_studies fcs WHERE fcs.firm_id = sf.id AND fcs.status='active')) as with_cases,
    (SELECT COUNT(DISTINCT sf.id) FROM service_firms sf WHERE sf.enrichment_status='enriched'
      AND NOT EXISTS (SELECT 1 FROM firm_case_studies fcs WHERE fcs.firm_id = sf.id AND fcs.status='active')) as missing_cases`,

  sql`SELECT
    (SELECT COUNT(DISTINCT sf.id) FROM service_firms sf WHERE sf.enrichment_status='enriched'
      AND EXISTS (SELECT 1 FROM expert_profiles ep WHERE ep.firm_id = sf.id)) as with_experts,
    (SELECT COUNT(DISTINCT sf.id) FROM service_firms sf WHERE sf.enrichment_status='enriched'
      AND NOT EXISTS (SELECT 1 FROM expert_profiles ep WHERE ep.firm_id = sf.id)) as missing_experts`,
]);

console.log("=== Enriched Firms Connection Coverage ===");
console.log(`Total enriched firms: ${firms[0].enriched}`);
console.log(`firm_services:      with=${services[0].with_services} | missing=${services[0].missing_services}`);
console.log(`firm_case_studies:  with=${cases[0].with_cases} | missing=${cases[0].missing_cases}`);
console.log(`expert_profiles:    with=${experts[0].with_experts} | missing=${experts[0].missing_experts}`);

// How many need firm_services populated from enrichment_data
const needsServices = await sql`
  SELECT COUNT(DISTINCT sf.id) as cnt
  FROM service_firms sf
  WHERE sf.enrichment_status='enriched'
    AND jsonb_array_length(COALESCE(sf.enrichment_data->'extracted'->'services','[]'::jsonb)) > 0
    AND NOT EXISTS (SELECT 1 FROM firm_services fs WHERE fs.firm_id = sf.id)
`;
console.log(`\nEnriched firms with extracted services but no firm_services rows: ${needsServices[0].cnt}`);
