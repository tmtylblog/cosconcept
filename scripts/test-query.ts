import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

async function main() {
  const { neo4jRead } = await import("../src/lib/neo4j");
  const neo4j = await import("neo4j-driver");

  console.log("Testing Organization query...");
  try {
    const r = await neo4jRead(`
      MATCH (o:Organization)
      OPTIONAL MATCH (o)-[:IN_CATEGORY]->(c:Category)
      OPTIONAL MATCH (o)-[:OPERATES_IN_INDUSTRY]->(i:Industry)
      OPTIONAL MATCH (o)-[:LOCATED_IN]->(m:Market)
      RETURN coalesce(o.legacyId, o.name) AS id,
             o.name AS name,
             o.website AS website,
             o.about AS description,
             o.employees AS employeeCount,
             null AS foundedYear,
             COLLECT(DISTINCT c.name) AS categories,
             COLLECT(DISTINCT i.name) AS industries,
             COLLECT(DISTINCT m.name) AS markets,
             null AS firmType,
             'legacy' AS source,
             o.isLegacy AS isLegacy,
             o.isCollectiveOSCustomer AS isCustomer
      ORDER BY o.name ASC
      SKIP $skip LIMIT $lim
    `, { skip: neo4j.default.int(0), lim: neo4j.default.int(3) });
    console.log("OK, got", r.length, "results");
    for (const row of r) {
      console.log(`  ${(row as any).name} | industries: ${(row as any).industries} | customer: ${(row as any).isCustomer}`);
    }
  } catch (e: any) {
    console.error("FAILED:", e.message);
  }

  process.exit(0);
}
main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
