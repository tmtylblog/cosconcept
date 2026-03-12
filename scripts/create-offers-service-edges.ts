/**
 * Create OFFERS_SERVICE edges: Company:ServiceFirm → Service
 *
 * Source: data/legacy/Data Dump (JSON)/Step 3_ Organization Content Data/organization-services.json
 *
 * Match path:
 *   org_service.organisation.id  ==  Company.legacyOrgId
 *
 * Service nodes are MERGED by name (unique). Only "published" services are imported.
 * Each service also stores legacyId and description for reference.
 *
 * Usage:
 *   npx tsx scripts/create-offers-service-edges.ts --dry-run
 *   npx tsx scripts/create-offers-service-edges.ts
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

import neo4j, { type Driver } from "neo4j-driver";
import * as fs from "fs";
import * as path from "path";

const DRY_RUN = process.argv.includes("--dry-run");

const DATA_FILE = path.join(
  process.cwd(),
  "data/legacy/Data Dump (JSON)/Step 3_ Organization Content Data/organization-services.json"
);

// Resolve relative to script location if cwd doesn't work
function loadData() {
  // Try cwd-relative first
  if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  // Try script-relative
  const alt = path.join(__dirname, "..", DATA_FILE);
  if (fs.existsSync(alt)) return JSON.parse(fs.readFileSync(alt, "utf8"));
  throw new Error(`Cannot find organization-services.json at: ${DATA_FILE}`);
}

const driver: Driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USERNAME!, process.env.NEO4J_PASSWORD!)
);

async function read<T>(cypher: string, params: Record<string, unknown> = {}): Promise<T[]> {
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });
  try { return (await session.run(cypher, params)).records.map(r => r.toObject() as T); }
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

interface OrgService {
  id: string;
  name: string;
  description: string;
  tags: string;
  publish_status: string;
  organisation: { id: string; organisation_detail: { business_name: string } };
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Create OFFERS_SERVICE edges (Company:ServiceFirm → Service)");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}\n`);

  await driver.verifyConnectivity();

  // ── Load source data ────────────────────────────────────
  const raw = loadData();
  const allServices: OrgService[] = raw.data.org_service;
  const published = allServices.filter(s => s.publish_status === "published");

  console.log("── Source data ──");
  console.log(`  Total org_service records:  ${allServices.length}`);
  console.log(`  Published (to import):      ${published.length}`);
  console.log(`  Draft (skipped):            ${allServices.length - published.length}`);

  // ── Current Neo4j state ─────────────────────────────────
  console.log("\n── Current Neo4j state ──");
  const existingServiceNodes = await cnt("MATCH (n:Service) RETURN count(n) AS n");
  const existingEdges = await cnt("MATCH ()-[r:OFFERS_SERVICE]->() RETURN count(r) AS n");
  console.log(`  Service nodes:              ${existingServiceNodes}`);
  console.log(`  OFFERS_SERVICE edges:       ${existingEdges}`);

  // ── Build lookup: legacyOrgId → firm name ──────────────
  const firmLookup = await read<{ orgId: string; firmName: string }>(
    "MATCH (f:Company:ServiceFirm) WHERE f.legacyOrgId IS NOT NULL RETURN f.legacyOrgId AS orgId, f.name AS firmName"
  );
  const firmsByLegacyId = new Map(firmLookup.map(r => [r.orgId, r.firmName]));
  console.log(`\n  ServiceFirm nodes with legacyOrgId: ${firmsByLegacyId.size}`);

  // ── Analyze matchability ────────────────────────────────
  const matchable: OrgService[] = [];
  const unmatchedOrgs = new Map<string, { name: string; count: number }>();

  for (const svc of published) {
    const orgId = svc.organisation.id;
    if (firmsByLegacyId.has(orgId)) {
      matchable.push(svc);
    } else {
      const bizName = svc.organisation.organisation_detail.business_name;
      const existing = unmatchedOrgs.get(orgId);
      unmatchedOrgs.set(orgId, { name: bizName, count: (existing?.count ?? 0) + 1 });
    }
  }

  console.log(`\n── Match analysis (published only) ──`);
  console.log(`  Matchable services (legacyOrgId found): ${matchable.length}`);
  console.log(`  Unmatched orgs:                         ${unmatchedOrgs.size}`);
  console.log(`  Services from unmatched orgs:           ${published.length - matchable.length}`);

  // Show top unmatched orgs
  if (unmatchedOrgs.size > 0) {
    const sorted = [...unmatchedOrgs.values()].sort((a, b) => b.count - a.count).slice(0, 15);
    console.log("\n── Top unmatched orgs (no Company:ServiceFirm with this legacyOrgId) ──");
    for (const { name, count } of sorted) {
      console.log(`  "${name}" → ${count} services`);
    }
    if (unmatchedOrgs.size > 15) console.log(`  ... and ${unmatchedOrgs.size - 15} more orgs`);
  }

  // Show unique service names being imported
  const uniqueServiceNames = new Set(matchable.map(s => s.name));
  console.log(`\n  Unique Service node names to create/merge: ${uniqueServiceNames.size}`);

  if (DRY_RUN) {
    // Preview by firm
    const byOrg = new Map<string, number>();
    for (const svc of matchable) {
      const orgId = svc.organisation.id;
      byOrg.set(orgId, (byOrg.get(orgId) ?? 0) + 1);
    }
    const topFirms = [...byOrg.entries()]
      .map(([id, cnt]) => ({ name: firmsByLegacyId.get(id)!, count: cnt }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
    console.log("\n── Top firms by service count (preview) ──");
    for (const { name, count } of topFirms) {
      console.log(`  ${name}: ${count} services`);
    }
    console.log("\n✓ Dry run complete — no changes made.");
    await driver.close();
    return;
  }

  // ── Ensure Service constraint exists ───────────────────
  console.log("\n── Ensuring Service node constraint ──");
  try {
    await write("CREATE CONSTRAINT service_name IF NOT EXISTS FOR (n:Service) REQUIRE n.name IS UNIQUE");
    console.log("  ✓ service_name constraint ensured");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("already exists") || msg.includes("equivalent")) {
      console.log("  ✓ service_name constraint already exists");
    } else {
      console.error("  ✗ Constraint error:", msg);
    }
  }

  // ── Batch import ────────────────────────────────────────
  console.log("\n── Creating Service nodes and OFFERS_SERVICE edges ──");
  const BATCH_SIZE = 500;
  let processed = 0;

  for (let i = 0; i < matchable.length; i += BATCH_SIZE) {
    const batch = matchable.slice(i, i + BATCH_SIZE);
    const rows = batch.map(svc => ({
      orgId: svc.organisation.id,
      serviceName: svc.name,
      serviceDesc: svc.description ?? "",
      legacyId: svc.id,
    }));

    await write(
      `UNWIND $rows AS row
       MATCH (f:Company:ServiceFirm {legacyOrgId: row.orgId})
       MERGE (s:Service {name: row.serviceName})
         ON CREATE SET s.description = row.serviceDesc, s.legacyId = row.legacyId
       MERGE (f)-[:OFFERS_SERVICE]->(s)`,
      { rows }
    );

    processed += batch.length;
    process.stdout.write(`  Processed ${processed}/${matchable.length}\r`);
  }
  console.log(`  ✓ Processed ${processed} services`);

  // ── Final state ────────────────────────────────────────
  console.log("\n── Final state ──");
  const finalServiceNodes = await cnt("MATCH (n:Service) RETURN count(n) AS n");
  const finalEdges = await cnt("MATCH ()-[r:OFFERS_SERVICE]->() RETURN count(r) AS n");
  const firmsWithService = await cnt("MATCH (f:Company:ServiceFirm)-[:OFFERS_SERVICE]->() RETURN count(DISTINCT f) AS n");
  console.log(`  Service nodes total:         ${finalServiceNodes} (+${finalServiceNodes - existingServiceNodes})`);
  console.log(`  OFFERS_SERVICE edges total:  ${finalEdges} (+${finalEdges - existingEdges})`);
  console.log(`  Firms with ≥1 service:       ${firmsWithService}`);

  await driver.close();
  console.log("\n✓ Done.");
}

main().catch(err => { console.error("Fatal:", err); driver.close(); process.exit(1); });
