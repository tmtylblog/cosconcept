import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter(l=>l&&!l.startsWith("#")&&l.includes("=")).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1).trim()]));
const sql = neon(env.DATABASE_URL);

const [firms, embedded, services, cases] = await Promise.all([
  sql`SELECT COUNT(*) FILTER (WHERE enrichment_status='enriched') as enriched, COUNT(*) FILTER (WHERE enrichment_status='partial') as partial FROM service_firms`,
  sql`SELECT COUNT(*) as cnt FROM abstraction_profiles WHERE embedding IS NOT NULL`,
  sql`SELECT COUNT(*) as rows, COUNT(DISTINCT firm_id) as firms FROM firm_services`,
  sql`SELECT COUNT(*) as rows, COUNT(DISTINCT firm_id) as firms FROM firm_case_studies WHERE status='active'`,
]);
console.log("Enriched firms:", firms[0].enriched, "| Partial:", firms[0].partial);
console.log("Embedded abstraction profiles:", embedded[0].cnt);
console.log("firm_services:", services[0].rows, "rows,", services[0].firms, "firms");
console.log("firm_case_studies (active):", cases[0].rows, "rows,", cases[0].firms, "firms");
