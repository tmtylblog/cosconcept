/**
 * Quick one-off: re-run just the Services migration after fixing OrgService label.
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

import { readFileSync } from "fs";
import { join } from "path";

const BATCH_SIZE = 250;
const LEGACY_DIR = join(process.cwd(), "data", "legacy", "Data Dump (JSON)");

async function main() {
  const { neo4jWrite } = await import("../src/lib/neo4j");
  const raw = readFileSync(
    join(LEGACY_DIR, "Step 3_ Organization Content Data", "organization-services.json"),
    "utf-8"
  );
  const data = JSON.parse(raw);
  const services = data.data.org_service;

  const nodes = services.map((s: any) => ({
    id: s.id,
    name: s.name,
    description: (s.description ?? "").slice(0, 5000),
    tags: s.tags ? s.tags.split(",").map((t: string) => t.trim()).filter(Boolean) : [],
    publishStatus: s.publish_status ?? "draft",
    orgId: s.organisation?.id ?? null,
  }));

  console.log(`Migrating ${nodes.length} org services...`);

  // Create OrgService nodes
  for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
    const batch = nodes.slice(i, i + BATCH_SIZE);
    await neo4jWrite(
      `UNWIND $items AS item
       MERGE (s:OrgService {legacyId: item.id})
       SET s.name = item.name,
           s.description = item.description,
           s.tags = item.tags,
           s.publishStatus = item.publishStatus`,
      { items: batch }
    );
    console.log(`  Nodes: ${Math.min(i + BATCH_SIZE, nodes.length)}/${nodes.length}`);
  }

  // Link to organizations
  const withOrg = nodes.filter((n: any) => n.orgId);
  for (let i = 0; i < withOrg.length; i += BATCH_SIZE) {
    const batch = withOrg.slice(i, i + BATCH_SIZE);
    await neo4jWrite(
      `UNWIND $items AS item
       MATCH (s:OrgService {legacyId: item.id})
       MATCH (o:Organization {legacyId: item.orgId})
       MERGE (s)-[:OWNED_BY]->(o)`,
      { items: batch }
    );
    console.log(`  Edges: ${Math.min(i + BATCH_SIZE, withOrg.length)}/${withOrg.length}`);
  }

  console.log(`Done: ${nodes.length} org services migrated.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
