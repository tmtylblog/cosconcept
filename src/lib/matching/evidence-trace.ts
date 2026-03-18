/**
 * Evidence Trace Module
 *
 * Queries Neo4j for the full evidence graph backing a partner match score.
 * Used by the admin partnership simulator to show WHERE each scoring
 * dimension's data came from — which case studies, experts, skills, etc.
 *
 * Also provides a data lineage comparison: what the scorer actually used
 * (PostgreSQL enrichmentData) vs what exists in Neo4j, exposing gaps
 * where the knowledge graph is NOT being leveraged.
 */

import { neo4jRead } from "@/lib/neo4j";
import {
  scorePartnerMatches,
  getFirmData,
  asArr,
  fuzzyMatch,
  getSymbioticRelationships,
  type FirmWithPrefs,
  type ScoreBreakdown,
  type GraphSignals,
  type GraphPrefEdge,
} from "./partner-scoring";

// ─── Types ──────────────────────────────────────────────────

export interface EvidenceSkill {
  name: string;
  caseStudyCount: number;
  expertCount: number;
  confidence: number;
  strength: string | null;
  level: string | null;
  parentSkill: string | null;
}

export interface EvidenceCaseStudy {
  title: string;
  id: string;
  skills: string[];
  industries: string[];
  clients: string[];
  outcomes: string[];
}

export interface EvidenceExpert {
  name: string;
  headline: string;
  skills: string[];
  industries: string[];
  previousCompanies: string[];
}

export interface EvidenceService {
  name: string;
  evidenceCount: number;
  caseStudyCount: number;
  expertCount: number;
  websiteMentionCount: number;
  source: string | null;
}

export interface EvidenceIndustry {
  name: string;
  source: "case_study" | "serves_industry" | "classification";
  fromCaseStudies: string[];
  confidence: number | null;
  level: string | null;
}

export interface CandidateGraph {
  skills: EvidenceSkill[];
  services: EvidenceService[];
  caseStudies: EvidenceCaseStudy[];
  experts: EvidenceExpert[];
  categories: string[];
  markets: string[];
  clients: string[];
  industries: EvidenceIndustry[];
}

export interface DataLineage {
  /** What the scorer actually read from PostgreSQL enrichmentData */
  scorerUsed: {
    services: string[];
    skills: string[];
    industries: string[];
    markets: string[];
    categories: string[];
    source: "confirmed" | "classification" | "extracted";
  };
  /** What exists in Neo4j knowledge graph */
  neo4jHas: {
    skills: number;
    services: number;
    caseStudies: number;
    experts: number;
    industries: number;
    markets: number;
    clients: number;
    prefEdges: number;
  };
  /** Data in Neo4j that the scorer did NOT use */
  notUsedByScorer: {
    neo4jOnlySkills: string[];
    neo4jOnlyServices: string[];
    neo4jOnlyIndustries: string[];
    neo4jOnlyMarkets: string[];
    caseStudySkillsNotInPg: string[];
    expertSkillsNotInPg: string[];
  };
  /** Specific gaps / warnings */
  warnings: string[];
}

export interface CapGapMatch {
  gap: string;
  matchedBy: "service" | "skill";
  matchedValue: string;
  evidence: {
    caseStudies: Array<{ title: string; id: string }>;
    experts: Array<{ name: string; headline: string }>;
    confidence: number;
    graphSkill: EvidenceSkill | null;
  };
}

export interface EvidenceTrace {
  scoreBreakdown: ScoreBreakdown;
  dataLineage: DataLineage;
  dimensions: {
    capabilityGapMatch: {
      score: number;
      maxScore: 30;
      userGaps: string[];
      matches: CapGapMatch[];
      unmatched: string[];
    };
    reverseMatch: {
      score: number;
      maxScore: 20;
      candidateGaps: string[];
      matches: Array<{
        gap: string;
        matchedBy: "service" | "skill";
        matchedValue: string;
      }>;
    };
    firmTypePreference: {
      score: number;
      maxScore: 20;
      userPreferredTypes: string[];
      candidateCategory: string;
      forwardMatch: boolean;
      reverseMatch: boolean;
      candidatePreferredTypes: string[];
      sourceCategory: string;
      neo4jCategories: string[];
    };
    geographyOverlap: {
      score: number;
      maxScore: 10;
      userPreference: string;
      candidateMarkets: string[];
      neo4jMarkets: string[];
      matched: boolean;
    };
    symbioticBonus: {
      score: number;
      maxScore: 10;
      relationship: { typeA: string; typeB: string; nature: string } | null;
    };
    dealBreakerPenalty: {
      score: number;
      userDealBreaker: string;
      triggered: boolean;
      matchedIn: string | null;
    };
    industryOverlap: {
      score: number;
      maxScore: 5;
      userIndustries: string[];
      candidateIndustries: EvidenceIndustry[];
      matched: string[];
      scorerUsedIndustries: string[];
    };
    dataRichness: {
      score: number;
      maxScore: 5;
      serviceCount: number;
      skillCount: number;
      industryCount: number;
      neo4jServiceCount: number;
      neo4jSkillCount: number;
      neo4jIndustryCount: number;
      neo4jCaseStudyCount: number;
      neo4jExpertCount: number;
    };
    preferenceCompleteness: {
      score: number;
      maxScore: 10;
      hasCapGaps: boolean;
      hasPrefTypes: boolean;
      prefEdges: Array<{ dimension: string; target: string; weight: number }>;
    };
  };
  candidateGraph: CandidateGraph;
}

// ─── Neo4j Queries ──────────────────────────────────────────

async function queryFirmGraph(firmId: string): Promise<CandidateGraph> {
  const [
    skills,
    services,
    caseStudies,
    experts,
    servesIndustries,
    csIndustries,
    categories,
    markets,
    clients,
  ] = await Promise.all([
    // Skills with evidence + hierarchy
    neo4jRead<{
      name: string;
      caseStudyCount: number;
      expertCount: number;
      confidence: number;
      strength: string | null;
      level: string | null;
      parentSkill: string | null;
    }>(
      `MATCH (f:Company:ServiceFirm {id: $firmId})-[hs:HAS_SKILL]->(s:Skill)
       OPTIONAL MATCH (s)-[:BELONGS_TO]->(parent:Skill)
       RETURN s.name AS name,
              coalesce(hs.caseStudyCount, 0) AS caseStudyCount,
              coalesce(hs.expertCount, 0) AS expertCount,
              coalesce(hs.confidence, 0) AS confidence,
              hs.strength AS strength,
              s.level AS level,
              parent.name AS parentSkill`,
      { firmId }
    ),

    // Services via OFFERS_SERVICE
    neo4jRead<{
      name: string;
      evidenceCount: number;
      caseStudyCount: number;
      expertCount: number;
      websiteMentionCount: number;
      source: string | null;
    }>(
      `MATCH (f:Company:ServiceFirm {id: $firmId})-[os:OFFERS_SERVICE]->(s:Service)
       RETURN s.name AS name,
              coalesce(os.evidenceCount, 0) AS evidenceCount,
              coalesce(os.caseStudyCount, 0) AS caseStudyCount,
              coalesce(os.expertCount, 0) AS expertCount,
              coalesce(os.websiteMentionCount, 0) AS websiteMentionCount,
              os.source AS source`,
      { firmId }
    ),

    // Case studies with skills, industries, clients, outcomes
    neo4jRead<{
      title: string;
      id: string;
      skills: string[];
      industries: string[];
      clients: string[];
      outcomes: string[];
    }>(
      `MATCH (f:Company:ServiceFirm {id: $firmId})-[:HAS_CASE_STUDY]->(cs:CaseStudy)
       OPTIONAL MATCH (cs)-[:DEMONSTRATES_SKILL]->(s:Skill)
       OPTIONAL MATCH (cs)-[:IN_INDUSTRY]->(i:Industry)
       OPTIONAL MATCH (cs)-[:FOR_CLIENT]->(cl:Company)
       WITH cs,
            collect(DISTINCT s.name) AS skills,
            collect(DISTINCT i.name) AS industries,
            collect(DISTINCT cl.name) AS clients
       RETURN cs.title AS title, cs.id AS id, skills, industries, clients,
              coalesce(cs.outcomes, []) AS outcomes`,
      { firmId }
    ),

    // Experts with expertise, industries, and work history
    neo4jRead<{
      name: string;
      headline: string;
      skills: string[];
      industries: string[];
      previousCompanies: string[];
    }>(
      `MATCH (f:Company:ServiceFirm {id: $firmId})<-[:CURRENTLY_AT]-(p:Person)
       OPTIONAL MATCH (p)-[:HAS_SKILL|HAS_EXPERTISE]->(s:Skill)
       OPTIONAL MATCH (p)-[:SERVES_INDUSTRY]->(i:Industry)
       OPTIONAL MATCH (p)-[:HAS_WORK_HISTORY]->(:WorkHistory)-[:WORKED_AT]->(prev:Company)
       WHERE prev.id <> $firmId
       WITH p,
            collect(DISTINCT s.name) AS skills,
            collect(DISTINCT i.name) AS industries,
            collect(DISTINCT prev.name) AS previousCompanies
       RETURN p.fullName AS name,
              coalesce(p.headline, '') AS headline,
              skills, industries, previousCompanies`,
      { firmId }
    ),

    // Industries via SERVES_INDUSTRY (direct edges, not case-study-derived)
    neo4jRead<{
      name: string;
      confidence: number | null;
      level: string | null;
    }>(
      `MATCH (f:Company:ServiceFirm {id: $firmId})-[si:SERVES_INDUSTRY]->(i:Industry)
       RETURN i.name AS name, si.confidence AS confidence, i.level AS level`,
      { firmId }
    ),

    // Industries from case studies (transitive)
    neo4jRead<{
      name: string;
      fromCaseStudies: string[];
    }>(
      `MATCH (f:Company:ServiceFirm {id: $firmId})-[:HAS_CASE_STUDY]->(cs:CaseStudy)-[:IN_INDUSTRY]->(i:Industry)
       WITH i, collect(DISTINCT cs.title) AS fromCaseStudies
       RETURN i.name AS name, fromCaseStudies`,
      { firmId }
    ),

    // Categories
    neo4jRead<{ name: string }>(
      `MATCH (f:Company:ServiceFirm {id: $firmId})-[:IN_CATEGORY]->(c)
       RETURN c.name AS name`,
      { firmId }
    ),

    // Markets
    neo4jRead<{ name: string }>(
      `MATCH (f:Company:ServiceFirm {id: $firmId})-[:OPERATES_IN]->(m:Market)
       RETURN m.name AS name`,
      { firmId }
    ),

    // Clients
    neo4jRead<{ name: string }>(
      `MATCH (f:Company:ServiceFirm {id: $firmId})-[:HAS_CLIENT]->(cl:Company)
       RETURN cl.name AS name`,
      { firmId }
    ),
  ]);

  // Build unified industries list
  const industriesMap = new Map<string, EvidenceIndustry>();

  for (const si of servesIndustries) {
    industriesMap.set(si.name, {
      name: si.name,
      source: "serves_industry",
      fromCaseStudies: [],
      confidence: si.confidence ? toNumber(si.confidence) : null,
      level: si.level,
    });
  }

  for (const ci of csIndustries) {
    const existing = industriesMap.get(ci.name);
    if (existing) {
      existing.fromCaseStudies = ci.fromCaseStudies;
    } else {
      industriesMap.set(ci.name, {
        name: ci.name,
        source: "case_study",
        fromCaseStudies: ci.fromCaseStudies,
        confidence: null,
        level: null,
      });
    }
  }

  return {
    skills: skills.map((s) => ({
      name: s.name,
      caseStudyCount: toNumber(s.caseStudyCount),
      expertCount: toNumber(s.expertCount),
      confidence: toNumber(s.confidence),
      strength: s.strength,
      level: s.level,
      parentSkill: s.parentSkill,
    })),
    services: services.map((s) => ({
      name: s.name,
      evidenceCount: toNumber(s.evidenceCount),
      caseStudyCount: toNumber(s.caseStudyCount),
      expertCount: toNumber(s.expertCount),
      websiteMentionCount: toNumber(s.websiteMentionCount),
      source: s.source,
    })),
    caseStudies: caseStudies.map((cs) => ({
      title: cs.title,
      id: cs.id,
      skills: cs.skills.filter(Boolean),
      industries: cs.industries.filter(Boolean),
      clients: cs.clients.filter(Boolean),
      outcomes: (cs.outcomes ?? []).filter(Boolean),
    })),
    experts: experts.map((e) => ({
      name: e.name,
      headline: e.headline,
      skills: e.skills.filter(Boolean),
      industries: e.industries.filter(Boolean),
      previousCompanies: e.previousCompanies.filter(Boolean),
    })),
    categories: categories.map((c) => c.name),
    markets: markets.map((m) => m.name),
    clients: clients.map((c) => c.name),
    industries: Array.from(industriesMap.values()),
  };
}

/** Neo4j integers sometimes come as objects with .low/.high */
function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && "low" in v) return (v as { low: number }).low;
  return 0;
}

async function queryPrefEdges(
  firmId: string
): Promise<Array<{ dimension: string; target: string; weight: number }>> {
  const rows = await neo4jRead<{
    dimension: string;
    target: string;
    weight: number;
  }>(
    `MATCH (f:Company:ServiceFirm {id: $firmId})-[p:PREFERS]->(t)
     RETURN p.dimension AS dimension, t.name AS target, coalesce(p.weight, 1.0) AS weight`,
    { firmId }
  );
  return rows.map((r) => ({
    dimension: r.dimension,
    target: r.target,
    weight: toNumber(r.weight),
  }));
}

// ─── Data Lineage Builder ───────────────────────────────────

function buildDataLineage(
  cEnrichment: Record<string, unknown>,
  candidateGraph: CandidateGraph,
  prefEdges: Array<{ dimension: string; target: string; weight: number }>
): DataLineage {
  const confirmed = (cEnrichment.confirmed as Record<string, unknown>) ?? {};
  const classification = (cEnrichment.classification as Record<string, unknown>) ?? {};
  const extracted = (cEnrichment.extracted as Record<string, unknown>) ?? {};

  // Determine which source the scorer actually used per field
  const confirmedServices = asArr(confirmed.services);
  const extractedServices = asArr(extracted.services);
  const confirmedSkills = asArr(confirmed.skills);
  const classifiedSkills = asArr(classification.skills);
  const confirmedIndustries = asArr(confirmed.industries);
  const classifiedIndustries = asArr(classification.industries);
  const confirmedMarkets = asArr(confirmed.markets);
  const classifiedMarkets = asArr(classification.markets);
  const confirmedCat = confirmed.firmCategory ? [String(confirmed.firmCategory)] : [];
  const classifiedCats = asArr(classification.categories);

  const pgServices = confirmedServices.length > 0 ? confirmedServices : extractedServices;
  const pgSkills = confirmedSkills.length > 0 ? confirmedSkills : classifiedSkills;
  const pgIndustries = confirmedIndustries.length > 0 ? confirmedIndustries : classifiedIndustries;
  const pgMarkets = confirmedMarkets.length > 0 ? confirmedMarkets : classifiedMarkets;
  const pgCategories = confirmedCat.length > 0 ? confirmedCat : classifiedCats;

  const source = confirmedServices.length > 0 || confirmedSkills.length > 0
    ? "confirmed" as const
    : classifiedSkills.length > 0
      ? "classification" as const
      : "extracted" as const;

  // Neo4j data
  const neo4jSkillNames = candidateGraph.skills.map((s) => s.name);
  const neo4jServiceNames = candidateGraph.services.map((s) => s.name);
  const neo4jIndustryNames = candidateGraph.industries.map((i) => i.name);
  const neo4jMarketNames = candidateGraph.markets;

  // Skills from case studies and experts that aren't directly in PG
  const csSkills = new Set<string>();
  for (const cs of candidateGraph.caseStudies) {
    for (const sk of cs.skills) csSkills.add(sk);
  }
  const expertSkills = new Set<string>();
  for (const exp of candidateGraph.experts) {
    for (const sk of exp.skills) expertSkills.add(sk);
  }

  const pgSkillsLower = new Set(pgSkills.map((s) => s.toLowerCase()));

  const neo4jOnlySkills = neo4jSkillNames.filter(
    (s) => !pgSkillsLower.has(s.toLowerCase()) && !pgSkills.some((ps) => fuzzyMatch(ps, s))
  );
  const neo4jOnlyServices = neo4jServiceNames.filter(
    (s) => !pgServices.some((ps) => fuzzyMatch(ps, s))
  );
  const neo4jOnlyIndustries = neo4jIndustryNames.filter(
    (i) => !pgIndustries.some((pi) => fuzzyMatch(pi, i))
  );
  const neo4jOnlyMarkets = neo4jMarketNames.filter(
    (m) => !pgMarkets.some((pm) => fuzzyMatch(pm, m))
  );
  const csSkillsNotInPg = [...csSkills].filter(
    (s) => !pgSkillsLower.has(s.toLowerCase()) && !pgSkills.some((ps) => fuzzyMatch(ps, s))
  );
  const expertSkillsNotInPg = [...expertSkills].filter(
    (s) => !pgSkillsLower.has(s.toLowerCase()) && !pgSkills.some((ps) => fuzzyMatch(ps, s))
  );

  // Build warnings
  const warnings: string[] = [];
  if (candidateGraph.skills.length > 0 && pgSkills.length === 0) {
    warnings.push("Neo4j has HAS_SKILL edges but PG enrichmentData has zero skills — scorer sees nothing");
  }
  if (candidateGraph.services.length > 0 && pgServices.length === 0) {
    warnings.push("Neo4j has OFFERS_SERVICE edges but PG enrichmentData has zero services — scorer sees nothing");
  }
  if (neo4jOnlySkills.length > pgSkills.length) {
    warnings.push(`${neo4jOnlySkills.length} skills in Neo4j are invisible to the scorer (only reads PG enrichmentData)`);
  }
  if (candidateGraph.caseStudies.length > 0 && candidateGraph.caseStudies.every((cs) => cs.skills.length === 0)) {
    warnings.push("Case studies exist but none have DEMONSTRATES_SKILL edges — no skill evidence chain");
  }
  if (candidateGraph.experts.length > 0 && candidateGraph.experts.every((e) => e.skills.length === 0)) {
    warnings.push("Experts exist but none have HAS_SKILL/HAS_EXPERTISE edges — no expert skill evidence");
  }
  if (candidateGraph.industries.length === 0 && pgIndustries.length > 0) {
    warnings.push("Industries only exist in PG classification — no SERVES_INDUSTRY or case study IN_INDUSTRY edges in Neo4j");
  }
  if (prefEdges.length === 0) {
    warnings.push("No PREFERS edges in Neo4j — bidirectional matching cannot use graph preferences");
  }
  const totalNeo4j = candidateGraph.skills.length + candidateGraph.services.length +
    candidateGraph.caseStudies.length + candidateGraph.experts.length;
  if (totalNeo4j === 0) {
    warnings.push("ZERO data in Neo4j for this firm — scoring is 100% from PG enrichmentData JSONB blob");
  }

  return {
    scorerUsed: {
      services: pgServices,
      skills: pgSkills,
      industries: pgIndustries,
      markets: pgMarkets,
      categories: pgCategories,
      source,
    },
    neo4jHas: {
      skills: candidateGraph.skills.length,
      services: candidateGraph.services.length,
      caseStudies: candidateGraph.caseStudies.length,
      experts: candidateGraph.experts.length,
      industries: candidateGraph.industries.length,
      markets: candidateGraph.markets.length,
      clients: candidateGraph.clients.length,
      prefEdges: prefEdges.length,
    },
    notUsedByScorer: {
      neo4jOnlySkills,
      neo4jOnlyServices,
      neo4jOnlyIndustries,
      neo4jOnlyMarkets,
      caseStudySkillsNotInPg: csSkillsNotInPg,
      expertSkillsNotInPg,
    },
    warnings,
  };
}

// ─── Evidence Builder ───────────────────────────────────────

function findMatchEvidence(
  gap: string,
  candidateGraph: CandidateGraph,
  cServices: string[],
  cSkills: string[]
): CapGapMatch | null {
  // Check services first
  const matchedService = cServices.find((s) => fuzzyMatch(s, gap));
  if (matchedService) {
    const relatedSkills = candidateGraph.skills.filter((sk) =>
      fuzzyMatch(sk.name, matchedService)
    );
    const relatedCS = candidateGraph.caseStudies.filter((cs) =>
      cs.skills.some((sk) => fuzzyMatch(sk, matchedService) || fuzzyMatch(sk, gap))
    );
    const relatedExperts = candidateGraph.experts.filter((e) =>
      e.skills.some((sk) => fuzzyMatch(sk, matchedService) || fuzzyMatch(sk, gap))
    );
    return {
      gap,
      matchedBy: "service",
      matchedValue: matchedService,
      evidence: {
        caseStudies: relatedCS.map((cs) => ({ title: cs.title, id: cs.id })),
        experts: relatedExperts.map((e) => ({ name: e.name, headline: e.headline })),
        confidence: relatedSkills[0]?.confidence ?? 0,
        graphSkill: relatedSkills[0] ?? null,
      },
    };
  }

  // Check skills
  const matchedSkill = cSkills.find((s) => fuzzyMatch(s, gap));
  if (matchedSkill) {
    const graphSkill = candidateGraph.skills.find((sk) => fuzzyMatch(sk.name, matchedSkill));
    const relatedCS = candidateGraph.caseStudies.filter((cs) =>
      cs.skills.some((sk) => fuzzyMatch(sk, matchedSkill))
    );
    const relatedExperts = candidateGraph.experts.filter((e) =>
      e.skills.some((sk) => fuzzyMatch(sk, matchedSkill))
    );
    return {
      gap,
      matchedBy: "skill",
      matchedValue: matchedSkill,
      evidence: {
        caseStudies: relatedCS.map((cs) => ({ title: cs.title, id: cs.id })),
        experts: relatedExperts.map((e) => ({ name: e.name, headline: e.headline })),
        confidence: graphSkill?.confidence ?? 0,
        graphSkill: graphSkill ?? null,
      },
    };
  }

  return null;
}

// ─── Main Export ─────────────────────────────────────────────

export async function getEvidenceTrace(
  sourceFirm: {
    id: string;
    name: string;
    firmType: string | null;
    enrichmentData: Record<string, unknown>;
  },
  candidate: FirmWithPrefs,
  preferences: Record<string, unknown>
): Promise<EvidenceTrace> {
  // 1. Query Neo4j for candidate graph + preference edges FIRST
  const [candidateGraph, prefEdges] = await Promise.all([
    queryFirmGraph(candidate.id),
    queryPrefEdges(candidate.id),
  ]);

  // 2. Convert graph data to GraphSignals for the scorer
  const graphSignals: GraphSignals = {
    skills: candidateGraph.skills.map((s) => ({
      name: s.name,
      csCount: s.caseStudyCount,
      expCount: s.expertCount,
      conf: s.confidence,
    })),
    services: candidateGraph.services.map((s) => ({
      name: s.name,
      csCount: s.caseStudyCount,
      expCount: s.expertCount,
    })),
    caseStudyCount: candidateGraph.caseStudies.length,
    industries: candidateGraph.industries.map((i) => i.name),
    markets: candidateGraph.markets,
    categories: candidateGraph.categories,
    expertCount: candidateGraph.experts.length,
    expertSkills: [...new Set(candidateGraph.experts.flatMap((e) => e.skills))],
  };
  const graphPrefEdges: GraphPrefEdge[] = prefEdges.map((pe) => ({
    dim: pe.dimension,
    target: pe.target,
    weight: pe.weight,
  }));

  const graphData = new Map<string, GraphSignals>();
  graphData.set(candidate.id, graphSignals);
  const graphPrefs = new Map<string, GraphPrefEdge[]>();
  if (graphPrefEdges.length > 0) graphPrefs.set(candidate.id, graphPrefEdges);

  // 3. Run scoring with graph-enhanced signals
  const [scored] = scorePartnerMatches({
    sourceFirm,
    preferences,
    candidates: [candidate],
    graphData,
    graphPrefs,
  });

  const breakdown = scored.scoreBreakdown;

  // 3. Extract data for cross-referencing
  const sourceData = getFirmData(sourceFirm.enrichmentData);
  const cEnrichment = candidate.enrichmentData ?? {};
  const cData = getFirmData(cEnrichment);

  // 4. Build data lineage comparison
  const dataLineage = buildDataLineage(cEnrichment, candidateGraph, prefEdges);

  const userCapGaps = asArr(preferences.capabilityGaps);
  const userPrefTypes = asArr(preferences.preferredPartnerTypes);
  const userGeo = String(preferences.geographyPreference ?? "").toLowerCase();
  const userDealBreaker = String(preferences.dealBreaker ?? "").toLowerCase();
  const userCategory = (
    sourceData.categories[0] ?? String(sourceFirm.firmType ?? "")
  ).toLowerCase();
  const cCategory = (
    cData.categories[0] ?? String(candidate.firmType ?? "")
  ).toLowerCase();
  const cCapGaps = asArr(candidate.prefs.capabilityGaps);
  const cPrefTypes = asArr(candidate.prefs.preferredPartnerTypes);

  // 5. Build per-dimension evidence

  // Capability gap match
  const capGapMatches: CapGapMatch[] = [];
  const unmatchedGaps: string[] = [];
  for (const gap of userCapGaps) {
    const evidence = findMatchEvidence(gap, candidateGraph, scored.cServices, scored.cSkills);
    if (evidence) {
      capGapMatches.push(evidence);
    } else {
      unmatchedGaps.push(gap);
    }
  }

  // Reverse match
  const reverseMatches: Array<{ gap: string; matchedBy: "service" | "skill"; matchedValue: string }> = [];
  for (const gap of cCapGaps) {
    const matchedService = sourceData.services.find((s) => fuzzyMatch(s, gap));
    if (matchedService) {
      reverseMatches.push({ gap, matchedBy: "service", matchedValue: matchedService });
      continue;
    }
    const matchedSkill = sourceData.skills.find((s) => fuzzyMatch(s, gap));
    if (matchedSkill) {
      reverseMatches.push({ gap, matchedBy: "skill", matchedValue: matchedSkill });
    }
  }

  // Firm type
  const forwardTypeMatch = userPrefTypes.length > 0 && cCategory
    ? userPrefTypes.some((t) => fuzzyMatch(cCategory, t))
    : false;
  const reverseTypeMatch = cPrefTypes.length > 0 && userCategory
    ? cPrefTypes.some((t) => fuzzyMatch(userCategory, t))
    : false;

  // Geography
  const cMarkets = cData.markets;
  const geoMatched = userGeo && cMarkets.length > 0
    ? cMarkets.some((m) => fuzzyMatch(m, userGeo))
    : false;

  // Symbiotic
  const relationships = getSymbioticRelationships();
  let symbioticRel: { typeA: string; typeB: string; nature: string } | null = null;
  if (userCategory && cCategory) {
    const rel = relationships.find(
      (r) =>
        (fuzzyMatch(r.typeA, userCategory) && fuzzyMatch(r.typeB, cCategory)) ||
        (fuzzyMatch(r.typeA, cCategory) && fuzzyMatch(r.typeB, userCategory))
    );
    if (rel) symbioticRel = rel;
  }

  // Deal breaker
  let dealBreakerTriggered = false;
  let dealBreakerMatchedIn: string | null = null;
  if (userDealBreaker) {
    const desc = (candidate.description ?? "").toLowerCase();
    if (cCategory.includes(userDealBreaker)) {
      dealBreakerTriggered = true;
      dealBreakerMatchedIn = "category";
    } else if (scored.cServices.some((s) => s.toLowerCase().includes(userDealBreaker))) {
      dealBreakerTriggered = true;
      dealBreakerMatchedIn = "services";
    } else if (desc.includes(userDealBreaker)) {
      dealBreakerTriggered = true;
      dealBreakerMatchedIn = "description";
    }
  }

  // Industry overlap — merge ALL sources
  const userIndustries = sourceData.industries;
  const allCandidateIndustries: EvidenceIndustry[] = [...candidateGraph.industries];
  for (const ci of cData.industries) {
    if (!allCandidateIndustries.some((i) => fuzzyMatch(i.name, ci))) {
      allCandidateIndustries.push({
        name: ci,
        source: "classification",
        fromCaseStudies: [],
        confidence: null,
        level: null,
      });
    }
  }
  const matchedIndustries = userIndustries.filter((ui) =>
    allCandidateIndustries.some((ci) => fuzzyMatch(ci.name, ui))
  );

  return {
    scoreBreakdown: breakdown,
    dataLineage,
    dimensions: {
      capabilityGapMatch: {
        score: breakdown.capabilityGapMatch,
        maxScore: 30,
        userGaps: userCapGaps,
        matches: capGapMatches,
        unmatched: unmatchedGaps,
      },
      reverseMatch: {
        score: breakdown.reverseMatch,
        maxScore: 20,
        candidateGaps: cCapGaps,
        matches: reverseMatches,
      },
      firmTypePreference: {
        score: breakdown.firmTypePreference,
        maxScore: 20,
        userPreferredTypes: userPrefTypes,
        candidateCategory: cCategory,
        forwardMatch: forwardTypeMatch,
        reverseMatch: reverseTypeMatch,
        candidatePreferredTypes: cPrefTypes,
        sourceCategory: userCategory,
        neo4jCategories: candidateGraph.categories,
      },
      geographyOverlap: {
        score: breakdown.geographyOverlap,
        maxScore: 10,
        userPreference: userGeo,
        candidateMarkets: cMarkets,
        neo4jMarkets: candidateGraph.markets,
        matched: geoMatched,
      },
      symbioticBonus: {
        score: breakdown.symbioticBonus,
        maxScore: 10,
        relationship: symbioticRel,
      },
      dealBreakerPenalty: {
        score: breakdown.dealBreakerPenalty,
        userDealBreaker,
        triggered: dealBreakerTriggered,
        matchedIn: dealBreakerMatchedIn,
      },
      industryOverlap: {
        score: breakdown.industryOverlap,
        maxScore: 5,
        userIndustries,
        candidateIndustries: allCandidateIndustries,
        matched: matchedIndustries,
        scorerUsedIndustries: cData.industries,
      },
      dataRichness: {
        score: breakdown.dataRichness,
        maxScore: 5,
        serviceCount: scored.cServices.length,
        skillCount: scored.cSkills.length,
        industryCount: cData.industries.length,
        neo4jServiceCount: candidateGraph.services.length,
        neo4jSkillCount: candidateGraph.skills.length,
        neo4jIndustryCount: candidateGraph.industries.length,
        neo4jCaseStudyCount: candidateGraph.caseStudies.length,
        neo4jExpertCount: candidateGraph.experts.length,
      },
      preferenceCompleteness: {
        score: breakdown.preferenceCompleteness,
        maxScore: 10,
        hasCapGaps: cCapGaps.length > 0,
        hasPrefTypes: cPrefTypes.length > 0,
        prefEdges,
      },
    },
    candidateGraph,
  };
}
