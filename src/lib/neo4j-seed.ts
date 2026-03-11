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

// ─── Track A: New Seed Functions ─────────────────────────

async function seedFirmCategories(): Promise<number> {
  const categories = getFirmCategories();

  // Merge as FirmCategory nodes (same data as Category, new label)
  const items = categories.map((c) => ({
    name: c.name,
    props: {
      definition: c.definition,
      theme: c.theme,
      sampleOrgs: c.sampleOrgs.join(", "),
    },
  }));
  const count = await batchMerge("FirmCategory", items);

  // Also add FirmCategory label to existing Category nodes for dual-label support
  await neo4jWrite(`MATCH (n:Category) SET n:FirmCategory`);

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
  const techCategories = [
    { name: "CRM", slug: "crm", description: "Customer relationship management platforms" },
    { name: "Marketing Automation", slug: "marketing_automation", description: "Marketing automation and campaign platforms" },
    { name: "E-Commerce", slug: "ecommerce", description: "E-commerce platforms and storefronts" },
    { name: "Analytics & BI", slug: "analytics", description: "Analytics, business intelligence, and reporting tools" },
    { name: "Project Management", slug: "project_management", description: "Project and work management platforms" },
    { name: "Developer Tools", slug: "developer_tools", description: "Developer tooling, IDEs, and code platforms" },
    { name: "Cloud Infrastructure", slug: "cloud_infrastructure", description: "Cloud platforms and infrastructure services" },
    { name: "Communication & Collaboration", slug: "communication", description: "Team communication and collaboration tools" },
    { name: "Design & Creative", slug: "design", description: "Design, creative, and prototyping tools" },
    { name: "Payments & Fintech", slug: "payments", description: "Payment processing and financial technology platforms" },
    { name: "Customer Support", slug: "customer_support", description: "Customer support and helpdesk platforms" },
    { name: "Data Integration & ETL", slug: "data_integration", description: "Data integration, ETL, and pipeline tools" },
    { name: "Other", slug: "other", description: "Other technology platforms and tools" },
  ];

  const items = techCategories.map((tc) => ({
    name: tc.name,
    props: { slug: tc.slug, description: tc.description },
  }));
  return batchMerge("TechCategory", items);
}

async function seedDeliveryModels(): Promise<number> {
  const deliveryModels = [
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

  const items = deliveryModels.map((dm) => ({
    name: dm.name,
    props: { description: dm.description },
  }));
  const count = await batchMerge("DeliveryModel", items);

  // Also add DeliveryModel label to existing FirmType nodes for dual-label support
  await neo4jWrite(`MATCH (n:FirmType) SET n:DeliveryModel`);

  return count;
}

async function seedServiceCategories(): Promise<number> {
  const serviceCategories = [
    { name: "Strategy & Advisory", description: "Strategic planning, advisory, and positioning services" },
    { name: "Marketing & Growth", description: "Marketing, demand generation, and growth services" },
    { name: "Technology & Engineering", description: "Software development, infrastructure, and engineering services" },
    { name: "Design & Creative", description: "Brand design, UX, and creative production services" },
    { name: "Sales & Revenue", description: "Sales enablement, revenue operations, and CRM services" },
    { name: "Operations & Finance", description: "Financial management, process optimization, and operations services" },
    { name: "People & Talent", description: "HR, talent acquisition, and people operations services" },
    { name: "Data & Analytics", description: "Data strategy, BI, and analytics services" },
  ];

  const items = serviceCategories.map((sc) => ({
    name: sc.name,
    props: { description: sc.description },
  }));
  return batchMerge("ServiceCategory", items);
}

async function seedServices(): Promise<number> {
  const servicesByCat: Record<string, string[]> = {
    "Strategy & Advisory": [
      "Go-to-Market Strategy", "Business Strategy", "Brand Positioning",
      "Market Research", "Competitive Analysis", "Product Strategy", "Partnership Strategy",
    ],
    "Marketing & Growth": [
      "Content Marketing", "Demand Generation", "SEO & SEM", "Social Media Marketing",
      "Email Marketing", "Performance Marketing", "Marketing Operations", "Account-Based Marketing",
    ],
    "Technology & Engineering": [
      "Software Development", "Web Development", "Mobile Development", "DevOps & Infrastructure",
      "System Integration", "API Development", "Data Engineering", "QA & Testing",
    ],
    "Design & Creative": [
      "Brand Identity Design", "UI/UX Design", "Graphic Design", "Motion Design",
      "Copywriting", "Photography & Video", "Design Systems",
    ],
    "Sales & Revenue": [
      "Sales Enablement", "Sales Training", "Revenue Operations", "CRM Implementation",
      "Sales Playbook Development", "Pipeline Management",
    ],
    "Operations & Finance": [
      "Financial Planning & Analysis", "Accounting & Bookkeeping", "Process Optimization",
      "Project Management", "Change Management", "Procurement",
    ],
    "People & Talent": [
      "Talent Acquisition", "HR Strategy", "Learning & Development",
      "Compensation & Benefits", "Culture & Engagement", "Executive Coaching",
    ],
    "Data & Analytics": [
      "Data Strategy", "Business Intelligence", "Data Visualization",
      "Analytics Implementation", "Data Governance", "Machine Learning & AI",
    ],
  };

  let totalCreated = 0;

  for (const [catName, serviceNames] of Object.entries(servicesByCat)) {
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
  const hierarchy: Record<string, string[]> = {
    "Technology": ["SaaS", "Enterprise Software", "Developer Tools", "Cybersecurity", "AI & Machine Learning", "Cloud Computing", "IoT", "AR/VR"],
    "Financial Services": ["FinTech", "Banking", "Insurance", "InsurTech", "WealthTech", "Payments", "RegTech"],
    "Healthcare": ["HealthTech", "Pharmaceuticals", "Biotech", "Medical Devices", "Digital Health", "Mental Health Tech"],
    "E-Commerce & Retail": ["E-Commerce", "Retail", "Consumer Goods", "CPG", "Fashion & Apparel", "Beauty & Cosmetics", "Food & Beverage"],
    "Media & Entertainment": ["Media", "Entertainment", "Gaming", "Sports", "Music", "Video & Streaming"],
    "Education": ["EdTech", "Higher Education", "K-12", "Corporate Training", "Online Learning"],
    "Real Estate & Construction": ["PropTech", "Real Estate", "Construction", "Facilities Management"],
    "Energy & Environment": ["CleanTech", "Renewables", "Energy", "Oil & Gas", "Utilities", "Sustainability"],
    "Transportation & Logistics": ["Logistics & Supply Chain", "Transportation", "Mobility", "Autonomous Vehicles"],
    "Professional Services": ["Management Consulting", "Legal Services", "Accounting", "HR & Recruiting", "Marketing Services", "PR & Communications"],
    "Government & Nonprofit": ["Government", "Public Sector", "Nonprofit", "Social Impact"],
    "Food & Agriculture": ["FoodTech", "Agriculture", "Restaurant Tech"],
    "Manufacturing & Industrial": ["Manufacturing", "Automotive", "Aerospace & Defense", "Industrial IoT"],
    "Travel & Hospitality": ["Travel & Tourism", "Hospitality", "Short-Term Rentals"],
    "Marketing Technology": ["MarTech", "AdTech", "Customer Experience", "Sales Technology"],
  };

  // Create IndustryL1 nodes
  const l1Names = Object.keys(hierarchy);
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
  for (const [l1Name, l2Names] of Object.entries(hierarchy)) {
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
  const regionCountries: Record<string, { name: string; isoCode: string }[]> = {
    "North America": [
      { name: "United States", isoCode: "US" },
      { name: "Canada", isoCode: "CA" },
      { name: "Mexico", isoCode: "MX" },
    ],
    "Latin America": [
      { name: "Brazil", isoCode: "BR" },
      { name: "Argentina", isoCode: "AR" },
      { name: "Colombia", isoCode: "CO" },
      { name: "Chile", isoCode: "CL" },
      { name: "Peru", isoCode: "PE" },
    ],
    "Europe": [
      { name: "United Kingdom", isoCode: "GB" },
      { name: "Germany", isoCode: "DE" },
      { name: "France", isoCode: "FR" },
      { name: "Netherlands", isoCode: "NL" },
      { name: "Sweden", isoCode: "SE" },
      { name: "Spain", isoCode: "ES" },
      { name: "Italy", isoCode: "IT" },
      { name: "Switzerland", isoCode: "CH" },
      { name: "Belgium", isoCode: "BE" },
      { name: "Denmark", isoCode: "DK" },
      { name: "Norway", isoCode: "NO" },
      { name: "Finland", isoCode: "FI" },
      { name: "Austria", isoCode: "AT" },
      { name: "Portugal", isoCode: "PT" },
      { name: "Ireland", isoCode: "IE" },
      { name: "Poland", isoCode: "PL" },
    ],
    "Asia Pacific": [
      { name: "Australia", isoCode: "AU" },
      { name: "Singapore", isoCode: "SG" },
      { name: "Japan", isoCode: "JP" },
      { name: "India", isoCode: "IN" },
      { name: "South Korea", isoCode: "KR" },
      { name: "New Zealand", isoCode: "NZ" },
      { name: "Hong Kong", isoCode: "HK" },
      { name: "China", isoCode: "CN" },
      { name: "Taiwan", isoCode: "TW" },
    ],
    "Middle East & Africa": [
      { name: "United Arab Emirates", isoCode: "AE" },
      { name: "Saudi Arabia", isoCode: "SA" },
      { name: "Israel", isoCode: "IL" },
      { name: "South Africa", isoCode: "ZA" },
      { name: "Nigeria", isoCode: "NG" },
      { name: "Kenya", isoCode: "KE" },
      { name: "Egypt", isoCode: "EG" },
    ],
  };

  // Tag region-level Market nodes with level: "L1"
  const regionNames = Object.keys(regionCountries);
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
  for (const [regionName, countries] of Object.entries(regionCountries)) {
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
