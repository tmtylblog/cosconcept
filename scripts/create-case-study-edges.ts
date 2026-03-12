/**
 * Create HAS_CASE_STUDY edges: Company:ServiceFirm → CaseStudy
 *
 * Matches on CaseStudy.orgName == Company:ServiceFirm.name
 * Also backfills cs.firmId for forward compatibility.
 *
 * Usage:
 *   npx tsx scripts/create-case-study-edges.ts --dry-run
 *   npx tsx scripts/create-case-study-edges.ts
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

import neo4j, { type Driver } from "neo4j-driver";

const DRY_RUN = process.argv.includes("--dry-run");

const driver: Driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USERNAME!, process.env.NEO4J_PASSWORD!)
);

async function read<T>(cypher: string): Promise<T[]> {
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });
  try { return (await session.run(cypher)).records.map(r => r.toObject() as T); }
  finally { await session.close(); }
}

async function write(cypher: string, params: Record<string, unknown> = {}): Promise<void> {
  const session = driver.session({ defaultAccessMode: neo4j.session.WRITE });
  try { await session.run(cypher, params); }
  finally { await session.close(); }
}

async function cnt(cypher: string): Promise<number> {
  const r = await read<{ n: any }>(cypher);
  const val = r[0]?.n;
  return typeof val === "object" && val !== null ? (val.low ?? val) : (val ?? 0);
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Create HAS_CASE_STUDY edges (Company:ServiceFirm → CaseStudy)");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}\n`);

  await driver.verifyConnectivity();

  // ── Current state ──────────────────────────────────────
  console.log("── Current state ──");
  const totalCaseStudies = await cnt("MATCH (n:CaseStudy) RETURN count(n) AS n");
  const withOrgName = await cnt("MATCH (n:CaseStudy) WHERE n.orgName IS NOT NULL RETURN count(n) AS n");
  const existingEdges = await cnt("MATCH ()-[r:HAS_CASE_STUDY]->() RETURN count(r) AS n");
  console.log(`  CaseStudy total:              ${totalCaseStudies}`);
  console.log(`  CaseStudy with orgName:       ${withOrgName}`);
  console.log(`  HAS_CASE_STUDY edges (before): ${existingEdges}`);

  // ── Preview: which orgNames match a ServiceFirm? ──────
  const matchable = await read<{ orgName: string; firmName: string; csCount: any }>(
    `MATCH (cs:CaseStudy) WHERE cs.orgName IS NOT NULL
     WITH cs.orgName AS orgName, count(cs) AS csCount
     MATCH (f:Company:ServiceFirm {name: orgName})
     RETURN orgName, f.name AS firmName, csCount
     ORDER BY csCount DESC`
  );

  console.log(`\n── Matchable orgs (orgName matches a ServiceFirm) ──`);
  let totalMatchable = 0;
  for (const r of matchable) {
    const c = typeof r.csCount === "object" ? r.csCount.low : r.csCount;
    totalMatchable += c;
    console.log(`  "${r.orgName}" → ${c} case studies`);
  }
  console.log(`  Total matchable case studies: ${totalMatchable}`);

  // ── Unmatched orgs ─────────────────────────────────────
  const unmatched = await read<{ orgName: string; csCount: any }>(
    `MATCH (cs:CaseStudy) WHERE cs.orgName IS NOT NULL
     WITH cs.orgName AS orgName, count(cs) AS csCount
     WHERE NOT EXISTS { MATCH (f:Company:ServiceFirm {name: orgName}) }
     RETURN orgName, csCount ORDER BY csCount DESC`
  );

  if (unmatched.length > 0) {
    console.log(`\n── Unmatched orgs (no ServiceFirm with this name) ──`);
    for (const r of unmatched) {
      const c = typeof r.csCount === "object" ? r.csCount.low : r.csCount;
      console.log(`  "${r.orgName}" → ${c} case studies (no match)`);
    }
  }

  if (DRY_RUN) {
    console.log("\n✓ Dry run complete — no changes made.");
    await driver.close();
    return;
  }

  // ── Create HAS_CASE_STUDY edges ────────────────────────
  console.log("\n── Creating HAS_CASE_STUDY edges ──");
  await write(
    `MATCH (cs:CaseStudy) WHERE cs.orgName IS NOT NULL
     MATCH (f:Company:ServiceFirm {name: cs.orgName})
     MERGE (f)-[:HAS_CASE_STUDY]->(cs)
     SET cs.firmId = f.id`
  );

  // ── Final state ────────────────────────────────────────
  const finalEdges = await cnt("MATCH ()-[r:HAS_CASE_STUDY]->() RETURN count(r) AS n");
  const withFirmId = await cnt("MATCH (n:CaseStudy) WHERE n.firmId IS NOT NULL RETURN count(n) AS n");
  console.log(`  ✓ HAS_CASE_STUDY edges created: ${finalEdges - existingEdges}`);
  console.log(`  ✓ HAS_CASE_STUDY total:         ${finalEdges}`);
  console.log(`  ✓ CaseStudy nodes with firmId:  ${withFirmId}`);

  await driver.close();
  console.log("\n✓ Done.");
}

main().catch(err => { console.error("Fatal:", err); driver.close(); process.exit(1); });
