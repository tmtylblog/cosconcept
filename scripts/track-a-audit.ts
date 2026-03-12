import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

import { neo4jRead } from "../src/lib/neo4j";

async function count(cypher: string): Promise<number> {
  const r = await neo4jRead<{ n: { low: number } | number }>(cypher);
  const val = r[0]?.n;
  return typeof val === "object" && val !== null ? (val as { low: number }).low : (val as number) ?? 0;
}

async function main() {
  console.log("=== Track A Full Audit ===\n");

  // ── Track A Canonical Nodes ─────────────────────────────
  console.log("── Track A Canonical Nodes ──");
  const canonical = [
    ["Company (all)",               `MATCH (n:Company) RETURN count(n) AS n`],
    ["Company:ServiceFirm",         `MATCH (n:Company:ServiceFirm) RETURN count(n) AS n`],
    ["Company (client stubs only)", `MATCH (n:Company) WHERE NOT n:ServiceFirm RETURN count(n) AS n`],
    ["Person (all)",                `MATCH (n:Person) RETURN count(n) AS n`],
    ["Person:Expert",               `MATCH (n:Person:Expert) RETURN count(n) AS n`],
    ["Person:Contact",              `MATCH (n:Person:Contact) RETURN count(n) AS n`],
    ["Person:PlatformUser",         `MATCH (n:Person:PlatformUser) RETURN count(n) AS n`],
    ["FirmCategory",                `MATCH (n:FirmCategory) RETURN count(n) AS n`],
    ["TechCategory",                `MATCH (n:TechCategory) RETURN count(n) AS n`],
    ["DeliveryModel",               `MATCH (n:DeliveryModel) RETURN count(n) AS n`],
    ["ServiceCategory",             `MATCH (n:ServiceCategory) RETURN count(n) AS n`],
    ["Service",                     `MATCH (n:Service) RETURN count(n) AS n`],
    ["Skill (all)",                 `MATCH (n:Skill) RETURN count(n) AS n`],
    ["Skill L1 (level=L1)",         `MATCH (n:Skill {level:'L1'}) RETURN count(n) AS n`],
    ["Skill L2 (level=L2)",         `MATCH (n:Skill {level:'L2'}) RETURN count(n) AS n`],
    ["Skill L3 (level=L3)",         `MATCH (n:Skill {level:'L3'}) RETURN count(n) AS n`],
    ["SkillL1 (separate label)",    `MATCH (n:SkillL1) RETURN count(n) AS n`],
    ["Industry",                    `MATCH (n:Industry) RETURN count(n) AS n`],
    ["IndustryL1",                  `MATCH (n:IndustryL1) RETURN count(n) AS n`],
    ["Market",                      `MATCH (n:Market) RETURN count(n) AS n`],
    ["Language",                    `MATCH (n:Language) RETURN count(n) AS n`],
    ["CaseStudy",                   `MATCH (n:CaseStudy) RETURN count(n) AS n`],
    ["WorkHistory",                 `MATCH (n:WorkHistory) RETURN count(n) AS n`],
    ["SpecialistProfile",           `MATCH (n:SpecialistProfile) RETURN count(n) AS n`],
  ];

  for (const [label, q] of canonical) {
    const n = await count(q);
    const status = n > 0 ? "✓" : "✗";
    console.log(`  ${status} ${label}: ${n.toLocaleString()}`);
  }

  // ── Legacy Nodes That Should Be Cleaned Up ──────────────
  console.log("\n── Legacy Nodes (need migration/cleanup) ──");
  const legacy = [
    ["Organization (legacy firms)",    `MATCH (n:Organization) RETURN count(n) AS n`],
    ["LegacySkill",                    `MATCH (n:LegacySkill) RETURN count(n) AS n`],
    ["SkillL1 w/ legacyId (polluted)", `MATCH (n:SkillL1) WHERE n.legacyId IS NOT NULL AND n.level <> 'L1' RETURN count(n) AS n`],
    ["ProfessionalService",            `MATCH (n:ProfessionalService) RETURN count(n) AS n`],
    ["OrgService",                     `MATCH (n:OrgService) RETURN count(n) AS n`],
    ["Category (old label)",           `MATCH (n:Category) RETURN count(n) AS n`],
    ["FirmType (old label)",           `MATCH (n:FirmType) RETURN count(n) AS n`],
  ];

  for (const [label, q] of legacy) {
    const n = await count(q);
    const status = n > 0 ? "⚠" : "✓";
    console.log(`  ${status} ${label}: ${n.toLocaleString()}`);
  }

  // ── Edge Type Audit ─────────────────────────────────────
  console.log("\n── Track A Canonical Edges ──");
  const edges = [
    ["CURRENTLY_AT (Person→ServiceFirm)",  `MATCH ()-[r:CURRENTLY_AT]->() RETURN count(r) AS n`],
    ["WORKS_AT (Contact→Company)",         `MATCH ()-[r:WORKS_AT]->() RETURN count(r) AS n`],
    ["IN_CATEGORY (Firm→FirmCategory)",    `MATCH ()-[r:IN_CATEGORY]->() RETURN count(r) AS n`],
    ["HAS_SKILL (Firm/Person→Skill)",      `MATCH ()-[r:HAS_SKILL]->() RETURN count(r) AS n`],
    ["SERVES_INDUSTRY",                    `MATCH ()-[r:SERVES_INDUSTRY]->() RETURN count(r) AS n`],
    ["OPERATES_IN",                        `MATCH ()-[r:OPERATES_IN]->() RETURN count(r) AS n`],
    ["OFFERS_SERVICE",                     `MATCH ()-[r:OFFERS_SERVICE]->() RETURN count(r) AS n`],
    ["HAS_CASE_STUDY",                     `MATCH ()-[r:HAS_CASE_STUDY]->() RETURN count(r) AS n`],
    ["DEMONSTRATES_SKILL",                 `MATCH ()-[r:DEMONSTRATES_SKILL]->() RETURN count(r) AS n`],
    ["FOR_CLIENT",                         `MATCH ()-[r:FOR_CLIENT]->() RETURN count(r) AS n`],
    ["PARTNERS_WITH",                      `MATCH ()-[r:PARTNERS_WITH]->() RETURN count(r) AS n`],
    ["BELONGS_TO (skill hierarchy)",       `MATCH ()-[r:BELONGS_TO]->() RETURN count(r) AS n`],
    ["WORKED_WITH (Company→Company)",      `MATCH ()-[r:WORKED_WITH]->() RETURN count(r) AS n`],
  ];

  console.log("  Track A:");
  for (const [label, q] of edges) {
    const n = await count(q);
    const status = n > 0 ? "✓" : "✗";
    console.log(`  ${status} ${label}: ${n.toLocaleString()}`);
  }

  const legacyEdges = [
    ["EMPLOYS (old)",                `MATCH ()-[r:EMPLOYS]->() RETURN count(r) AS n`],
    ["HAS_EXPERTISE (old)",          `MATCH ()-[r:HAS_EXPERTISE]->() RETURN count(r) AS n`],
    ["OPERATES_IN_INDUSTRY (old)",   `MATCH ()-[r:OPERATES_IN_INDUSTRY]->() RETURN count(r) AS n`],
    ["LOCATED_IN (old)",             `MATCH ()-[r:LOCATED_IN]->() RETURN count(r) AS n`],
    ["HAS_INDUSTRY_EXPERIENCE (old)",`MATCH ()-[r:HAS_INDUSTRY_EXPERIENCE]->() RETURN count(r) AS n`],
    ["HAS_MARKET_EXPERIENCE (old)",  `MATCH ()-[r:HAS_MARKET_EXPERIENCE]->() RETURN count(r) AS n`],
    ["BELONGS_TO_INDUSTRY (old)",    `MATCH ()-[r:BELONGS_TO_INDUSTRY]->() RETURN count(r) AS n`],
  ];

  console.log("\n  Legacy edges (still exist):");
  for (const [label, q] of legacyEdges) {
    const n = await count(q);
    if (n > 0) console.log(`  ⚠ ${label}: ${n.toLocaleString()}`);
  }

  // ── Totals ──────────────────────────────────────────────
  const totalNodes = await count(`MATCH (n) RETURN count(n) AS n`);
  const totalRels = await count(`MATCH ()-[r]->() RETURN count(r) AS n`);
  console.log(`\n── Totals ──`);
  console.log(`  Nodes: ${totalNodes.toLocaleString()}`);
  console.log(`  Edges: ${totalRels.toLocaleString()}`);

  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
