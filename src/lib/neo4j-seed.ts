/**
 * Neo4j Taxonomy Seeding — loads reference data into the knowledge graph.
 *
 * Seeds:
 * 1. Categories (30 firm categories with definitions + themes)
 * 2. Skills L1 → L2 hierarchy (247 L2 skills grouped under L1 parents)
 * 3. Skills L2 → L3 hierarchy (18,421 granular skills/tools)
 * 4. Firm Relationships (346 partnership pairings between category types)
 * 5. Markets (200+ countries + regions)
 * 6. Languages (75+ business languages)
 * 7. Firm Types (10 firm delivery models)
 * 8. Industries (common verticals — seeded as initial set, grows with enrichment)
 *
 * Uses MERGE (upsert) so it's safe to run multiple times.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { neo4jWrite } from "./neo4j";
import {
  getFirmCategories,
  getSkillsL1L2,
  getSkillsL2L3,
  getSkillL1Names,
  getMarkets,
  getLanguages,
} from "@/lib/taxonomy";
import {
  FIRM_TYPES,
  TECH_CATEGORIES,
  SERVICE_CATEGORIES,
  SERVICES_BY_CATEGORY,
  INDUSTRY_HIERARCHY,
  MARKET_HIERARCHY,
  BASE_INDUSTRIES,
} from "@/lib/taxonomy-full";

// ─── Firm relationship CSV parser ─────────────────────────

interface FirmRelationship {
  typeA: string;
  typeB: string;
  nature: string;
  direction: string;
  frequency: string;
  revenueModel: string;
}

function loadFirmRelationships(): FirmRelationship[] {
  const filePath = join(process.cwd(), "data", "firm-relationships.csv");
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((l: string) => l.trim());

  return lines.slice(1).map((line: string) => {
    const fields = parseCsvLine(line);
    return {
      typeA: fields[0] ?? "",
      typeB: fields[1] ?? "",
      nature: fields[2] ?? "",
      direction: fields[4] ?? "",
      frequency: fields[5] ?? "",
      revenueModel: fields[6] ?? "",
    };
  });
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

// ─── Batch helpers ────────────────────────────────────────

const BATCH_SIZE = 500;

async function batchMerge(
  label: string,
  items: { name: string; props?: Record<string, unknown> }[]
): Promise<number> {
  let created = 0;
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    await neo4jWrite(
      `UNWIND $items AS item
       MERGE (n:${label} {name: item.name})
       SET n += item.props`,
      {
        items: batch.map((it) => ({
          name: it.name,
          props: it.props ?? {},
        })),
      }
    );
    created += batch.length;
  }
  return created;
}

// ─── Seed Functions ───────────────────────────────────────

async function seedCategories(): Promise<number> {
  const categories = getFirmCategories();
  const items = categories.map((c) => ({
    name: c.name,
    props: {
      definition: c.definition,
      theme: c.theme,
      sampleOrgs: c.sampleOrgs.join(", "),
    },
  }));
  return batchMerge("Category", items);
}

async function seedSkillsL1(): Promise<number> {
  // Single Skill label for all levels — L1 skills are Skill nodes with level="L1"
  const l1Names = getSkillL1Names();
  const items = l1Names.map((name) => ({ name, props: { level: "L1" } }));
  return batchMerge("Skill", items);
}

async function seedSkillsL2(): Promise<number> {
  const skills = getSkillsL1L2();
  // Deduplicate L2 names
  const seen = new Set<string>();
  const items: { name: string; props: Record<string, unknown> }[] = [];

  for (const s of skills) {
    if (!seen.has(s.l2)) {
      seen.add(s.l2);
      items.push({
        name: s.l2,
        props: { level: "L2", l1: s.l1 },
      });
    }
  }

  // Create Skill nodes — never downgrade level (L1 > L2 > L3)
  let created = 0;
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    await neo4jWrite(
      `UNWIND $items AS item
       MERGE (s:Skill {name: item.name})
       SET s.l1 = item.props.l1,
           s.level = CASE WHEN s.level = 'L1' THEN 'L1' ELSE item.props.level END`,
      { items: batch }
    );
    created += batch.length;
  }

  // Create BELONGS_TO edges (L2 → L1) — both are Skill nodes now
  await neo4jWrite(
    `UNWIND $items AS item
     MATCH (s:Skill {name: item.name, level: "L2"})
     MATCH (l1:Skill {name: item.props.l1, level: "L1"})
     MERGE (s)-[:BELONGS_TO]->(l1)`,
    { items }
  );

  return created;
}

async function seedSkillsL3(): Promise<number> {
  const skills = getSkillsL2L3();

  // Batch create L3 Skill nodes and edges
  let created = 0;
  for (let i = 0; i < skills.length; i += BATCH_SIZE) {
    const batch = skills.slice(i, i + BATCH_SIZE);
    await neo4jWrite(
      `UNWIND $items AS item
       MERGE (s:Skill {name: item.l3})
       SET s.l2 = item.l2,
           s.level = CASE WHEN s.level = 'L1' THEN 'L1' WHEN s.level = 'L2' THEN 'L2' ELSE 'L3' END`,
      {
        items: batch.map((s) => ({ l2: s.l2, l3: s.l3 })),
      }
    );

    // Create BELONGS_TO edges (L3 → L2 parent) — only for actual L3 nodes
    await neo4jWrite(
      `UNWIND $items AS item
       MATCH (child:Skill {name: item.l3, level: 'L3'})
       MATCH (parent:Skill {name: item.l2})
       MERGE (child)-[:BELONGS_TO]->(parent)`,
      {
        items: batch.map((s) => ({ l2: s.l2, l3: s.l3 })),
      }
    );

    created += batch.length;
    if (created % 2000 === 0) {
      console.log(`  [Skills L3] ${created}/${skills.length} ...`);
    }
  }

  return created;
}

async function seedFirmRelationships(): Promise<number> {
  const relationships = loadFirmRelationships();

  // First ensure all referenced categories exist as nodes
  const allTypes = new Set<string>();
  for (const r of relationships) {
    if (r.typeA) allTypes.add(r.typeA);
    if (r.typeB) allTypes.add(r.typeB);
  }
  for (const name of allTypes) {
    await neo4jWrite(`MERGE (:Category {name: $name})`, { name });
  }

  // Create PARTNERS_WITH edges
  let created = 0;
  for (let i = 0; i < relationships.length; i += BATCH_SIZE) {
    const batch = relationships.slice(i, i + BATCH_SIZE);
    await neo4jWrite(
      `UNWIND $rels AS r
       MATCH (a:Category {name: r.typeA})
       MATCH (b:Category {name: r.typeB})
       MERGE (a)-[rel:PARTNERS_WITH]->(b)
       SET rel.nature = r.nature,
           rel.direction = r.direction,
           rel.frequency = r.frequency,
           rel.revenueModel = r.revenueModel`,
      { rels: batch }
    );
    created += batch.length;
  }

  return created;
}

async function seedMarkets(): Promise<number> {
  const markets = getMarkets();
  // Tag markets with their region type
  const regionNames = new Set([
    "Global", "North America", "Latin America", "Europe", "EMEA",
    "Asia Pacific", "APAC", "Middle East", "MENA", "Sub-Saharan Africa",
    "Central America", "Caribbean", "Southeast Asia", "ASEAN",
    "Central Asia", "Eastern Europe", "Western Europe", "Nordic",
    "DACH", "Benelux", "Oceania", "South Asia", "East Asia",
    "GCC", "EU", "Commonwealth",
  ]);

  const items = markets.map((name) => ({
    name,
    props: { type: regionNames.has(name) ? "region" : "country" },
  }));
  return batchMerge("Market", items);
}

async function seedLanguages(): Promise<number> {
  const languages = getLanguages();
  const items = languages.map((name) => ({ name }));
  return batchMerge("Language", items);
}

async function seedFirmTypes(): Promise<number> {
  const items = FIRM_TYPES.map((ft) => ({
    name: ft.name,
    props: { description: ft.description },
  }));
  return batchMerge("FirmType", items);
}

async function seedIndustries(): Promise<number> {
  const items = BASE_INDUSTRIES.map((name) => ({ name }));
  return batchMerge("Industry", items);
}

// ─── Track A: New Seed Functions ─────────────────────────

async function seedFirmCategories(): Promise<number> {
  const categories = getFirmCategories();

  // Merge on Category first (finds existing or creates), then add FirmCategory label.
  // Avoids duplicate nodes that would violate the firm_category_name uniqueness constraint.
  const items = categories.map((c) => ({
    name: c.name,
    props: {
      definition: c.definition,
      theme: c.theme,
      sampleOrgs: c.sampleOrgs.join(", "),
    },
  }));

  let count = 0;
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    await neo4jWrite(
      `UNWIND $items AS item
       MERGE (n:Category {name: item.name})
       SET n:FirmCategory,
           n.definition = item.props.definition,
           n.theme = item.props.theme,
           n.sampleOrgs = item.props.sampleOrgs`,
      { items: batch }
    );
    count += batch.length;
  }

  // Mirror PARTNERS_WITH edges from firm-relationships.csv onto FirmCategory nodes
  const relationships = loadFirmRelationships();

  // Ensure all referenced firm categories exist
  const allTypes = new Set<string>();
  for (const r of relationships) {
    if (r.typeA) allTypes.add(r.typeA);
    if (r.typeB) allTypes.add(r.typeB);
  }
  for (const name of allTypes) {
    await neo4jWrite(`MERGE (:FirmCategory {name: $name})`, { name });
  }

  // Create PARTNERS_WITH edges on FirmCategory nodes
  for (let i = 0; i < relationships.length; i += BATCH_SIZE) {
    const batch = relationships.slice(i, i + BATCH_SIZE);
    await neo4jWrite(
      `UNWIND $rels AS r
       MATCH (a:FirmCategory {name: r.typeA})
       MATCH (b:FirmCategory {name: r.typeB})
       MERGE (a)-[rel:PARTNERS_WITH]->(b)
       SET rel.nature = r.nature,
           rel.direction = r.direction,
           rel.frequency = r.frequency,
           rel.revenueModel = r.revenueModel`,
      { rels: batch }
    );
  }

  return count;
}

async function seedTechCategories(): Promise<number> {
  const items = TECH_CATEGORIES.map((tc) => ({
    name: tc.name,
    props: { slug: tc.slug, description: tc.description },
  }));
  return batchMerge("TechCategory", items);
}

async function seedDeliveryModels(): Promise<number> {
  // Same data as FIRM_TYPES — DeliveryModel is a dual label
  const items = FIRM_TYPES.map((dm) => ({
    name: dm.name,
    props: { description: dm.description },
  }));

  let count = 0;
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    await neo4jWrite(
      `UNWIND $items AS item
       MERGE (n:FirmType {name: item.name})
       SET n:DeliveryModel,
           n.description = item.props.description`,
      { items: batch }
    );
    count += batch.length;
  }

  return count;
}

async function seedServiceCategories(): Promise<number> {
  const items = SERVICE_CATEGORIES.map((sc) => ({
    name: sc.name,
    props: { description: sc.description },
  }));
  return batchMerge("ServiceCategory", items);
}

async function seedServices(): Promise<number> {
  let totalCreated = 0;

  for (const [catName, serviceNames] of Object.entries(SERVICES_BY_CATEGORY)) {
    // Merge Service nodes and link to ServiceCategory
    for (let i = 0; i < serviceNames.length; i += BATCH_SIZE) {
      const batch = serviceNames.slice(i, i + BATCH_SIZE);
      await neo4jWrite(
        `UNWIND $items AS item
         MERGE (s:Service {name: item})
         WITH s
         MATCH (sc:ServiceCategory {name: $catName})
         MERGE (s)-[:BELONGS_TO]->(sc)`,
        { items: batch, catName }
      );
      totalCreated += batch.length;
    }
  }

  return totalCreated;
}

async function seedIndustryHierarchy(): Promise<number> {
  // Create IndustryL1 nodes
  const l1Names = Object.keys(INDUSTRY_HIERARCHY);
  for (let i = 0; i < l1Names.length; i += BATCH_SIZE) {
    const batch = l1Names.slice(i, i + BATCH_SIZE);
    await neo4jWrite(
      `UNWIND $items AS name
       MERGE (n:IndustryL1 {name: name})
       SET n.level = "L1"`,
      { items: batch }
    );
  }

  // Update existing Industry nodes with level: "L2" and create BELONGS_TO edges
  let totalL2 = 0;
  for (const [l1Name, l2Names] of Object.entries(INDUSTRY_HIERARCHY)) {
    for (let i = 0; i < l2Names.length; i += BATCH_SIZE) {
      const batch = l2Names.slice(i, i + BATCH_SIZE);
      await neo4jWrite(
        `UNWIND $items AS name
         MERGE (n:Industry {name: name})
         SET n.level = "L2"
         WITH n
         MATCH (l1:IndustryL1 {name: $l1Name})
         MERGE (n)-[:BELONGS_TO]->(l1)`,
        { items: batch, l1Name }
      );
      totalL2 += batch.length;
    }
  }

  return l1Names.length + totalL2;
}

async function seedMarketHierarchy(): Promise<number> {
  // Tag region-level Market nodes with level: "L1"
  const regionNames = Object.keys(MARKET_HIERARCHY);
  for (let i = 0; i < regionNames.length; i += BATCH_SIZE) {
    const batch = regionNames.slice(i, i + BATCH_SIZE);
    await neo4jWrite(
      `UNWIND $items AS name
       MERGE (m:Market {name: name})
       SET m.level = "L1"`,
      { items: batch }
    );
  }

  // Upsert country Market nodes with level: "L2", isoCode, and PARENT_REGION edges
  let totalCountries = 0;
  for (const [regionName, countries] of Object.entries(MARKET_HIERARCHY)) {
    for (let i = 0; i < countries.length; i += BATCH_SIZE) {
      const batch = countries.slice(i, i + BATCH_SIZE);
      await neo4jWrite(
        `UNWIND $items AS item
         MERGE (m:Market {name: item.name})
         SET m.level = "L2", m.isoCode = item.isoCode
         WITH m
         MATCH (r:Market {name: $regionName})
         MERGE (m)-[:PARENT_REGION]->(r)`,
        { items: batch, regionName }
      );
      totalCountries += batch.length;
    }
  }

  return regionNames.length + totalCountries;
}

async function seedCompanyNodes(): Promise<number> {
  // Phase B: Add Company label to all existing ServiceFirm nodes
  await neo4jWrite(
    `MATCH (n:ServiceFirm)
     SET n:Company, n.isCosCustomer = true, n.enrichmentStatus = "enriched"`
  );

  // Migrate existing Client nodes to Company stubs
  await neo4jWrite(
    `MATCH (n:Client)
     WHERE NOT n:Company
     SET n:Company, n.isCosCustomer = false, n.enrichmentStatus = "stub"`
  );

  // Returns 0 — multi-label operations don't produce a meaningful node count
  // (nodes already existed; we only added labels/properties)
  return 0;
}

// ─── Master Seed Function ─────────────────────────────────

export interface SeedResult {
  categories: number;
  skillsL1: number;
  skillsL2: number;
  skillsL3: number;
  firmRelationships: number;
  markets: number;
  languages: number;
  firmTypes: number;
  industries: number;
  // Track A additions
  firmCategories: number;
  techCategories: number;
  deliveryModels: number;
  serviceCategories: number;
  services: number;
  industryHierarchy: number;
  marketHierarchy: number;
  companyNodes: number;
  totalNodes: number;
  durationMs: number;
  errors: string[];
}

/**
 * Seed all taxonomy data into Neo4j.
 * Safe to run multiple times — uses MERGE (upsert).
 */
export async function seedNeo4jTaxonomy(): Promise<SeedResult> {
  const start = Date.now();
  const errors: string[] = [];

  const run = async (
    name: string,
    fn: () => Promise<number>
  ): Promise<number> => {
    try {
      const count = await fn();
      console.log(`[Neo4j Seed] ${name}: ${count} nodes`);
      return count;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Neo4j Seed] ${name} FAILED: ${msg}`);
      errors.push(`${name}: ${msg}`);
      return 0;
    }
  };

  console.log("[Neo4j Seed] Starting taxonomy seed...");

  // Seed in dependency order
  const categories = await run("Categories", seedCategories);
  const skillsL1 = await run("Skills L1", seedSkillsL1);
  const skillsL2 = await run("Skills L2", seedSkillsL2);
  const skillsL3 = await run("Skills L3", seedSkillsL3);
  const firmRelationships = await run("Firm Relationships", seedFirmRelationships);
  const markets = await run("Markets", seedMarkets);
  const languages = await run("Languages", seedLanguages);
  const firmTypes = await run("Firm Types", seedFirmTypes);
  const industries = await run("Industries", seedIndustries);

  // Track A: new taxonomy nodes (run after base seeds they depend on)
  const firmCategories = await run("Firm Categories", seedFirmCategories);
  const techCategories = await run("Tech Categories", seedTechCategories);
  const deliveryModels = await run("Delivery Models", seedDeliveryModels);
  const serviceCategories = await run("Service Categories", seedServiceCategories);
  const services = await run("Services", seedServices);
  const industryHierarchy = await run("Industry Hierarchy", seedIndustryHierarchy);
  const marketHierarchy = await run("Market Hierarchy", seedMarketHierarchy);
  const companyNodes = await run("Company Nodes (Phase B)", seedCompanyNodes);

  const totalNodes =
    categories + skillsL1 + skillsL2 + skillsL3 +
    markets + languages + firmTypes + industries +
    firmCategories + techCategories + deliveryModels +
    serviceCategories + services + industryHierarchy + marketHierarchy;

  const durationMs = Date.now() - start;

  console.log(
    `[Neo4j Seed] Complete: ${totalNodes} nodes, ${firmRelationships} relationships in ${durationMs}ms`
  );

  return {
    categories,
    skillsL1,
    skillsL2,
    skillsL3,
    firmRelationships,
    markets,
    languages,
    firmTypes,
    industries,
    firmCategories,
    techCategories,
    deliveryModels,
    serviceCategories,
    services,
    industryHierarchy,
    marketHierarchy,
    companyNodes,
    totalNodes,
    durationMs,
    errors,
  };
}
