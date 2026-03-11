/**
 * Neo4j Knowledge Graph — Schema Setup
 *
 * Creates constraints, indexes, and ensures the graph structure
 * is ready for taxonomy data and enrichment results.
 *
 * Node Labels:
 *   Company (multi-label base), ServiceFirm, SolutionPartner,
 *   Person, Expert, WorkHistory,
 *   Skill, SkillL1, Industry, IndustryL1, Market,
 *   CaseStudy, Client, Service, ServiceCategory,
 *   Category, FirmCategory, TechCategory, DeliveryModel,
 *   Language, FirmType
 *
 * Relationship Types:
 *   BELONGS_TO (Skill→SkillL1, Skill→Skill parent, Industry→IndustryL1, Service→ServiceCategory)
 *   IN_CATEGORY (ServiceFirm→Category | FirmCategory)
 *   HAS_SKILL (ServiceFirm→Skill)
 *   OPERATES_IN (ServiceFirm→Market)
 *   SPEAKS (ServiceFirm→Language)
 *   SERVES_INDUSTRY (ServiceFirm→Industry)
 *   OFFERS_SERVICE (ServiceFirm→Service)
 *   HAS_CASE_STUDY (ServiceFirm→CaseStudy)
 *   EMPLOYS (ServiceFirm→Expert | Person)
 *   HAS_EXPERTISE (Expert→Skill)
 *   DEMONSTRATES_SKILL (CaseStudy→Skill)
 *   FOR_CLIENT (CaseStudy→Client | Company)
 *   IN_INDUSTRY (CaseStudy→Industry)
 *   PARTNERS_WITH (Category→Category, FirmCategory→FirmCategory)
 *   IS_FIRM_TYPE (ServiceFirm→FirmType | DeliveryModel)
 *   PARENT_REGION (Market→Market for country→region hierarchy)
 *   WORKED_AT (Person→WorkHistory)
 */

import { neo4jWrite } from "./neo4j";

// ─── Constraints ──────────────────────────────────────────

const CONSTRAINTS = [
  // Unique ID constraints for all node types
  `CREATE CONSTRAINT firm_id IF NOT EXISTS FOR (n:ServiceFirm) REQUIRE n.id IS UNIQUE`,
  `CREATE CONSTRAINT expert_id IF NOT EXISTS FOR (n:Expert) REQUIRE n.id IS UNIQUE`,
  `CREATE CONSTRAINT skill_name IF NOT EXISTS FOR (n:Skill) REQUIRE n.name IS UNIQUE`,
  `CREATE CONSTRAINT skill_l1_name IF NOT EXISTS FOR (n:SkillL1) REQUIRE n.name IS UNIQUE`,
  `CREATE CONSTRAINT industry_name IF NOT EXISTS FOR (n:Industry) REQUIRE n.name IS UNIQUE`,
  `CREATE CONSTRAINT market_name IF NOT EXISTS FOR (n:Market) REQUIRE n.name IS UNIQUE`,
  `CREATE CONSTRAINT case_study_id IF NOT EXISTS FOR (n:CaseStudy) REQUIRE n.id IS UNIQUE`,
  `CREATE CONSTRAINT client_name IF NOT EXISTS FOR (n:Client) REQUIRE n.name IS UNIQUE`,
  `CREATE CONSTRAINT service_name IF NOT EXISTS FOR (n:Service) REQUIRE n.name IS UNIQUE`,
  `CREATE CONSTRAINT category_name IF NOT EXISTS FOR (n:Category) REQUIRE n.name IS UNIQUE`,
  `CREATE CONSTRAINT language_name IF NOT EXISTS FOR (n:Language) REQUIRE n.name IS UNIQUE`,
  `CREATE CONSTRAINT firm_type_name IF NOT EXISTS FOR (n:FirmType) REQUIRE n.name IS UNIQUE`,

  // ── Track A: New node type constraints ───────────────────
  `CREATE CONSTRAINT company_domain IF NOT EXISTS FOR (n:Company) REQUIRE n.domain IS UNIQUE`,
  `CREATE CONSTRAINT person_linkedin IF NOT EXISTS FOR (n:Person) REQUIRE n.linkedinUrl IS UNIQUE`,
  `CREATE CONSTRAINT firm_category_name IF NOT EXISTS FOR (n:FirmCategory) REQUIRE n.name IS UNIQUE`,
  `CREATE CONSTRAINT tech_category_name IF NOT EXISTS FOR (n:TechCategory) REQUIRE n.name IS UNIQUE`,
  `CREATE CONSTRAINT delivery_model_name IF NOT EXISTS FOR (n:DeliveryModel) REQUIRE n.name IS UNIQUE`,
  `CREATE CONSTRAINT service_category_name IF NOT EXISTS FOR (n:ServiceCategory) REQUIRE n.name IS UNIQUE`,
];

// ─── Indexes ──────────────────────────────────────────────

const INDEXES = [
  // Full-text search indexes
  `CREATE FULLTEXT INDEX firm_search IF NOT EXISTS FOR (n:ServiceFirm) ON EACH [n.name, n.description]`,
  `CREATE FULLTEXT INDEX expert_search IF NOT EXISTS FOR (n:Expert) ON EACH [n.fullName, n.headline]`,
  `CREATE FULLTEXT INDEX case_study_search IF NOT EXISTS FOR (n:CaseStudy) ON EACH [n.title, n.description]`,

  // Property indexes for fast lookups
  `CREATE INDEX firm_website IF NOT EXISTS FOR (n:ServiceFirm) ON (n.website)`,
  `CREATE INDEX firm_org_id IF NOT EXISTS FOR (n:ServiceFirm) ON (n.organizationId)`,
  `CREATE INDEX skill_l1 IF NOT EXISTS FOR (n:Skill) ON (n.l1)`,
  `CREATE INDEX skill_level IF NOT EXISTS FOR (n:Skill) ON (n.level)`,
  `CREATE INDEX category_theme IF NOT EXISTS FOR (n:Category) ON (n.theme)`,
  `CREATE INDEX expert_firm IF NOT EXISTS FOR (n:Expert) ON (n.firmId)`,
  `CREATE INDEX case_study_firm IF NOT EXISTS FOR (n:CaseStudy) ON (n.firmId)`,

  // ── Track A: New Company + Person indexes ─────────────────
  `CREATE INDEX company_name IF NOT EXISTS FOR (n:Company) ON (n.name)`,
  `CREATE INDEX company_enrichment_status IF NOT EXISTS FOR (n:Company) ON (n.enrichmentStatus)`,
  `CREATE INDEX company_is_cos_customer IF NOT EXISTS FOR (n:Company) ON (n.isCosCustomer)`,
  `CREATE INDEX person_enrichment_status IF NOT EXISTS FOR (n:Person) ON (n.enrichmentStatus)`,
  `CREATE INDEX work_history_title IF NOT EXISTS FOR (n:WorkHistory) ON (n.title)`,
  `CREATE INDEX work_history_stage IF NOT EXISTS FOR (n:WorkHistory) ON (n.companyStageAtTime)`,
  `CREATE FULLTEXT INDEX company_search IF NOT EXISTS FOR (n:Company) ON EACH [n.name, n.domain]`,
  `CREATE FULLTEXT INDEX person_search IF NOT EXISTS FOR (n:Person) ON EACH [n.firstName, n.lastName, n.headline]`,
];

// ─── Schema Setup ─────────────────────────────────────────

/**
 * Initialize the Neo4j schema: constraints + indexes.
 * Safe to run multiple times (IF NOT EXISTS).
 */
export async function setupNeo4jSchema(): Promise<{
  constraints: number;
  indexes: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let constraintsCreated = 0;
  let indexesCreated = 0;

  // Create constraints
  for (const cypher of CONSTRAINTS) {
    try {
      await neo4jWrite(cypher);
      constraintsCreated++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // "Already exists" is fine — skip
      if (!msg.includes("already exists") && !msg.includes("equivalent")) {
        errors.push(`Constraint failed: ${msg}`);
      } else {
        constraintsCreated++;
      }
    }
  }

  // Create indexes
  for (const cypher of INDEXES) {
    try {
      await neo4jWrite(cypher);
      indexesCreated++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("already exists") && !msg.includes("equivalent")) {
        errors.push(`Index failed: ${msg}`);
      } else {
        indexesCreated++;
      }
    }
  }

  console.log(
    `[Neo4j Schema] ${constraintsCreated} constraints, ${indexesCreated} indexes. ${errors.length} errors.`
  );

  return { constraints: constraintsCreated, indexes: indexesCreated, errors };
}
