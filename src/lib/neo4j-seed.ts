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
  const l1Names = getSkillL1Names();
  const items = l1Names.map((name) => ({ name, props: { level: "L1" } }));
  return batchMerge("SkillL1", items);
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

  // Create Skill nodes
  let created = 0;
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    await neo4jWrite(
      `UNWIND $items AS item
       MERGE (s:Skill {name: item.name})
       SET s.level = item.props.level, s.l1 = item.props.l1`,
      { items: batch }
    );
    created += batch.length;
  }

  // Create BELONGS_TO edges (L2 → L1)
  await neo4jWrite(
    `UNWIND $items AS item
     MATCH (s:Skill {name: item.name})
     MATCH (l1:SkillL1 {name: item.props.l1})
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
       SET s.level = "L3", s.l2 = item.l2`,
      {
        items: batch.map((s) => ({ l2: s.l2, l3: s.l3 })),
      }
    );

    // Create BELONGS_TO edges (L3 → L2 parent)
    await neo4jWrite(
      `UNWIND $items AS item
       MATCH (child:Skill {name: item.l3})
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
  const firmTypes = [
    { name: "Fractional & Interim", description: "Provides fractional or interim executive leadership" },
    { name: "Staff Augmentation", description: "Supplements client teams with skilled professionals" },
    { name: "Embedded Teams", description: "Places integrated teams within client organizations" },
    { name: "Boutique Agency", description: "Specialized agency with focused expertise" },
    { name: "Project Consulting", description: "Delivers scoped project-based consulting engagements" },
    { name: "Managed Service Provider", description: "Operates ongoing managed services for clients" },
    { name: "Advisory", description: "Provides strategic advisory and guidance" },
    { name: "Global Consulting", description: "Large-scale consulting firm with global reach" },
    { name: "Freelancer Network", description: "Curated network of independent professionals" },
    { name: "Agency Collective", description: "Alliance of agencies collaborating on projects" },
  ];

  const items = firmTypes.map((ft) => ({
    name: ft.name,
    props: { description: ft.description },
  }));
  return batchMerge("FirmType", items);
}

async function seedIndustries(): Promise<number> {
  // Seed common industries — this list grows as enrichment discovers new ones
  const industries = [
    "Technology", "SaaS", "E-commerce", "Financial Services", "Banking",
    "Insurance", "Healthcare", "Pharmaceuticals", "Biotech", "Medical Devices",
    "Retail", "Consumer Goods", "CPG", "Food & Beverage", "Hospitality",
    "Travel & Tourism", "Real Estate", "Construction", "Manufacturing",
    "Automotive", "Aerospace & Defense", "Energy", "Oil & Gas", "Renewables",
    "Utilities", "Telecommunications", "Media & Entertainment", "Gaming",
    "Education", "EdTech", "Government", "Public Sector", "Nonprofit",
    "Legal Services", "Professional Services", "Logistics & Supply Chain",
    "Agriculture", "Mining", "Fashion & Apparel", "Beauty & Cosmetics",
    "Sports & Fitness", "Cannabis", "Crypto & Blockchain", "AI & Machine Learning",
    "Cybersecurity", "Cloud Computing", "FinTech", "HealthTech", "PropTech",
    "FoodTech", "CleanTech", "MarTech", "AdTech", "HRTech", "LegalTech",
    "InsurTech", "RegTech", "WealthTech",
  ];

  const items = industries.map((name) => ({ name }));
  return batchMerge("Industry", items);
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

  const totalNodes =
    categories + skillsL1 + skillsL2 + skillsL3 +
    markets + languages + firmTypes + industries;

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
    totalNodes,
    durationMs,
    errors,
  };
}
