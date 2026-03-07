/**
 * Graph Writer — writes enrichment results to the Neo4j knowledge graph.
 *
 * After enrichment (PDL + Jina + AI Classifier) completes for a firm,
 * this module creates/updates all the graph nodes and edges:
 *
 * ServiceFirm → IN_CATEGORY → Category
 * ServiceFirm → HAS_SKILL → Skill
 * ServiceFirm → OPERATES_IN → Market
 * ServiceFirm → SPEAKS → Language
 * ServiceFirm → SERVES_INDUSTRY → Industry
 * ServiceFirm → OFFERS_SERVICE → Service
 * ServiceFirm → HAS_CASE_STUDY → CaseStudy
 * ServiceFirm → EMPLOYS → Expert
 * CaseStudy → DEMONSTRATES_SKILL → Skill
 * CaseStudy → FOR_CLIENT → Client
 * CaseStudy → IN_INDUSTRY → Industry
 */

import { neo4jWrite } from "../neo4j";
import type { FirmClassification } from "./ai-classifier";
import type { FirmGroundTruth } from "./jina-scraper";
import type { PdlCompany } from "./pdl";

// ─── Types ────────────────────────────────────────────────

export interface GraphFirmData {
  /** PostgreSQL firm ID */
  firmId: string;
  /** Organization ID from auth */
  organizationId: string;
  /** Firm name */
  name: string;
  /** Website URL */
  website?: string;
  /** Description/about */
  description?: string;
  /** Founded year */
  foundedYear?: number;
  /** Employee count */
  employeeCount?: number;
  /** PDL enrichment data */
  pdl?: PdlCompany | null;
  /** Jina scrape results */
  groundTruth?: FirmGroundTruth | null;
  /** AI classification results */
  classification?: FirmClassification | null;
}

export interface GraphWriteResult {
  firmNode: boolean;
  categories: number;
  skills: number;
  industries: number;
  markets: number;
  languages: number;
  services: number;
  clients: number;
  teamMembers: number;
  caseStudyUrls: number;
  errors: string[];
}

// ─── Main Writer ──────────────────────────────────────────

/**
 * Write all enrichment data for a firm to the Neo4j knowledge graph.
 * Uses MERGE (upsert) — safe to call multiple times.
 */
export async function writeFirmToGraph(
  data: GraphFirmData
): Promise<GraphWriteResult> {
  const result: GraphWriteResult = {
    firmNode: false,
    categories: 0,
    skills: 0,
    industries: 0,
    markets: 0,
    languages: 0,
    services: 0,
    clients: 0,
    teamMembers: 0,
    caseStudyUrls: 0,
    errors: [],
  };

  const safe = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[GraphWriter] ${label} failed: ${msg}`);
      result.errors.push(`${label}: ${msg}`);
    }
  };

  // 1. Create/update ServiceFirm node
  await safe("ServiceFirm", async () => {
    await neo4jWrite(
      `MERGE (f:ServiceFirm {id: $id})
       SET f.name = $name,
           f.organizationId = $orgId,
           f.website = $website,
           f.description = $description,
           f.foundedYear = $foundedYear,
           f.employeeCount = $employeeCount,
           f.pdlIndustry = $pdlIndustry,
           f.pdlHeadline = $pdlHeadline,
           f.pdlLocation = $pdlLocation,
           f.classifierConfidence = $confidence,
           f.updatedAt = datetime()`,
      {
        id: data.firmId,
        name: data.name,
        orgId: data.organizationId,
        website: data.website ?? null,
        description: data.description ?? data.groundTruth?.extracted.aboutPitch ?? null,
        foundedYear: data.foundedYear ?? data.pdl?.founded ?? null,
        employeeCount: data.employeeCount ?? data.pdl?.employeeCount ?? null,
        pdlIndustry: data.pdl?.industry ?? null,
        pdlHeadline: data.pdl?.headline ?? null,
        pdlLocation: data.pdl?.location?.name ?? null,
        confidence: data.classification?.confidence ?? null,
      }
    );
    result.firmNode = true;
  });

  if (!result.firmNode) return result; // Can't continue without the firm node

  const firmId = data.firmId;
  const cls = data.classification;
  const gt = data.groundTruth;

  // 2. Link to Categories
  if (cls?.categories.length) {
    await safe("Categories", async () => {
      await neo4jWrite(
        `MATCH (f:ServiceFirm {id: $firmId})
         UNWIND $names AS catName
         MERGE (c:Category {name: catName})
         MERGE (f)-[:IN_CATEGORY]->(c)`,
        { firmId, names: cls.categories }
      );
      result.categories = cls.categories.length;
    });
  }

  // 3. Link to Skills (L2 level from classifier)
  if (cls?.skills.length) {
    await safe("Skills", async () => {
      await neo4jWrite(
        `MATCH (f:ServiceFirm {id: $firmId})
         UNWIND $names AS skillName
         MERGE (s:Skill {name: skillName})
         ON CREATE SET s.level = "L2"
         MERGE (f)-[:HAS_SKILL]->(s)`,
        { firmId, names: cls.skills }
      );
      result.skills = cls.skills.length;
    });
  }

  // 4. Link to Industries
  if (cls?.industries.length) {
    await safe("Industries", async () => {
      await neo4jWrite(
        `MATCH (f:ServiceFirm {id: $firmId})
         UNWIND $names AS indName
         MERGE (i:Industry {name: indName})
         MERGE (f)-[:SERVES_INDUSTRY]->(i)`,
        { firmId, names: cls.industries }
      );
      result.industries = cls.industries.length;
    });
  }

  // 5. Link to Markets
  if (cls?.markets.length) {
    await safe("Markets", async () => {
      await neo4jWrite(
        `MATCH (f:ServiceFirm {id: $firmId})
         UNWIND $names AS mktName
         MERGE (m:Market {name: mktName})
         MERGE (f)-[:OPERATES_IN]->(m)`,
        { firmId, names: cls.markets }
      );
      result.markets = cls.markets.length;
    });
  }

  // 6. Link to Languages
  if (cls?.languages.length) {
    await safe("Languages", async () => {
      await neo4jWrite(
        `MATCH (f:ServiceFirm {id: $firmId})
         UNWIND $names AS langName
         MERGE (l:Language {name: langName})
         MERGE (f)-[:SPEAKS]->(l)`,
        { firmId, names: cls.languages }
      );
      result.languages = cls.languages.length;
    });
  }

  // 7. Create Service nodes from extracted services
  if (gt?.extracted.services.length) {
    await safe("Services", async () => {
      await neo4jWrite(
        `MATCH (f:ServiceFirm {id: $firmId})
         UNWIND $names AS svcName
         MERGE (s:Service {name: svcName})
         MERGE (f)-[:OFFERS_SERVICE]->(s)`,
        { firmId, names: gt!.extracted.services }
      );
      result.services = gt!.extracted.services.length;
    });
  }

  // 8. Create Client nodes from extracted clients
  if (gt?.extracted.clients.length) {
    await safe("Clients", async () => {
      await neo4jWrite(
        `MATCH (f:ServiceFirm {id: $firmId})
         UNWIND $names AS clientName
         MERGE (c:Client {name: clientName})
         MERGE (f)-[:HAS_CLIENT]->(c)`,
        { firmId, names: gt!.extracted.clients }
      );
      result.clients = gt!.extracted.clients.length;
    });
  }

  // 9. Create Expert stubs from team members (full enrichment happens later)
  if (gt?.extracted.teamMembers.length) {
    await safe("TeamMembers", async () => {
      const members = gt!.extracted.teamMembers.map((name) => ({
        id: `${firmId}:${name.toLowerCase().replace(/\s+/g, "-")}`,
        fullName: name,
      }));
      await neo4jWrite(
        `MATCH (f:ServiceFirm {id: $firmId})
         UNWIND $members AS m
         MERGE (e:Expert {id: m.id})
         SET e.fullName = m.fullName, e.firmId = $firmId
         MERGE (f)-[:EMPLOYS]->(e)`,
        { firmId, members }
      );
      result.teamMembers = gt!.extracted.teamMembers.length;
    });
  }

  // 10. Store case study URLs for later ingestion
  if (gt?.extracted.caseStudyUrls.length) {
    await safe("CaseStudyUrls", async () => {
      const studies = gt!.extracted.caseStudyUrls.map((url, i) => ({
        id: `${firmId}:cs:${i}`,
        url,
      }));
      await neo4jWrite(
        `MATCH (f:ServiceFirm {id: $firmId})
         UNWIND $studies AS cs
         MERGE (c:CaseStudy {id: cs.id})
         SET c.sourceUrl = cs.url, c.firmId = $firmId, c.status = "pending"
         MERGE (f)-[:HAS_CASE_STUDY]->(c)`,
        { firmId, studies }
      );
      result.caseStudyUrls = gt!.extracted.caseStudyUrls.length;
    });
  }

  console.log(
    `[GraphWriter] Firm ${data.name}: ` +
    `${result.categories} categories, ${result.skills} skills, ` +
    `${result.industries} industries, ${result.markets} markets, ` +
    `${result.services} services, ${result.clients} clients, ` +
    `${result.teamMembers} team, ${result.caseStudyUrls} case studies`
  );

  return result;
}

// ─── Expert Graph Writer ──────────────────────────────────

export interface GraphExpertData {
  expertId: string;
  firmId: string;
  fullName: string;
  headline?: string;
  linkedinUrl?: string;
  location?: string;
  skills?: string[];
  industries?: string[];
}

/**
 * Write expert enrichment data to Neo4j.
 */
export async function writeExpertToGraph(
  data: GraphExpertData
): Promise<{ skills: number; industries: number; errors: string[] }> {
  const errors: string[] = [];

  try {
    // Update expert node
    await neo4jWrite(
      `MERGE (e:Expert {id: $id})
       SET e.fullName = $fullName,
           e.headline = $headline,
           e.linkedinUrl = $linkedinUrl,
           e.location = $location,
           e.firmId = $firmId,
           e.updatedAt = datetime()
       WITH e
       MATCH (f:ServiceFirm {id: $firmId})
       MERGE (f)-[:EMPLOYS]->(e)`,
      {
        id: data.expertId,
        fullName: data.fullName,
        headline: data.headline ?? null,
        linkedinUrl: data.linkedinUrl ?? null,
        location: data.location ?? null,
        firmId: data.firmId,
      }
    );

    // Link skills
    if (data.skills?.length) {
      await neo4jWrite(
        `MATCH (e:Expert {id: $id})
         UNWIND $skills AS skillName
         MERGE (s:Skill {name: skillName})
         MERGE (e)-[:HAS_EXPERTISE]->(s)`,
        { id: data.expertId, skills: data.skills }
      );
    }

    // Link industries
    if (data.industries?.length) {
      await neo4jWrite(
        `MATCH (e:Expert {id: $id})
         UNWIND $industries AS indName
         MERGE (i:Industry {name: indName})
         MERGE (e)-[:SERVES_INDUSTRY]->(i)`,
        { id: data.expertId, industries: data.industries }
      );
    }

    return {
      skills: data.skills?.length ?? 0,
      industries: data.industries?.length ?? 0,
      errors,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);
    return { skills: 0, industries: 0, errors };
  }
}

// ─── Case Study Graph Writer ──────────────────────────────

export interface GraphCaseStudyData {
  caseStudyId: string;
  firmId: string;
  title: string;
  description?: string;
  clientName?: string;
  sourceUrl?: string;
  skills?: string[];
  industries?: string[];
  outcomes?: string[];
}

/**
 * Write a fully ingested case study to Neo4j.
 */
export async function writeCaseStudyToGraph(
  data: GraphCaseStudyData
): Promise<{ skills: number; industries: number; errors: string[] }> {
  const errors: string[] = [];

  try {
    // Create/update case study node
    await neo4jWrite(
      `MERGE (cs:CaseStudy {id: $id})
       SET cs.title = $title,
           cs.description = $description,
           cs.sourceUrl = $sourceUrl,
           cs.firmId = $firmId,
           cs.status = "ingested",
           cs.outcomes = $outcomes,
           cs.updatedAt = datetime()
       WITH cs
       MATCH (f:ServiceFirm {id: $firmId})
       MERGE (f)-[:HAS_CASE_STUDY]->(cs)`,
      {
        id: data.caseStudyId,
        title: data.title,
        description: data.description ?? null,
        sourceUrl: data.sourceUrl ?? null,
        firmId: data.firmId,
        outcomes: data.outcomes ?? [],
      }
    );

    // Link to client
    if (data.clientName) {
      await neo4jWrite(
        `MATCH (cs:CaseStudy {id: $id})
         MERGE (c:Client {name: $clientName})
         MERGE (cs)-[:FOR_CLIENT]->(c)`,
        { id: data.caseStudyId, clientName: data.clientName }
      );
    }

    // Link skills
    if (data.skills?.length) {
      await neo4jWrite(
        `MATCH (cs:CaseStudy {id: $id})
         UNWIND $skills AS skillName
         MERGE (s:Skill {name: skillName})
         MERGE (cs)-[:DEMONSTRATES_SKILL]->(s)`,
        { id: data.caseStudyId, skills: data.skills }
      );
    }

    // Link industries
    if (data.industries?.length) {
      await neo4jWrite(
        `MATCH (cs:CaseStudy {id: $id})
         UNWIND $industries AS indName
         MERGE (i:Industry {name: indName})
         MERGE (cs)-[:IN_INDUSTRY]->(i)`,
        { id: data.caseStudyId, industries: data.industries }
      );
    }

    return {
      skills: data.skills?.length ?? 0,
      industries: data.industries?.length ?? 0,
      errors,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);
    return { skills: 0, industries: 0, errors };
  }
}
