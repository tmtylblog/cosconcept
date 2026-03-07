/**
 * Layer 1: Structured Filtering
 *
 * Uses Neo4j graph queries + PostgreSQL to narrow 1.5M firms
 * down to ~500 candidates. This eliminates 99% before expensive
 * vector search and LLM ranking.
 *
 * Query strategy:
 * 1. Neo4j for relationship-based filtering (skills, industries, markets)
 * 2. PostgreSQL for firmographic filtering (size, status)
 */

import { neo4jRead } from "@/lib/neo4j";
import type { SearchFilters, MatchCandidate } from "./types";

interface StructuredCandidate {
  firmId: string;
  firmName: string;
  website?: string;
  categories: string[];
  matchedSkills: string[];
  matchedIndustries: string[];
  matchedMarkets: string[];
  structuredScore: number;
}

/**
 * Layer 1: Filter firms using Neo4j graph traversal.
 *
 * Returns ~500 candidates with structured match scores.
 * Score is based on how many filter criteria each firm matches.
 */
export async function structuredFilter(
  filters: SearchFilters,
  limit = 500
): Promise<StructuredCandidate[]> {
  // Build dynamic Cypher query based on which filters are provided
  const conditions: string[] = [];
  const params: Record<string, unknown> = { limit };

  // Base: match all firms
  const matchClause = "MATCH (f:ServiceFirm)";
  const returnFields = [
    "f.id AS firmId",
    "f.name AS firmName",
    "f.website AS website",
  ];

  // Skills filter
  if (filters.skills?.length) {
    conditions.push(
      `EXISTS {
        MATCH (f)-[:HAS_SKILL]->(s:Skill)
        WHERE s.name IN $skills
      }`
    );
    params.skills = filters.skills;

    // Also collect matched skills for scoring
    returnFields.push(
      `[(f)-[:HAS_SKILL]->(s:Skill) WHERE s.name IN $skills | s.name] AS matchedSkills`
    );
  } else {
    returnFields.push("[] AS matchedSkills");
  }

  // Category filter
  if (filters.categories?.length) {
    conditions.push(
      `EXISTS {
        MATCH (f)-[:IN_CATEGORY]->(c:Category)
        WHERE c.name IN $categories
      }`
    );
    params.categories = filters.categories;
    returnFields.push(
      `[(f)-[:IN_CATEGORY]->(c:Category) | c.name] AS categories`
    );
  } else {
    returnFields.push(
      `[(f)-[:IN_CATEGORY]->(c:Category) | c.name] AS categories`
    );
  }

  // Industry filter
  if (filters.industries?.length) {
    conditions.push(
      `EXISTS {
        MATCH (f)-[:SERVES_INDUSTRY]->(i:Industry)
        WHERE i.name IN $industries
      }`
    );
    params.industries = filters.industries;
    returnFields.push(
      `[(f)-[:SERVES_INDUSTRY]->(i:Industry) WHERE i.name IN $industries | i.name] AS matchedIndustries`
    );
  } else {
    returnFields.push("[] AS matchedIndustries");
  }

  // Market filter
  if (filters.markets?.length) {
    conditions.push(
      `EXISTS {
        MATCH (f)-[:OPERATES_IN]->(m:Market)
        WHERE m.name IN $markets
      }`
    );
    params.markets = filters.markets;
    returnFields.push(
      `[(f)-[:OPERATES_IN]->(m:Market) WHERE m.name IN $markets | m.name] AS matchedMarkets`
    );
  } else {
    returnFields.push("[] AS matchedMarkets");
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const query = `
    ${matchClause}
    ${whereClause}
    RETURN ${returnFields.join(", ")}
    LIMIT $limit
  `;

  interface Neo4jFirmRow {
    firmId: string;
    firmName: string;
    website?: string;
    matchedSkills?: string[];
    matchedIndustries?: string[];
    matchedMarkets?: string[];
    categories?: string[];
  }

  const records = await neo4jRead<Neo4jFirmRow>(query, params);

  // Calculate structured match scores
  const candidates: StructuredCandidate[] = records.map((record) => {
    const matchedSkills: string[] = record.matchedSkills ?? [];
    const matchedIndustries: string[] = record.matchedIndustries ?? [];
    const matchedMarkets: string[] = record.matchedMarkets ?? [];
    const categories: string[] = record.categories ?? [];

    // Score based on how many criteria matched
    let score = 0;
    let maxScore = 0;

    if (filters.skills?.length) {
      score += matchedSkills.length / filters.skills.length;
      maxScore += 1;
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

    const structuredScore = maxScore > 0 ? score / maxScore : 0.5;

    return {
      firmId: record.firmId,
      firmName: record.firmName,
      website: record.website,
      categories,
      matchedSkills,
      matchedIndustries,
      matchedMarkets,
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
    firmId: c.firmId,
    firmName: c.firmName,
    totalScore: c.structuredScore,
    structuredScore: c.structuredScore,
    vectorScore: 0,
    preview: {
      categories: c.categories,
      topServices: [],
      topSkills: c.matchedSkills,
      industries: c.matchedIndustries,
      website: c.website,
    },
  }));
}
