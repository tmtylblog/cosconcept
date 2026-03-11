/**
 * Graph Writer — writes enrichment results to the Neo4j knowledge graph.
 *
 * After enrichment (PDL + Jina + AI Classifier) completes for a firm,
 * this module creates/updates all the graph nodes and edges:
 *
 * Track A node/edge types:
 * ServiceFirm → IN_CATEGORY → FirmCategory (was Category)
 * ServiceFirm → HAS_SKILL → Skill
 * ServiceFirm → OPERATES_IN → Market
 * ServiceFirm → SPEAKS → Language
 * ServiceFirm → SERVES_INDUSTRY → Industry
 * ServiceFirm → OFFERS_SERVICE → Service
 * ServiceFirm → HAS_CASE_STUDY → CaseStudy
 * Person → CURRENTLY_AT → ServiceFirm (was Expert→EMPLOYS)
 * CaseStudy → DEMONSTRATES_SKILL → Skill
 * CaseStudy → FOR_CLIENT → Company (was Client)
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
  /** Domain (e.g. chameleon.co) */
  domain?: string;
  /** Logo URL (e.g. Clearbit) */
  logoUrl?: string;
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
  // Track A: ServiceFirm nodes also carry the Company label for canonical identity.
  // SET f:Company applies the dual label idempotently.
  await safe("ServiceFirm", async () => {
    await neo4jWrite(
      `MERGE (f:ServiceFirm {id: $id})
       SET f:Company,
           f.name = $name,
           f.organizationId = $orgId,
           f.website = $website,
           f.domain = $domain,
           f.description = $description,
           f.foundedYear = $foundedYear,
           f.employeeCount = $employeeCount,
           f.pdlIndustry = $pdlIndustry,
           f.pdlHeadline = $pdlHeadline,
           f.pdlLocation = $pdlLocation,
           f.logoUrl = $logoUrl,
           f.classifierConfidence = $confidence,
           f.isCosCustomer = true,
           f.source = "self_registered",
           f.enrichmentStatus = "complete",
           f.updatedAt = datetime()`,
      {
        id: data.firmId,
        name: data.name,
        orgId: data.organizationId,
        website: data.website ?? null,
        domain: data.domain ?? (data.website ? extractDomain(data.website) : null),
        logoUrl: data.logoUrl ?? null,
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

  // 2. Link to FirmCategory (Track A: was Category)
  if (cls?.categories.length) {
    await safe("Categories", async () => {
      await neo4jWrite(
        `MATCH (f:ServiceFirm {id: $firmId})
         UNWIND $names AS catName
         MERGE (c:FirmCategory {name: catName})
         MERGE (f)-[r:IN_CATEGORY]->(c)
         SET r.source = "enrichment", r.confidence = $confidence`,
        { firmId, names: cls.categories, confidence: cls.confidence ?? 0.8 }
      );
      result.categories = cls.categories.length;
    });
  }

  // 3. Link to Skills (L2 level from classifier)
  // Track A: HAS_SKILL carries strength metrics recomputed by skill-compute-strength job.
  // Initial write seeds strength = confidence, evidenceCount = 1; job updates later.
  if (cls?.skills.length) {
    await safe("Skills", async () => {
      await neo4jWrite(
        `MATCH (f:ServiceFirm {id: $firmId})
         UNWIND $names AS skillName
         MERGE (s:Skill {name: skillName})
         ON CREATE SET s.level = "L2"
         MERGE (f)-[r:HAS_SKILL]->(s)
         SET r.source = "enrichment",
             r.confidence = $confidence,
             r.strength = coalesce(r.strength, $confidence),
             r.evidenceCount = coalesce(r.evidenceCount, 1),
             r.caseStudyCount = coalesce(r.caseStudyCount, 0),
             r.expertCount = coalesce(r.expertCount, 0),
             r.serviceCount = coalesce(r.serviceCount, 0),
             r.lastComputedAt = coalesce(r.lastComputedAt, datetime())`,
        { firmId, names: cls.skills, confidence: cls.confidence ?? 0.8 }
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
         MERGE (f)-[r:SERVES_INDUSTRY]->(i)
         SET r.source = "enrichment", r.confidence = $confidence`,
        { firmId, names: cls.industries, confidence: cls.confidence ?? 0.8 }
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
         MERGE (f)-[r:OPERATES_IN]->(m)
         SET r.source = "enrichment"`,
        { firmId, names: cls.markets }
      );
      result.markets = cls.markets.length;
    });
  }

  // 6. Link to Languages
  // Track A: SPEAKS edge carries proficiency + speakerCount for matching quality.
  if (cls?.languages.length) {
    await safe("Languages", async () => {
      await neo4jWrite(
        `MATCH (f:ServiceFirm {id: $firmId})
         UNWIND $names AS langName
         MERGE (l:Language {name: langName})
         MERGE (f)-[r:SPEAKS]->(l)
         SET r.source = "enrichment",
             r.proficiency = coalesce(r.proficiency, "conversational"),
             r.speakerCount = coalesce(r.speakerCount, 1)`,
        { firmId, names: cls.languages }
      );
      result.languages = cls.languages.length;
    });
  }

  // 7. Create Service nodes from extracted services
  // Track A: OFFERS_SERVICE carries strength metrics recomputed by service-compute-strength.
  if (gt?.extracted.services.length) {
    await safe("Services", async () => {
      await neo4jWrite(
        `MATCH (f:ServiceFirm {id: $firmId})
         UNWIND $names AS svcName
         MERGE (s:Service {name: svcName})
         MERGE (f)-[r:OFFERS_SERVICE]->(s)
         SET r.source = "website_scrape",
             r.strength = coalesce(r.strength, 0.5),
             r.evidenceCount = coalesce(r.evidenceCount, 1),
             r.websiteMentionCount = coalesce(r.websiteMentionCount, 1),
             r.caseStudyCount = coalesce(r.caseStudyCount, 0),
             r.expertCount = coalesce(r.expertCount, 0),
             r.lastComputedAt = coalesce(r.lastComputedAt, datetime())`,
        { firmId, names: gt!.extracted.services }
      );
      result.services = gt!.extracted.services.length;
    });
  }

  // 8. Create Company stubs from extracted client names (Track A: was Client)
  // Merged by name since we have no domain at this point.
  // enrichmentStatus = "stub" queues them for company-enrich-stub job (PDL domain lookup).
  if (gt?.extracted.clients.length) {
    await safe("Clients", async () => {
      await neo4jWrite(
        `MATCH (f:ServiceFirm {id: $firmId})
         UNWIND $names AS clientName
         MERGE (c:Company {name: clientName})
         ON CREATE SET c.enrichmentStatus = "stub",
                       c.isCosCustomer = false,
                       c.source = "website_scrape",
                       c.createdAt = datetime()
         MERGE (f)-[r:HAS_CLIENT]->(c)
         SET r.source = "website_scrape"`,
        { firmId, names: gt!.extracted.clients }
      );
      result.clients = gt!.extracted.clients.length;
    });
  }

  // 9. Create Person stubs from team members (Track A: was Expert)
  // Keyed by composite firm:name id — no LinkedIn URL yet.
  // Full enrichment (PDL/LinkedIn) happens later via expert-linkedin Inngest job.
  if (gt?.extracted.teamMembers.length) {
    await safe("TeamMembers", async () => {
      const members = gt!.extracted.teamMembers.map((fullName) => {
        const parts = fullName.trim().split(/\s+/);
        return {
          id: `${firmId}:${fullName.toLowerCase().replace(/\s+/g, "-")}`,
          fullName,
          firstName: parts[0] ?? "",
          lastName: parts.slice(1).join(" ") || "",
        };
      });
      await neo4jWrite(
        `MATCH (f:ServiceFirm {id: $firmId})
         UNWIND $members AS m
         MERGE (p:Person {id: m.id})
         SET p.fullName = m.fullName,
             p.firstName = m.firstName,
             p.lastName = m.lastName,
             p.firmId = $firmId,
             p.enrichmentStatus = "stub",
             p.source = "website_scrape",
             p.emails = coalesce(p.emails, [])
         MERGE (p)-[r:CURRENTLY_AT]->(f)
         SET r.source = "website_scrape",
             r.isPrimary = true,
             r.engagementType = "full_time"`,
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

// ─── Person Graph Writer (Track A: was Expert) ───────────

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
 * Write expert/person enrichment data to Neo4j.
 * Track A: Creates Person nodes (was Expert).
 */
export async function writeExpertToGraph(
  data: GraphExpertData
): Promise<{ skills: number; industries: number; errors: string[] }> {
  const errors: string[] = [];

  try {
    // Create/update Person node and link to ServiceFirm
    // Track A: Person → CURRENTLY_AT → ServiceFirm (was Expert → EMPLOYS)
    // Person is keyed by Postgres expertId; linkedinUrl is set so the
    // person_linkedin constraint can dedup if the same person appears elsewhere.
    const parts = data.fullName.trim().split(/\s+/);
    await neo4jWrite(
      `MERGE (p:Person {id: $id})
       SET p.fullName = $fullName,
           p.firstName = $firstName,
           p.lastName = $lastName,
           p.headline = $headline,
           p.linkedinUrl = $linkedinUrl,
           p.location = $location,
           p.firmId = $firmId,
           p.enrichmentStatus = "enriched",
           p.source = "pdl",
           p.emails = coalesce(p.emails, []),
           p.updatedAt = datetime()
       WITH p
       MATCH (f:ServiceFirm {id: $firmId})
       MERGE (p)-[r:CURRENTLY_AT]->(f)
       SET r.isPrimary = true,
           r.source = "enrichment",
           r.engagementType = "full_time"`,
      {
        id: data.expertId,
        fullName: data.fullName,
        firstName: parts[0] ?? "",
        lastName: parts.slice(1).join(" ") || "",
        headline: data.headline ?? null,
        linkedinUrl: data.linkedinUrl ?? null,
        location: data.location ?? null,
        firmId: data.firmId,
      }
    );

    // Link skills (Track A: HAS_SKILL for consistency)
    if (data.skills?.length) {
      await neo4jWrite(
        `MATCH (p:Person {id: $id})
         UNWIND $skills AS skillName
         MERGE (s:Skill {name: skillName})
         MERGE (p)-[r:HAS_SKILL]->(s)
         SET r.source = "enrichment"`,
        { id: data.expertId, skills: data.skills }
      );
    }

    // Link industries
    if (data.industries?.length) {
      await neo4jWrite(
        `MATCH (p:Person {id: $id})
         UNWIND $industries AS indName
         MERGE (i:Industry {name: indName})
         MERGE (p)-[r:SERVES_INDUSTRY]->(i)
         SET r.source = "enrichment"`,
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

// ─── Specialist Profile Graph Writer ─────────────────────

export interface GraphSpecialistProfileData {
  profileId: string;
  expertId: string;
  firmId: string;
  title?: string | null;
  skills?: string[];
  industries?: string[];
}

/**
 * Write a strong specialist profile to Neo4j.
 * Creates a SpecialistProfile node linked from the Person node.
 * Only call for profiles with qualityScore >= 80.
 * Track A: Links to Person (was Expert).
 */
export async function writeSpecialistProfileToGraph(
  data: GraphSpecialistProfileData
): Promise<{ skills: number; industries: number; errors: string[] }> {
  const errors: string[] = [];

  try {
    // Create/update SpecialistProfile node and link to Person
    await neo4jWrite(
      `MERGE (sp:SpecialistProfile {id: $id})
       SET sp.title = $title,
           sp.firmId = $firmId,
           sp.expertId = $expertId,
           sp.updatedAt = datetime()
       WITH sp
       MERGE (p:Person {id: $expertId})
       MERGE (p)-[:HAS_SPECIALIST_PROFILE]->(sp)`,
      {
        id: data.profileId,
        title: data.title ?? null,
        firmId: data.firmId,
        expertId: data.expertId,
      }
    );

    // Link skills from specialist profile
    if (data.skills?.length) {
      await neo4jWrite(
        `MATCH (sp:SpecialistProfile {id: $id})
         UNWIND $skills AS skillName
         MERGE (s:Skill {name: skillName})
         ON CREATE SET s.level = "L2"
         MERGE (sp)-[r:HAS_SKILL]->(s)
         SET r.source = "specialist_profile"`,
        { id: data.profileId, skills: data.skills }
      );
    }

    // Link industries
    if (data.industries?.length) {
      await neo4jWrite(
        `MATCH (sp:SpecialistProfile {id: $id})
         UNWIND $industries AS indName
         MERGE (i:Industry {name: indName})
         MERGE (sp)-[r:SERVES_INDUSTRY]->(i)
         SET r.source = "specialist_profile"`,
        { id: data.profileId, industries: data.industries }
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
 * Track A: Client → Company for client nodes.
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

    // Link to client Company (Track A: Company instead of Client)
    // Merged by name stub; enrichmentStatus = "stub" queues PDL domain lookup.
    if (data.clientName) {
      await neo4jWrite(
        `MATCH (cs:CaseStudy {id: $id})
         MERGE (c:Company {name: $clientName})
         ON CREATE SET c.enrichmentStatus = "stub",
                       c.isCosCustomer = false,
                       c.source = "case_study",
                       c.createdAt = datetime()
         MERGE (cs)-[r:FOR_CLIENT]->(c)
         SET r.source = "case_study"`,
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

// ─── Helpers ──────────────────────────────────────────────

function extractDomain(url: string): string | null {
  try {
    const hostname = new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
    return hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
