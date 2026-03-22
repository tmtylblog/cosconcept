/**
 * Layer 1: Structured Filtering
 *
 * Uses Neo4j graph queries + PostgreSQL to narrow 1.5M firms
 * down to ~500 candidates. This eliminates 99% before expensive
 * vector search and LLM ranking.
 *
 * Query strategy:
 * 1. Neo4j for relationship-based filtering (skills, industries, markets)
 * 2. Skill/Industry/Market hierarchy expansion via BELONGS_TO edges
 * 3. Evidence-weighted scoring (case study count, expert count on edges)
 * 4. Team experience boost via WORKED_AT edges
 * 5. Confidence thresholds to filter noise
 */

import { neo4jRead } from "@/lib/neo4j";
import neo4j from "neo4j-driver";
import type { SearchFilters, MatchCandidate } from "./types";

/** Safely convert Neo4j integer (which may be {low, high} object) to plain number */
function toInt(val: unknown): number {
  if (val == null) return 0;
  if (typeof val === "number") return val;
  if (typeof val === "object" && "low" in (val as Record<string, unknown>)) {
    return (val as { low: number }).low ?? 0;
  }
  return Number(val) || 0;
}

interface StructuredCandidate {
  firmId: string;
  firmName: string;
  website?: string;
  categories: string[];
  matchedSkills: string[];
  matchedIndustries: string[];
  matchedMarkets: string[];
  matchedServices: string[];
  structuredScore: number;
  bidirectionalFit?: { theyWantUs: number; weWantThem: number };
  /** KG evidence: skills with case study/expert backing */
  skillEvidence?: Array<{ name: string; caseStudyCount: number; expertCount: number; confidence: number }>;
  /** KG evidence: services with backing */
  serviceEvidence?: Array<{ name: string; caseStudyCount: number; expertCount: number }>;
  caseStudyCount?: number;
  teamRelevance?: number;
  classifierConfidence?: number;
  /** Connected entity data from 2-hop traversals */
  caseStudySkills?: Array<{ name: string; count: number }>;
  caseStudyIndustries?: Array<{ name: string; count: number }>;
  expertSkills?: Array<{ name: string; expertCount: number }>;
  expertIndustries?: string[];
  clientIndustries?: Array<{ name: string; count: number }>;
  topClients?: string[];
  caseStudyOutcomes?: string[];
}

/**
 * Layer 1: Filter firms using Neo4j graph traversal.
 *
 * Returns ~500 candidates with structured match scores.
 * Score is based on:
 *   - How many filter criteria each firm matches
 *   - Hierarchy expansion (parent skills/industries/markets)
 *   - Evidence weighting (case study + expert backing on skills)
 *   - Case study volume
 *   - Team work history relevance
 *   - Confidence thresholds
 */
export async function structuredFilter(
  filters: SearchFilters,
  limit = 500
): Promise<StructuredCandidate[]> {
  // Build dynamic Cypher query based on which filters are provided
  const conditions: string[] = [];
  const params: Record<string, unknown> = { limit: neo4j.int(limit) };

  // Base: match all service-provider firms (Company nodes with ServiceFirm role label)
  const matchClause = "MATCH (f:Company:ServiceFirm)";
  const returnFields = [
    "f.id AS firmId",
    "f.name AS firmName",
    "coalesce(f.website, f.websiteUrl) AS website",
  ];

  // ── Skills filter with hierarchy expansion ──────────────────
  // Expand skills via BELONGS_TO: if user searches "SEO", also match
  // firms with parent L2 skill "Digital Marketing" or sibling L3 skills
  if (filters.skills?.length) {
    conditions.push(
      `EXISTS {
        MATCH (f)-[hs:HAS_SKILL]->(s:Skill)
        WHERE s.name IN $skills
          OR EXISTS { MATCH (s)<-[:BELONGS_TO]-(child:Skill) WHERE child.name IN $skills }
          OR EXISTS { MATCH (s)-[:BELONGS_TO]->(parent:Skill) WHERE parent.name IN $skills }
      }`
    );
    params.skills = filters.skills;

    // Return matched skills with evidence strength
    returnFields.push(
      `[(f)-[hs:HAS_SKILL]->(s:Skill)
        WHERE s.name IN $skills
          OR EXISTS { MATCH (s)<-[:BELONGS_TO]-(child:Skill) WHERE child.name IN $skills }
          OR EXISTS { MATCH (s)-[:BELONGS_TO]->(parent:Skill) WHERE parent.name IN $skills }
        | {name: s.name, evidence: coalesce(hs.caseStudyCount, 0) + coalesce(hs.expertCount, 0), confidence: coalesce(hs.confidence, 0.5)}
      ] AS skillMatches`
    );
  } else {
    returnFields.push("[] AS skillMatches");
  }

  // ── FirmCategory filter ─────────────────────────────────────
  if (filters.categories?.length) {
    conditions.push(
      `EXISTS {
        MATCH (f)-[:IN_CATEGORY]->(c:FirmCategory)
        WHERE c.name IN $categories
      }`
    );
    params.categories = filters.categories;
    returnFields.push(
      `[(f)-[:IN_CATEGORY]->(c:FirmCategory) | c.name] AS categories`
    );
  } else {
    returnFields.push(
      `[(f)-[:IN_CATEGORY]->(c:FirmCategory) | c.name] AS categories`
    );
  }

  // ── Industry filter with hierarchy expansion ────────────────
  // Expand via BELONGS_TO: "Technology" also matches "SaaS", "Cloud", "AI/ML"
  if (filters.industries?.length) {
    conditions.push(
      `EXISTS {
        MATCH (f)-[:SERVES_INDUSTRY]->(i:Industry)
        WHERE i.name IN $industries
          OR EXISTS { MATCH (i)<-[:BELONGS_TO]-(child:Industry) WHERE child.name IN $industries }
          OR EXISTS { MATCH (i)-[:BELONGS_TO]->(parent) WHERE parent.name IN $industries }
      }`
    );
    params.industries = filters.industries;
    returnFields.push(
      `[(f)-[:SERVES_INDUSTRY]->(i:Industry)
        WHERE i.name IN $industries
          OR EXISTS { MATCH (i)<-[:BELONGS_TO]-(child:Industry) WHERE child.name IN $industries }
          OR EXISTS { MATCH (i)-[:BELONGS_TO]->(parent) WHERE parent.name IN $industries }
        | i.name] AS matchedIndustries`
    );
  } else {
    returnFields.push("[] AS matchedIndustries");
  }

  // ── Market filter with hierarchy expansion ──────────────────
  // "Asia Pacific" also matches "Japan", "Singapore", etc.
  if (filters.markets?.length) {
    conditions.push(
      `EXISTS {
        MATCH (f)-[:OPERATES_IN]->(m:Market)
        WHERE m.name IN $markets
          OR EXISTS { MATCH (m)<-[:PARENT_REGION]-(child:Market) WHERE child.name IN $markets }
          OR EXISTS { MATCH (m)-[:PARENT_REGION]->(parent:Market) WHERE parent.name IN $markets }
      }`
    );
    params.markets = filters.markets;
    returnFields.push(
      `[(f)-[:OPERATES_IN]->(m:Market)
        WHERE m.name IN $markets
          OR EXISTS { MATCH (m)<-[:PARENT_REGION]-(child:Market) WHERE child.name IN $markets }
          OR EXISTS { MATCH (m)-[:PARENT_REGION]->(parent:Market) WHERE parent.name IN $markets }
        | m.name] AS matchedMarkets`
    );
  } else {
    returnFields.push("[] AS matchedMarkets");
  }

  // ── Services filter ─────────────────────────────────────────
  if (filters.services?.length) {
    conditions.push(
      `EXISTS {
        MATCH (f)-[:OFFERS_SERVICE]->(s:Service)
        WHERE ANY(kw IN $serviceKeywords WHERE toLower(s.name) CONTAINS toLower(kw))
      }`
    );
    params.serviceKeywords = filters.services;
    returnFields.push(
      `[(f)-[os:OFFERS_SERVICE]->(s:Service)
        WHERE ANY(kw IN $serviceKeywords WHERE toLower(s.name) CONTAINS toLower(kw))
        | {name: s.name, evidence: coalesce(os.caseStudyCount, 0) + coalesce(os.expertCount, 0)}
      ] AS serviceMatches`
    );
  } else {
    returnFields.push("[] AS serviceMatches");
  }

  // ── Size band filter ─────────────────────────────────────────
  if (filters.sizeBand) {
    const sizeRanges: Record<string, [number, number]> = {
      micro: [1, 10],
      small: [11, 50],
      medium: [51, 200],
      large: [201, 10000],
    };
    const range = sizeRanges[filters.sizeBand];
    if (range) {
      conditions.push(
        `f.employeeCount >= $sizeMin AND f.employeeCount <= $sizeMax`
      );
      params.sizeMin = neo4j.int(range[0]);
      params.sizeMax = neo4j.int(range[1]);
    }
  }

  // ── Language filter ──────────────────────────────────────────
  if (filters.languages?.length) {
    conditions.push(
      `EXISTS {
        MATCH (f)-[:SPEAKS]->(l:Language)
        WHERE l.name IN $languages
      }`
    );
    params.languages = filters.languages;
  }

  // ── Case study count (evidence depth) ───────────────────────
  returnFields.push(
    `size([(f)-[:HAS_CASE_STUDY]->(cs:CaseStudy) | cs]) AS caseStudyCount`
  );

  // ── Team experience (WORKED_AT edges) ───────────────────────
  if (filters.industries?.length || filters.skills?.length) {
    returnFields.push(
      `size([(f)<-[:CURRENTLY_AT|WORKS_AT]-(p:Person)-[:WORKED_AT]->(prev:Company)
        WHERE ${filters.industries?.length ? "prev.industry IN $teamIndustries" : "true"}
        | DISTINCT prev]) AS teamRelevance`
    );
    if (filters.industries?.length) {
      params.teamIndustries = filters.industries;
    }
  } else {
    returnFields.push("0 AS teamRelevance");
  }

  // ── Enrichment quality signal ───────────────────────────────
  returnFields.push(
    `coalesce(f.classifierConfidence, 0.3) AS classifierConfidence`
  );

  // Use OR — a firm matching ANY criterion is a candidate; score reflects how many it matches.
  // Always require f.id to be non-null (excludes orphan nodes without PG mapping).
  const filterClause =
    conditions.length > 0 ? ` AND (${conditions.join(" OR ")})` : "";
  const whereClause = `WHERE f.id IS NOT NULL${filterClause}`;

  const query = `
    ${matchClause}
    ${whereClause}
    RETURN ${returnFields.join(", ")}
    LIMIT $limit
  `;

  interface SkillMatch {
    name: string;
    evidence: number;
    confidence: number;
  }
  interface ServiceMatch {
    name: string;
    evidence: number;
  }

  interface Neo4jFirmRow {
    firmId: string;
    firmName: string;
    website?: string;
    skillMatches?: SkillMatch[];
    matchedIndustries?: string[];
    matchedMarkets?: string[];
    serviceMatches?: ServiceMatch[];
    categories?: string[];
    caseStudyCount?: number;
    teamRelevance?: number;
    classifierConfidence?: number;
  }

  const records = await neo4jRead<Neo4jFirmRow>(query, params);

  // Calculate structured match scores with evidence weighting
  const candidates: StructuredCandidate[] = records.map((record) => {
    const skillMatches: SkillMatch[] = (record.skillMatches ?? []) as SkillMatch[];
    const matchedIndustries: string[] = record.matchedIndustries ?? [];
    const matchedMarkets: string[] = record.matchedMarkets ?? [];
    const serviceMatches: ServiceMatch[] = (record.serviceMatches ?? []) as ServiceMatch[];
    const categories: string[] = record.categories ?? [];
    const caseStudyCount = toInt(record.caseStudyCount);

    const matchedSkills = skillMatches.map((s) => s.name);
    const matchedServices = serviceMatches.map((s) => s.name);

    // ── Base score: fraction of criteria matched ──────────────
    let score = 0;
    let maxScore = 0;

    if (filters.skills?.length) {
      // Evidence-weighted skill score: skills backed by case studies/experts score higher
      const totalEvidence = skillMatches.reduce((sum, s) => sum + s.evidence, 0);
      const avgEvidence = skillMatches.length > 0 ? totalEvidence / skillMatches.length : 0;
      const coverageFraction = matchedSkills.length / filters.skills.length;
      // Boost by evidence: 0 evidence = 1x, 5+ evidence = 1.5x
      const evidenceMultiplier = 1 + Math.min(avgEvidence, 5) / 10;
      score += coverageFraction * evidenceMultiplier;
      maxScore += 1.5; // max with evidence boost
    }
    if (filters.industries?.length) {
      score += matchedIndustries.length / filters.industries.length;
      maxScore += 1;
    }
    if (filters.markets?.length) {
      score += matchedMarkets.length / filters.markets.length;
      maxScore += 1;
    }
    if (filters.categories?.length) {
      const matchedCats = categories.filter((c) =>
        filters.categories!.includes(c)
      );
      score += matchedCats.length / filters.categories.length;
      maxScore += 1;
    }
    if (filters.services?.length) {
      const matchedKeywords = filters.services.filter((kw) =>
        matchedServices.some((s) => s.toLowerCase().includes(kw.toLowerCase()))
      );
      // Evidence-weighted service score
      const totalServiceEvidence = serviceMatches.reduce((sum, s) => sum + s.evidence, 0);
      const avgServiceEvidence = serviceMatches.length > 0 ? totalServiceEvidence / serviceMatches.length : 0;
      const serviceCoverage = matchedKeywords.length / filters.services.length;
      const serviceEvidenceMultiplier = 1 + Math.min(avgServiceEvidence, 5) / 10;
      score += serviceCoverage * serviceEvidenceMultiplier;
      maxScore += 1.5;
    }

    let structuredScore = maxScore > 0 ? score / maxScore : 0.5;

    // ── Case study depth boost: up to +10% ───────────────────
    if (caseStudyCount > 0) {
      const csBoost = Math.min(caseStudyCount, 10) / 10 * 0.10;
      structuredScore = Math.min(1, structuredScore + csBoost);
    }

    // ── Team experience boost: up to +15% ────────────────────
    const teamRelevance = toInt(record.teamRelevance);
    if (teamRelevance > 0) {
      const teamBoost = Math.min(teamRelevance, 5) / 5 * 0.15;
      structuredScore = Math.min(1, structuredScore + teamBoost);
    }

    // ── Confidence quality boost: up to +5% ──────────────────
    const confidence = record.classifierConfidence ?? 0.3;
    if (confidence > 0.7) {
      structuredScore = Math.min(1, structuredScore + 0.05);
    } else if (confidence < 0.3) {
      structuredScore *= 0.9; // Penalize low-confidence firms
    }

    return {
      firmId: record.firmId,
      firmName: record.firmName,
      website: record.website,
      categories,
      matchedSkills,
      matchedIndustries,
      matchedMarkets,
      matchedServices,
      structuredScore,
      skillEvidence: skillMatches.map((s) => ({
        name: s.name,
        caseStudyCount: Math.max(0, s.evidence - 0), // evidence = csCount + expCount combined
        expertCount: 0, // individual counts not available in combined evidence field
        confidence: s.confidence,
      })),
      serviceEvidence: serviceMatches.map((s) => ({
        name: s.name,
        caseStudyCount: s.evidence,
        expertCount: 0,
      })),
      caseStudyCount,
      teamRelevance,
      classifierConfidence: record.classifierConfidence ?? 0.3,
    };
  });

  // Sort by score descending
  candidates.sort((a, b) => b.structuredScore - a.structuredScore);

  return candidates.slice(0, limit);
}

/**
 * Convert structured candidates to match candidates format.
 */
export function toMatchCandidates(
  candidates: StructuredCandidate[]
): MatchCandidate[] {
  return candidates.map((c) => ({
    entityType: "firm" as const,
    entityId: c.firmId,
    displayName: c.firmName,
    firmId: c.firmId,
    firmName: c.firmName,
    totalScore: c.structuredScore,
    structuredScore: c.structuredScore,
    vectorScore: 0,
    ...(c.bidirectionalFit ? { bidirectionalFit: c.bidirectionalFit } : {}),
    preview: {
      categories: c.categories,
      topServices: c.matchedServices.slice(0, 5),
      topSkills: c.matchedSkills,
      industries: c.matchedIndustries,
      website: c.website,
      caseStudyCount: c.caseStudyCount,
      skillEvidence: c.skillEvidence,
      serviceEvidence: c.serviceEvidence,
      classifierConfidence: c.classifierConfidence,
      teamRelevance: c.teamRelevance,
      caseStudySkills: c.caseStudySkills,
      caseStudyIndustries: c.caseStudyIndustries,
      expertSkills: c.expertSkills,
      expertIndustries: c.expertIndustries,
      clientIndustries: c.clientIndustries,
      topClients: c.topClients,
      caseStudyOutcomes: c.caseStudyOutcomes,
    },
  }));
}

// ─── Connected Entity Enrichment ────────────────────────

/**
 * Batch-fetch connected entity data (case study skills/industries,
 * expert skills/industries, client industries) for a set of firm IDs.
 * Uses a single UNWIND query for all firms. Gracefully returns empty
 * map on failure (search continues without connected entity boosts).
 */
async function fetchConnectedEntities(
  firmIds: string[]
): Promise<Map<string, {
  csSkills: string[];
  csIndustries: string[];
  expertSkillPairs: Array<{ skill: string; person: string }>;
  expertIndustries: string[];
  clientData: Array<{ name: string; industry: string | null }>;
  outcomes: string[];
}>> {
  if (firmIds.length === 0) return new Map();

  try {
    const rows = await neo4jRead<{
      firmId: string;
      csSkills: string[];
      csIndustries: string[];
      expertSkillPairs: Array<{ skill: string; person: string }>;
      expertIndustries: string[];
      clientData: Array<{ name: string; industry: string | null }>;
      outcomes: string[][];
    }>(
      `UNWIND $firmIds AS fId
       MATCH (f:Company:ServiceFirm {id: fId})

       // Case study skills (2-hop)
       OPTIONAL MATCH (f)-[:HAS_CASE_STUDY]->(cs:CaseStudy)-[:DEMONSTRATES_SKILL]->(s:Skill)
       WHERE cs.hidden IS NULL OR cs.hidden = false
       WITH f, fId, collect(DISTINCT s.name) AS csSkills

       // Case study industries (2-hop)
       OPTIONAL MATCH (f)-[:HAS_CASE_STUDY]->(cs2:CaseStudy)-[:IN_INDUSTRY]->(i:Industry)
       WHERE cs2.hidden IS NULL OR cs2.hidden = false
       WITH f, fId, csSkills, collect(DISTINCT i.name) AS csIndustries

       // Expert skills (2-hop)
       OPTIONAL MATCH (f)<-[:CURRENTLY_AT]-(p:Person)-[:HAS_SKILL|HAS_EXPERTISE]->(es:Skill)
       WHERE p.hidden IS NULL OR p.hidden = false
       WITH f, fId, csSkills, csIndustries,
         [x IN collect(DISTINCT {skill: es.name, person: p.id}) WHERE x.skill IS NOT NULL] AS expertSkillPairs

       // Expert industries (2-hop)
       OPTIONAL MATCH (f)<-[:CURRENTLY_AT]-(p2:Person)-[:SERVES_INDUSTRY]->(ei:Industry)
       WHERE p2.hidden IS NULL OR p2.hidden = false
       WITH f, fId, csSkills, csIndustries, expertSkillPairs,
         [x IN collect(DISTINCT ei.name) WHERE x IS NOT NULL] AS expertIndustries

       // Client companies (1-hop)
       OPTIONAL MATCH (f)-[:HAS_CLIENT]->(cl:Company)
       WHERE cl.name IS NOT NULL
       WITH fId, csSkills, csIndustries, expertSkillPairs, expertIndustries,
         collect(DISTINCT {name: cl.name, industry: cl.industry})[0..15] AS clientData

       // Case study outcomes
       OPTIONAL MATCH (f:Company:ServiceFirm {id: fId})-[:HAS_CASE_STUDY]->(cs3:CaseStudy)
       WHERE cs3.outcomes IS NOT NULL AND size(cs3.outcomes) > 0
         AND (cs3.hidden IS NULL OR cs3.hidden = false)
       WITH fId, csSkills, csIndustries, expertSkillPairs, expertIndustries, clientData,
         collect(cs3.outcomes)[0..5] AS outcomes

       RETURN fId AS firmId, csSkills, csIndustries, expertSkillPairs, expertIndustries, clientData, outcomes`,
      { firmIds }
    );

    const map = new Map<string, {
      csSkills: string[];
      csIndustries: string[];
      expertSkillPairs: Array<{ skill: string; person: string }>;
      expertIndustries: string[];
      clientData: Array<{ name: string; industry: string | null }>;
      outcomes: string[];
    }>();

    for (const row of rows) {
      // Flatten outcomes (array of arrays)
      const flatOutcomes: string[] = [];
      if (row.outcomes) {
        for (const arr of row.outcomes) {
          if (Array.isArray(arr)) {
            for (const o of arr) {
              if (typeof o === "string" && o.trim()) flatOutcomes.push(o.trim());
            }
          }
        }
      }

      map.set(row.firmId, {
        csSkills: (row.csSkills ?? []).filter(Boolean),
        csIndustries: (row.csIndustries ?? []).filter(Boolean),
        expertSkillPairs: (row.expertSkillPairs ?? []).filter((p) => p.skill),
        expertIndustries: (row.expertIndustries ?? []).filter(Boolean),
        clientData: (row.clientData ?? []).filter((c) => c.name),
        outcomes: [...new Set(flatOutcomes)].slice(0, 5),
      });
    }
    return map;
  } catch (err) {
    console.error("[StructuredFilter] Connected entity enrichment failed:", err);
    return new Map();
  }
}

/** Count occurrences of each value in a string array */
function countOccurrences(arr: string[]): Array<{ name: string; count: number }> {
  const map = new Map<string, number>();
  for (const v of arr) {
    map.set(v, (map.get(v) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

/** Count distinct persons per skill */
function countExpertSkills(pairs: Array<{ skill: string; person: string }>): Array<{ name: string; expertCount: number }> {
  const map = new Map<string, Set<string>>();
  for (const { skill, person } of pairs) {
    if (!map.has(skill)) map.set(skill, new Set());
    map.get(skill)!.add(person);
  }
  return [...map.entries()]
    .map(([name, persons]) => ({ name, expertCount: persons.size }))
    .sort((a, b) => b.expertCount - a.expertCount);
}

/**
 * Enrich Layer 1 candidates with connected entity data and apply score boosts.
 * Works on MatchCandidate[] (the format used in search.ts pipeline).
 * Mutates candidates in-place for efficiency.
 */
export async function enrichWithConnectedEntities(
  candidates: MatchCandidate[],
  filters: SearchFilters
): Promise<void> {
  const firmCandidates = candidates.filter((c) => c.entityType === "firm" || !c.entityType);
  const firmIds = firmCandidates.map((c) => c.entityId || c.firmId);
  if (firmIds.length === 0) return;

  const connected = await fetchConnectedEntities(firmIds);
  if (connected.size === 0) return;

  const searchedSkills = filters.skills ?? [];
  const searchedIndustries = filters.industries ?? [];

  for (const candidate of firmCandidates) {
    const data = connected.get(candidate.entityId || candidate.firmId);
    if (!data) continue;

    // Aggregate into display-friendly structures
    const csSkills = countOccurrences(data.csSkills);
    const csIndustries = countOccurrences(data.csIndustries);
    const expertSkillCov = countExpertSkills(data.expertSkillPairs);
    const clientIndustries = countOccurrences(
      data.clientData.filter((c) => c.industry).map((c) => c.industry!)
    );
    const topClients = data.clientData.map((c) => c.name).slice(0, 10);

    // Attach to preview
    candidate.preview.caseStudySkills = csSkills;
    candidate.preview.caseStudyIndustries = csIndustries;
    candidate.preview.expertSkills = expertSkillCov;
    candidate.preview.expertIndustries = data.expertIndustries;
    candidate.preview.clientIndustries = clientIndustries;
    candidate.preview.topClients = topClients;
    candidate.preview.caseStudyOutcomes = data.outcomes;

    // Apply score boosts based on connected entity evidence
    let boost = 0;

    // Skill match backed by case study DEMONSTRATES_SKILL
    if (searchedSkills.length > 0 && csSkills.length > 0) {
      const csSkillNames = new Set(csSkills.map((s) => s.name.toLowerCase()));
      const provenSkills = searchedSkills.filter((sk) =>
        csSkillNames.has(sk.toLowerCase()) ||
        [...csSkillNames].some((csn) => csn.includes(sk.toLowerCase()) || sk.toLowerCase().includes(csn))
      );
      if (provenSkills.length > 0) {
        boost += Math.min(0.10, (provenSkills.length / searchedSkills.length) * 0.10);
      }
    }

    // Industry match backed by case study IN_INDUSTRY
    if (searchedIndustries.length > 0 && csIndustries.length > 0) {
      const csIndNames = new Set(csIndustries.map((i) => i.name.toLowerCase()));
      const provenIndustries = searchedIndustries.filter((ind) =>
        csIndNames.has(ind.toLowerCase()) ||
        [...csIndNames].some((csn) => csn.includes(ind.toLowerCase()) || ind.toLowerCase().includes(csn))
      );
      if (provenIndustries.length > 0) {
        boost += Math.min(0.08, (provenIndustries.length / searchedIndustries.length) * 0.08);
      }
    }

    // Expert skill depth (>2 experts with searched skill)
    if (searchedSkills.length > 0 && expertSkillCov.length > 0) {
      const deepSkills = searchedSkills.filter((sk) => {
        const match = expertSkillCov.find((e) =>
          e.name.toLowerCase().includes(sk.toLowerCase()) || sk.toLowerCase().includes(e.name.toLowerCase())
        );
        return match && match.expertCount >= 2;
      });
      if (deepSkills.length > 0) {
        boost += Math.min(0.08, (deepSkills.length / searchedSkills.length) * 0.08);
      }
    }

    // Expert industry coverage
    if (searchedIndustries.length > 0 && data.expertIndustries.length > 0) {
      const expertIndSet = new Set(data.expertIndustries.map((i) => i.toLowerCase()));
      const matched = searchedIndustries.filter((ind) =>
        expertIndSet.has(ind.toLowerCase()) ||
        [...expertIndSet].some((ei) => ei.includes(ind.toLowerCase()) || ind.toLowerCase().includes(ei))
      );
      if (matched.length > 0) {
        boost += Math.min(0.05, (matched.length / searchedIndustries.length) * 0.05);
      }
    }

    // Client industry signal
    if (searchedIndustries.length > 0 && clientIndustries.length > 0) {
      const clientIndSet = new Set(clientIndustries.map((ci) => ci.name.toLowerCase()));
      const matched = searchedIndustries.filter((ind) =>
        clientIndSet.has(ind.toLowerCase()) ||
        [...clientIndSet].some((ci) => ci.includes(ind.toLowerCase()) || ind.toLowerCase().includes(ci))
      );
      if (matched.length > 0) {
        boost += Math.min(0.04, (matched.length / searchedIndustries.length) * 0.04);
      }
    }

    // Apply boost (capped)
    if (boost > 0) {
      candidate.structuredScore = Math.min(1, candidate.structuredScore + boost);
      candidate.totalScore = Math.min(1, candidate.totalScore + boost);
    }
  }

  // Re-sort after boosting
  candidates.sort((a, b) => b.totalScore - a.totalScore);
}

// ─── Bidirectional Matching ──────────────────────────────

interface SearcherPreferences {
  skills: string[];
  categories: string[];
  markets: string[];
}

/**
 * Read the searcher firm's PREFERS edges from Neo4j.
 * Returns the skills, categories, and markets they stated they want.
 */
async function readSearcherPreferences(
  firmId: string
): Promise<SearcherPreferences> {
  interface PrefRow {
    dimension: string;
    targetName: string;
  }

  const rows = await neo4jRead<PrefRow>(
    `MATCH (f:Company {id: $firmId})-[r:PREFERS]->(t)
     RETURN r.dimension AS dimension, t.name AS targetName`,
    { firmId }
  );

  const prefs: SearcherPreferences = { skills: [], categories: [], markets: [] };
  for (const row of rows) {
    switch (row.dimension) {
      case "skill":
        prefs.skills.push(row.targetName);
        break;
      case "capability_gap_category":
      case "firm_category":
        prefs.categories.push(row.targetName);
        break;
      case "market":
        prefs.markets.push(row.targetName);
        break;
    }
  }
  return prefs;
}

/**
 * Check if candidate firms PREFERS what the searcher offers.
 * Returns a map of candidateFirmId → theyWantUs score (0-1).
 */
async function checkCandidatesWantSearcher(
  candidateIds: string[],
  searcherFirmId: string
): Promise<Map<string, number>> {
  if (candidateIds.length === 0) return new Map();

  // Get what the searcher offers (their skills, categories, markets)
  interface OfferRow {
    label: string;
    name: string;
  }

  const searcherOffers = await neo4jRead<OfferRow>(
    `MATCH (f:Company {id: $firmId})-[:HAS_SKILL|IN_CATEGORY|OPERATES_IN]->(t)
     RETURN CASE
       WHEN t:Skill THEN 'Skill'
       WHEN t:Category OR t:FirmCategory THEN 'Category'
       WHEN t:Market THEN 'Market'
       ELSE labels(t)[0]
     END AS label, t.name AS name`,
    { firmId: searcherFirmId }
  );

  if (searcherOffers.length === 0) return new Map();

  const searcherSkills = new Set(
    searcherOffers.filter((o) => o.label === "Skill").map((o) => o.name)
  );
  const searcherCategories = new Set(
    searcherOffers
      .filter((o) => o.label === "Category")
      .map((o) => o.name)
  );
  const searcherMarkets = new Set(
    searcherOffers.filter((o) => o.label === "Market").map((o) => o.name)
  );

  // Check each candidate's PREFERS edges against what the searcher offers
  interface CandidatePrefRow {
    candidateId: string;
    dimension: string;
    targetName: string;
  }

  const candidatePrefs = await neo4jRead<CandidatePrefRow>(
    `UNWIND $candidateIds AS cId
     MATCH (f:Company {id: cId})-[r:PREFERS]->(t)
     RETURN f.id AS candidateId, r.dimension AS dimension, t.name AS targetName`,
    { candidateIds }
  );

  // Group by candidate
  const prefsByCandidate = new Map<string, CandidatePrefRow[]>();
  for (const row of candidatePrefs) {
    const existing = prefsByCandidate.get(row.candidateId) || [];
    existing.push(row);
    prefsByCandidate.set(row.candidateId, existing);
  }

  // Score: how many of their PREFERS match what the searcher offers?
  const result = new Map<string, number>();
  for (const [candidateId, prefs] of prefsByCandidate) {
    if (prefs.length === 0) continue;
    let matches = 0;
    for (const pref of prefs) {
      if (
        (pref.dimension === "skill" && searcherSkills.has(pref.targetName)) ||
        ((pref.dimension === "capability_gap_category" || pref.dimension === "firm_category") &&
          searcherCategories.has(pref.targetName)) ||
        (pref.dimension === "market" && searcherMarkets.has(pref.targetName))
      ) {
        matches++;
      }
    }
    result.set(candidateId, matches / prefs.length);
  }

  return result;
}

/**
 * Bidirectional structured filter: runs standard filtering enriched with
 * the searcher's PREFERS edges, then checks mutual fit.
 *
 * Candidates with mutual PREFERS get up to +20% score boost.
 */
export async function bidirectionalStructuredFilter(
  filters: SearchFilters,
  searcherFirmId: string,
  limit = 500
): Promise<StructuredCandidate[]> {
  // Read searcher's stated preferences from Neo4j
  const searcherPrefs = await readSearcherPreferences(searcherFirmId);

  // Enrich filters with searcher's PREFERS (union with explicit filters)
  const enrichedFilters: SearchFilters = { ...filters };
  if (searcherPrefs.skills.length > 0) {
    enrichedFilters.skills = [
      ...new Set([...(filters.skills || []), ...searcherPrefs.skills]),
    ];
  }
  if (searcherPrefs.categories.length > 0) {
    enrichedFilters.categories = [
      ...new Set([...(filters.categories || []), ...searcherPrefs.categories]),
    ];
  }
  if (searcherPrefs.markets.length > 0) {
    enrichedFilters.markets = [
      ...new Set([...(filters.markets || []), ...searcherPrefs.markets]),
    ];
  }

  // Run standard structured filter with enriched filters
  const candidates = await structuredFilter(enrichedFilters, limit);

  // Exclude the searcher from results
  const filtered = candidates.filter((c) => c.firmId !== searcherFirmId);

  // Check bidirectional fit: do the candidates also want the searcher?
  const candidateIds = filtered.map((c) => c.firmId);
  const theyWantUsMap = await checkCandidatesWantSearcher(
    candidateIds,
    searcherFirmId
  );

  // Compute weWantThem: how many of our PREFERS match what the candidate offers?
  const totalSearcherPrefs =
    searcherPrefs.skills.length +
    searcherPrefs.categories.length +
    searcherPrefs.markets.length;

  const boosted = filtered.map((c) => {
    const theyWantUs = theyWantUsMap.get(c.firmId) ?? 0;

    let weWantThemMatches = 0;
    if (totalSearcherPrefs > 0) {
      for (const s of searcherPrefs.skills) {
        if (c.matchedSkills.includes(s)) weWantThemMatches++;
      }
      for (const cat of searcherPrefs.categories) {
        if (c.categories.includes(cat)) weWantThemMatches++;
      }
      for (const m of searcherPrefs.markets) {
        if (c.matchedMarkets.includes(m)) weWantThemMatches++;
      }
    }
    const weWantThem =
      totalSearcherPrefs > 0 ? weWantThemMatches / totalSearcherPrefs : 0;

    // Bidirectional boost: up to +20% for mutual fit
    const mutualFit = (theyWantUs + weWantThem) / 2;
    const boost = mutualFit * 0.2;

    return {
      ...c,
      structuredScore: Math.min(1, c.structuredScore + boost),
      bidirectionalFit: { theyWantUs, weWantThem },
    };
  });

  // Re-sort by boosted score
  boosted.sort((a, b) => b.structuredScore - a.structuredScore);

  return boosted.slice(0, limit);
}

// ─── Universal Multi-Entity Filter ────────────────────────

/**
 * Layer 1: Universal structured filter across firms, experts, and case studies.
 *
 * Queries all three entity types in parallel and returns a unified, score-sorted list.
 */
export async function universalStructuredFilter(
  filters: SearchFilters,
  limit = 500
): Promise<MatchCandidate[]> {
  // If an entity type filter is set, only run that query
  const et = filters.entityType;

  // Intent-driven allocation: adjust how many results per entity type
  // More balanced defaults — firms used to dominate with 50/30/20
  const intent = filters.searchIntent ?? "partner";
  const alloc = et ? { firm: 1, expert: 1, caseStudy: 1 } :
    intent === "expertise" ? { firm: 0.20, expert: 0.55, caseStudy: 0.25 } :
    intent === "evidence" ? { firm: 0.20, expert: 0.25, caseStudy: 0.55 } :
    /* partner */            { firm: 0.35, expert: 0.35, caseStudy: 0.30 };

  // Each filter is individually wrapped in catch() so one failure doesn't kill
  // the entire search. If expertFilter or caseStudyFilter throw (bad Cypher,
  // Neo4j timeout, etc.), search still returns firm results.
  const [firms, experts, caseStudies] = await Promise.all([
    (!et || et === "firm"
      ? structuredFilter(filters, et ? limit : Math.ceil(limit * alloc.firm))
        .catch((err) => { console.error("[Search] firmFilter failed:", err); return [] as StructuredCandidate[]; })
      : Promise.resolve([] as ReturnType<typeof structuredFilter> extends Promise<infer T> ? T : never)),
    (!et || et === "expert"
      ? expertFilter(filters, et ? limit : Math.ceil(limit * alloc.expert), intent)
        .catch((err) => { console.error("[Search] expertFilter failed:", err); return [] as MatchCandidate[]; })
      : Promise.resolve([] as MatchCandidate[])),
    (!et || et === "case_study"
      ? caseStudyFilter(filters, et ? limit : Math.ceil(limit * alloc.caseStudy), intent)
        .catch((err) => { console.error("[Search] caseStudyFilter failed:", err); return [] as MatchCandidate[]; })
      : Promise.resolve([] as MatchCandidate[])),
  ]);

  const firmCandidates = toMatchCandidates(firms as StructuredCandidate[]);
  const expertCandidates = experts as MatchCandidate[];
  const csCandidates = caseStudies as MatchCandidate[];

  // If searching all entity types (no explicit filter), guarantee diversity
  // so firms don't drown out experts and case studies
  if (!et) {
    // Sort each pool by score independently
    firmCandidates.sort((a, b) => b.structuredScore - a.structuredScore);
    expertCandidates.sort((a, b) => b.structuredScore - a.structuredScore);
    csCandidates.sort((a, b) => b.structuredScore - a.structuredScore);

    // Guarantee minimums from each entity type (if available)
    const minExperts = Math.min(3, expertCandidates.length);
    const minCaseStudies = Math.min(2, csCandidates.length);

    const diverse: MatchCandidate[] = [];
    const usedIds = new Set<string>();

    // Insert top experts first
    for (let i = 0; i < minExperts; i++) {
      diverse.push(expertCandidates[i]);
      usedIds.add(expertCandidates[i].entityId);
    }
    // Then top case studies
    for (let i = 0; i < minCaseStudies; i++) {
      diverse.push(csCandidates[i]);
      usedIds.add(csCandidates[i].entityId);
    }

    // Fill rest from all pools sorted by score
    const remaining = [...firmCandidates, ...expertCandidates, ...csCandidates]
      .filter((c) => !usedIds.has(c.entityId))
      .sort((a, b) => b.structuredScore - a.structuredScore);

    for (const c of remaining) {
      if (diverse.length >= limit) break;
      diverse.push(c);
    }

    return diverse.slice(0, limit);
  }

  // Single entity type — simple sort
  const all: MatchCandidate[] = [
    ...firmCandidates,
    ...expertCandidates,
    ...csCandidates,
  ];

  all.sort((a, b) => b.structuredScore - a.structuredScore);
  return all.slice(0, limit);
}

/**
 * Query Person:Expert nodes with skill/industry/market matching.
 * Uses hierarchy expansion same as firm filter.
 */
export async function expertFilter(
  filters: SearchFilters,
  limit: number,
  intent: "partner" | "expertise" | "evidence" = "partner"
): Promise<MatchCandidate[]> {
  // Allow expert search when ANY filter signal is present (not just skills/industries/markets).
  // Previously this guard blocked expert queries when only categories were extracted.
  const hasExpertSignals =
    (filters.skills?.length ?? 0) > 0 ||
    (filters.industries?.length ?? 0) > 0 ||
    (filters.markets?.length ?? 0) > 0 ||
    (filters.categories?.length ?? 0) > 0 ||
    (filters.services?.length ?? 0) > 0;

  if (!hasExpertSignals) {
    console.warn("[expertFilter] No signals — returning empty. Filters:", JSON.stringify({
      skills: filters.skills?.length ?? 0,
      industries: filters.industries?.length ?? 0,
      markets: filters.markets?.length ?? 0,
      categories: filters.categories?.length ?? 0,
      services: filters.services?.length ?? 0,
    }));
    return [];
  }

  console.warn("[expertFilter] Running with signals:", JSON.stringify({
    skills: filters.skills?.length ?? 0,
    industries: filters.industries?.length ?? 0,
    markets: filters.markets?.length ?? 0,
    categories: filters.categories?.length ?? 0,
    services: filters.services?.length ?? 0,
    limit,
  }));

  const params: Record<string, unknown> = { limit: neo4j.int(limit) };
  const conditions: string[] = [];

  if (filters.skills?.length) {
    // Skill hierarchy expansion for experts too
    conditions.push(
      `EXISTS { MATCH (p)-[:HAS_SKILL|HAS_EXPERTISE]->(s:Skill)
        WHERE s.name IN $skills
          OR EXISTS { MATCH (s)<-[:BELONGS_TO]-(child:Skill) WHERE child.name IN $skills }
          OR EXISTS { MATCH (s)-[:BELONGS_TO]->(parent:Skill) WHERE parent.name IN $skills }
      }`
    );
    params.skills = filters.skills;
  }
  if (filters.industries?.length) {
    conditions.push(
      `EXISTS { MATCH (p)-[:SERVES_INDUSTRY]->(i:Industry)
        WHERE i.name IN $industries
          OR EXISTS { MATCH (i)<-[:BELONGS_TO]-(child:Industry) WHERE child.name IN $industries }
          OR EXISTS { MATCH (i)-[:BELONGS_TO]->(parent) WHERE parent.name IN $industries }
      }`
    );
    params.industries = filters.industries;
  }
  if (filters.markets?.length) {
    conditions.push(
      `EXISTS { MATCH (p)-[:OPERATES_IN]->(m:Market)
        WHERE m.name IN $markets
          OR EXISTS { MATCH (m)<-[:PARENT_REGION]-(child:Market) WHERE child.name IN $markets }
          OR EXISTS { MATCH (m)-[:PARENT_REGION]->(parent:Market) WHERE parent.name IN $markets }
      }`
    );
    params.markets = filters.markets;
  }

  const hasFilterConditions = conditions.length > 0;
  // Cap unfiltered scans to avoid full graph scan + Neo4j timeout
  if (!hasFilterConditions) {
    params.limit = neo4j.int(Math.min(limit as number, 50));
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" OR ")}` : "";

  const query = `
    MATCH (p:Person)
    WHERE p.enrichmentStatus <> "stub" AND (p.hidden IS NULL OR p.hidden = false)
    ${whereClause ? "AND (" + whereClause.replace(/^WHERE /, "") + ")" : ""}
    OPTIONAL MATCH (p)-[:CURRENTLY_AT|WORKS_AT]->(sf:Company:ServiceFirm)
    WITH p, sf,
      [(p)-[:HAS_SKILL|HAS_EXPERTISE]->(s:Skill) | s.name][0..8] AS skills,
      [(p)-[:SERVES_INDUSTRY]->(i:Industry) | i.name][0..5] AS industries,
      [(p)-[:OPERATES_IN]->(m:Market) | m.name][0..5] AS markets,
      [(p)-[:SPEAKS_LANGUAGE]->(l:Language) | l.name][0..3] AS languages,
      size([(p)-[:HAS_SPECIALIST_PROFILE]->(:SpecialistProfile) | 1]) AS specialistProfileCount,
      size([(p)-[:CONTRIBUTED_TO]->(:CaseStudy) | 1]) AS caseStudyCount,
      [(p)-[:HAS_SPECIALIST_PROFILE]->(sp:SpecialistProfile) | sp.title][0] AS primarySpecialistTitle
    RETURN
      coalesce(p.id, p.legacyId) AS entityId,
      coalesce(p.fullName, p.firstName + ' ' + p.lastName, p.name, 'Expert') AS displayName,
      sf.name AS firmName,
      sf.id AS parentFirmId,
      skills,
      industries,
      markets,
      languages,
      specialistProfileCount,
      caseStudyCount,
      primarySpecialistTitle
    ORDER BY
      specialistProfileCount DESC,
      size(skills) DESC,
      caseStudyCount DESC
    LIMIT $limit
  `;

  interface ExpertRow {
    entityId: string;
    displayName: string;
    firmName?: string;
    parentFirmId?: string;
    skills: string[];
    industries: string[];
    markets: string[];
    languages: string[];
    specialistProfileCount: number;
    caseStudyCount: number;
    primarySpecialistTitle?: string;
  }

  const records = await neo4jRead<ExpertRow>(query, params);
  console.warn("[expertFilter] Neo4j returned %d expert records", records.length);

  return records.map((r) => {
    let score = 0;
    let maxScore = 0;
    if (filters.skills?.length) {
      const directMatches = r.skills.filter((s) => filters.skills!.includes(s)).length;
      score += directMatches / filters.skills.length;
      maxScore += 1;
    }
    if (filters.industries?.length) {
      score += r.industries.filter((i) => filters.industries!.includes(i)).length / filters.industries.length;
      maxScore += 1;
    }
    if (filters.markets?.length) {
      score += r.markets.filter((m) => filters.markets!.includes(m)).length / filters.markets.length;
      maxScore += 1;
    }
    let structuredScore = maxScore > 0 ? score / maxScore : 0.4;

    // Specialist profile boost: curated profiles are higher signal
    // When intent is "expertise", double the boost from +15% to +30%
    const spCount = toInt(r.specialistProfileCount);
    if (spCount > 0) {
      const maxBoost = intent === "expertise" ? 0.30 : 0.15;
      const spBoost = Math.min(spCount, 3) / 3 * maxBoost;
      structuredScore = Math.min(1, structuredScore + spBoost);
    }

    return {
      entityType: "expert" as const,
      entityId: r.entityId,
      displayName: r.displayName,
      firmId: r.parentFirmId ?? r.entityId,
      firmName: r.firmName ?? r.displayName,
      totalScore: structuredScore,
      structuredScore,
      vectorScore: 0,
      preview: {
        categories: [],
        topServices: [],
        topSkills: r.skills,
        industries: r.industries,
        markets: r.markets,
        subtitle: r.firmName,
        firmName: r.firmName,
        languages: r.languages,
        specialistProfileCount: toInt(r.specialistProfileCount),
        caseStudyCount: toInt(r.caseStudyCount),
        primarySpecialistTitle: r.primarySpecialistTitle ?? undefined,
      },
    };
  });
}

/**
 * Query CaseStudy nodes matching skills and industries.
 * Uses hierarchy expansion for broader matches.
 */
export async function caseStudyFilter(
  filters: SearchFilters,
  limit: number,
  intent: "partner" | "expertise" | "evidence" = "partner"
): Promise<MatchCandidate[]> {
  // Allow case study search when ANY filter signal is present
  const hasCaseStudySignals =
    (filters.skills?.length ?? 0) > 0 ||
    (filters.industries?.length ?? 0) > 0 ||
    (filters.categories?.length ?? 0) > 0 ||
    (filters.services?.length ?? 0) > 0;

  if (!hasCaseStudySignals) {
    console.warn("[caseStudyFilter] No signals — returning empty");
    return [];
  }

  console.warn("[caseStudyFilter] Running with signals:", JSON.stringify({
    skills: filters.skills?.length ?? 0,
    industries: filters.industries?.length ?? 0,
    categories: filters.categories?.length ?? 0,
    services: filters.services?.length ?? 0,
    limit,
  }));

  const params: Record<string, unknown> = { limit: neo4j.int(limit) };
  const conditions: string[] = [];

  if (filters.skills?.length) {
    conditions.push(
      `EXISTS { MATCH (cs)-[:DEMONSTRATES_SKILL]->(s:Skill)
        WHERE s.name IN $skills
          OR EXISTS { MATCH (s)<-[:BELONGS_TO]-(child:Skill) WHERE child.name IN $skills }
          OR EXISTS { MATCH (s)-[:BELONGS_TO]->(parent:Skill) WHERE parent.name IN $skills }
      }`
    );
    params.skills = filters.skills;
  }
  if (filters.industries?.length) {
    conditions.push(
      `EXISTS { MATCH (cs)-[:IN_INDUSTRY]->(i:Industry)
        WHERE i.name IN $industries
          OR EXISTS { MATCH (i)<-[:BELONGS_TO]-(child:Industry) WHERE child.name IN $industries }
          OR EXISTS { MATCH (i)-[:BELONGS_TO]->(parent) WHERE parent.name IN $industries }
      }`
    );
    params.industries = filters.industries;
  }

  // If no skill/industry conditions exist (only categories triggered the guard),
  // cap results tightly to avoid full graph scan + Neo4j timeout
  const hasFilterConditions = conditions.length > 0;
  if (!hasFilterConditions) {
    params.limit = neo4j.int(Math.min(limit, 50)); // Cap at 50 for unfiltered scans
  }

  // Exclude hidden case studies (no summary, synthetic, junk scrapes)
  const qualityCondition = "(cs.hidden IS NULL OR cs.hidden = false)";
  // When no filter conditions, also require a summary to get quality results
  const whereClause = hasFilterConditions
    ? `WHERE ${qualityCondition} AND (${conditions.join(" OR ")})`
    : `WHERE ${qualityCondition} AND cs.summary IS NOT NULL AND cs.summary <> ''`;

  const query = `
    MATCH (cs:CaseStudy)
    ${whereClause}
    OPTIONAL MATCH (cs)<-[:HAS_CASE_STUDY]-(sf:Company:ServiceFirm)
    OPTIONAL MATCH (cs)-[:FOR_CLIENT]->(cl:Company)
    WITH cs, sf, cl,
      [(cs)-[:DEMONSTRATES_SKILL]->(s:Skill) | s.name][0..8] AS skills,
      [(cs)-[:IN_INDUSTRY]->(i:Industry) | i.name][0..5] AS industries,
      size([(p:Person)-[:CONTRIBUTED_TO]->(cs) | 1]) AS contributorCount
    RETURN
      coalesce(cs.id, cs.legacyId) AS entityId,
      coalesce(
        CASE WHEN cs.title IS NOT NULL AND cs.title <> 'Manual Input' THEN cs.title ELSE null END,
        CASE WHEN cl.name IS NOT NULL THEN 'Project for ' + cl.name ELSE null END,
        CASE WHEN cs.clientName IS NOT NULL THEN 'Project for ' + cs.clientName ELSE null END,
        cs.summary,
        'Case Study'
      ) AS displayName,
      sf.name AS firmName,
      sf.id AS parentFirmId,
      skills,
      industries,
      contributorCount,
      cs.summary AS summary,
      CASE WHEN cs.sourceUrl IS NOT NULL AND NOT cs.sourceUrl STARTS WITH 'manual:' AND NOT cs.sourceUrl STARTS WITH 'uploaded:' THEN cs.sourceUrl ELSE null END AS sourceUrl,
      coalesce(cl.name, cs.clientName) AS clientName
    ORDER BY
      CASE WHEN cs.sourceUrl IS NOT NULL AND cs.sourceUrl STARTS WITH 'http' THEN 0 ELSE 1 END,
      CASE WHEN cs.title IS NOT NULL AND cs.title <> 'Manual Input' THEN 0 ELSE 1 END,
      size(skills) DESC
    LIMIT $limit
  `;

  interface CaseStudyRow {
    entityId: string;
    displayName: string;
    firmName?: string;
    parentFirmId?: string;
    skills: string[];
    industries: string[];
    contributorCount: number;
    summary?: string;
    sourceUrl?: string;
    clientName?: string;
  }

  const records = await neo4jRead<CaseStudyRow>(query, params);
  console.warn("[caseStudyFilter] Neo4j returned %d case study records", records.length);

  return records.map((r) => {
    let score = 0;
    let maxScore = 0;
    if (filters.skills?.length) {
      score += r.skills.filter((s) => filters.skills!.includes(s)).length / filters.skills.length;
      maxScore += 1;
    }
    if (filters.industries?.length) {
      score += r.industries.filter((i) => filters.industries!.includes(i)).length / filters.industries.length;
      maxScore += 1;
    }
    let structuredScore = maxScore > 0 ? score / maxScore : 0.3;

    // Evidence intent: contributor count gives up to +15% boost
    const contribCount = toInt(r.contributorCount);
    if (intent === "evidence" && contribCount > 0) {
      const contribBoost = Math.min(contribCount, 5) / 5 * 0.15;
      structuredScore = Math.min(1, structuredScore + contribBoost);
    }

    const displayName = r.displayName?.length > 80
      ? r.displayName.slice(0, 77) + "…"
      : r.displayName;

    return {
      entityType: "case_study" as const,
      entityId: r.entityId,
      displayName,
      firmId: r.parentFirmId ?? r.entityId,
      firmName: r.firmName ?? displayName,
      totalScore: structuredScore,
      structuredScore,
      vectorScore: 0,
      preview: {
        categories: [],
        topServices: [],
        topSkills: r.skills,
        industries: r.industries,
        subtitle: r.firmName,
        firmName: r.firmName,
        contributorCount: toInt(r.contributorCount),
        summary: r.summary ?? undefined,
        sourceUrl: r.sourceUrl ?? undefined,
        clientName: r.clientName ?? undefined,
      },
    };
  });
}
