import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1).trim()]));
const sql = neon(env.DATABASE_URL);

const pending = await sql`
  SELECT COUNT(*) as cnt, COUNT(*) FILTER (WHERE sf.name NOT LIKE 'Test %') as real_firms
  FROM service_firms sf
  WHERE sf.enrichment_status = 'enriched'
    AND sf.website IS NOT NULL
    AND sf.website NOT LIKE '%example.com%'
    AND NOT EXISTS (
      SELECT 1 FROM firm_case_studies fcs
      WHERE fcs.firm_id = sf.id AND fcs.status = 'active'
    )
`;
console.log("Enriched firms pending case study discovery:", pending[0].cnt);
console.log("Real (non-Test) firms pending:", pending[0].real_firms);

const done = await sql`SELECT COUNT(DISTINCT firm_id) as firms, COUNT(*) as cases FROM firm_case_studies WHERE status='active'`;
console.log("Already done:", done[0].firms, "firms,", done[0].cases, "cases");
