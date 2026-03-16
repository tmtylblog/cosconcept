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
    const caseStudyCount = typeof record.caseStudyCount === "object"
      ? (record.caseStudyCount as { low: number }).low ?? 0
      : record.caseStudyCount ?? 0;

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
    const teamRelevance = typeof record.teamRelevance === "object"
      ? (record.teamRelevance as { low: number }).low ?? 0
      : record.teamRelevance ?? 0;
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
    },
  }));
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
  const [firms, experts, caseStudies] = await Promise.all([
    !et || et === "firm"
      ? structuredFilter(filters, et ? limit : Math.ceil(limit * 0.5))
      : Promise.resolve([] as ReturnType<typeof structuredFilter> extends Promise<infer T> ? T : never),
    !et || et === "expert"
      ? expertFilter(filters, et ? limit : Math.ceil(limit * 0.3))
      : Promise.resolve([] as MatchCandidate[]),
    !et || et === "case_study"
      ? caseStudyFilter(filters, et ? limit : Math.ceil(limit * 0.2))
      : Promise.resolve([] as MatchCandidate[]),
  ]);

  const all: MatchCandidate[] = [
    ...toMatchCandidates(firms as StructuredCandidate[]),
    ...(experts as MatchCandidate[]),
    ...(caseStudies as MatchCandidate[]),
  ];

  all.sort((a, b) => b.structuredScore - a.structuredScore);
  return all.slice(0, limit);
}

/**
 * Query Person:Expert nodes with skill/industry/market matching.
 * Uses hierarchy expansion same as firm filter.
 */
async function expertFilter(
  filters: SearchFilters,
  limit: number
): Promise<MatchCandidate[]> {
  const hasExpertSignals =
    (filters.skills?.length ?? 0) > 0 ||
    (filters.industries?.length ?? 0) > 0 ||
    (filters.markets?.length ?? 0) > 0;

  if (!hasExpertSignals) return [];

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

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" OR ")}` : "";

  const query = `
    MATCH (p:Person)
    WHERE p.enrichmentStatus <> "stub"
    ${whereClause ? "AND (" + whereClause.replace(/^WHERE /, "") + ")" : ""}
    OPTIONAL MATCH (p)-[:WORKS_AT]->(sf:Company:ServiceFirm)
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
      skills,
      industries,
      markets,
      languages,
      specialistProfileCount,
      caseStudyCount,
      primarySpecialistTitle
    LIMIT $limit
  `;

  interface ExpertRow {
    entityId: string;
    displayName: string;
    firmName?: string;
    skills: string[];
    industries: string[];
    markets: string[];
    languages: string[];
    specialistProfileCount: number;
    caseStudyCount: number;
    primarySpecialistTitle?: string;
  }

  const records = await neo4jRead<ExpertRow>(query, params);

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
    if (filters.markets?.length) {
      score += r.markets.filter((m) => filters.markets!.includes(m)).length / filters.markets.length;
      maxScore += 1;
    }
    const structuredScore = maxScore > 0 ? score / maxScore : 0.4;

    return {
      entityType: "expert" as const,
      entityId: r.entityId,
      displayName: r.displayName,
      firmId: r.entityId,
      firmName: r.displayName,
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
        specialistProfileCount: r.specialistProfileCount,
        caseStudyCount: r.caseStudyCount,
        primarySpecialistTitle: r.primarySpecialistTitle ?? undefined,
      },
    };
  });
}

/**
 * Query CaseStudy nodes matching skills and industries.
 * Uses hierarchy expansion for broader matches.
 */
async function caseStudyFilter(
  filters: SearchFilters,
  limit: number
): Promise<MatchCandidate[]> {
  const hasCaseStudySignals =
    (filters.skills?.length ?? 0) > 0 ||
    (filters.industries?.length ?? 0) > 0;

  if (!hasCaseStudySignals) return [];

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

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" OR ")}` : "";

  const query = `
    MATCH (cs:CaseStudy)
    ${whereClause}
    OPTIONAL MATCH (cs)<-[:HAS_CASE_STUDY]-(sf:Company:ServiceFirm)
    WITH cs, sf,
      [(cs)-[:DEMONSTRATES_SKILL]->(s:Skill) | s.name][0..8] AS skills,
      [(cs)-[:IN_INDUSTRY]->(i:Industry) | i.name][0..5] AS industries,
      size([(p:Person)-[:CONTRIBUTED_TO]->(cs) | 1]) AS contributorCount
    RETURN
      coalesce(cs.id, cs.legacyId) AS entityId,
      coalesce(cs.title, cs.summary, 'Case Study') AS displayName,
      sf.name AS firmName,
      skills,
      industries,
      contributorCount
    LIMIT $limit
  `;

  interface CaseStudyRow {
    entityId: string;
    displayName: string;
    firmName?: string;
    skills: string[];
    industries: string[];
    contributorCount: number;
  }

  const records = await neo4jRead<CaseStudyRow>(query, params);

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
    const structuredScore = maxScore > 0 ? score / maxScore : 0.3;

    const displayName = r.displayName?.length > 80
      ? r.displayName.slice(0, 77) + "…"
      : r.displayName;

    return {
      entityType: "case_study" as const,
      entityId: r.entityId,
      displayName,
      firmId: r.entityId,
      firmName: displayName,
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
        contributorCount: r.contributorCount,
      },
    };
  });
}
