/**
 * Search Orchestrator — Three-Layer Cascading Search
 *
 * Orchestrates the full search pipeline:
 * 1. Parse query → structured filters
 * 2. Layer 1: Neo4j structured filtering (~500 candidates)
 * 3. Layer 2: Vector similarity re-ranking (~50 candidates)
 * 4. Layer 3: LLM deep ranking + explanations (~15 results)
 *
 * Target: <$0.10 per search, <3 seconds latency
 */

import { parseSearchQuery } from "./query-parser";
import { structuredFilter, bidirectionalStructuredFilter, toMatchCandidates } from "./structured-filter";
import { pgStructuredFilter } from "./pg-structured-filter";
import { vectorRerank } from "./vector-search";
import { deepRank } from "./deep-ranker";
import { loadAbstractionProfile } from "./abstraction-generator";
import type { SearchQuery, SearchResult, SearchFilters } from "./types";

// Default to PostgreSQL search.
// Neo4j legacy firms lack a consistent ID bridge to PostgreSQL service_firms,
// so Neo4j results return firmId=null and break the discover profile flow.
// Only opt into Neo4j explicitly via SEARCH_MODE=neo4j.
const USE_PG_SEARCH = process.env.SEARCH_MODE !== "neo4j";

/**
 * Execute a full cascading search.
 *
 * @param rawQuery - Natural language search query
 * @param searcherFirmId - The firm performing the search (for bidirectional matching)
 * @param explicitFilters - Optional explicit filters (override NL parsing)
 * @param debug - When true, include intermediate layer candidates in the result
 */
export async function executeSearch(params: {
  rawQuery: string;
  searcherFirmId?: string;
  explicitFilters?: Partial<SearchFilters>;
  skipLlmRanking?: boolean;
  debug?: boolean;
}): Promise<SearchResult> {
  const start = Date.now();
  const { rawQuery, searcherFirmId, explicitFilters, skipLlmRanking, debug } = params;

  // Step 1: Parse query into structured filters
  const parsedFilters = await parseSearchQuery(rawQuery);
  const filters: SearchFilters = {
    ...parsedFilters,
    ...explicitFilters, // Explicit filters override parsed ones
  };

  // Load searcher's profile for bidirectional matching
  const searcherProfile = searcherFirmId
    ? await loadAbstractionProfile(searcherFirmId)
    : null;

  const query: SearchQuery = {
    rawQuery,
    filters,
    searcherFirmId,
    searcherProfile: searcherProfile ?? undefined,
  };

  // Step 2: Layer 1 — Structured filtering (PostgreSQL or Neo4j)
  let layer1Candidates;
  let layer1Count: number;
  if (USE_PG_SEARCH) {
    layer1Candidates = await pgStructuredFilter(filters, 500, searcherFirmId);
    layer1Count = layer1Candidates.length;
  } else if (searcherFirmId) {
    // Neo4j with bidirectional matching: enriches filters from PREFERS edges
    // and boosts candidates with mutual preference fit
    const biCandidates = await bidirectionalStructuredFilter(filters, searcherFirmId, 500);
    layer1Candidates = toMatchCandidates(biCandidates);
    layer1Count = biCandidates.length;
  } else {
    const structuredCandidates = await structuredFilter(filters, 500);
    layer1Candidates = toMatchCandidates(structuredCandidates);
    layer1Count = structuredCandidates.length;
  }

  // Step 3: Layer 2 — Vector similarity re-ranking
  const layer2Candidates = await vectorRerank(
    layer1Candidates,
    rawQuery,
    50
  );

  // Step 4: Layer 3 — LLM deep ranking (optional, can skip for speed)
  let finalCandidates = layer2Candidates;
  if (!skipLlmRanking && layer2Candidates.length > 0) {
    finalCandidates = await deepRank({
      rawQuery,
      searcherProfile: searcherProfile ?? undefined,
      candidates: layer2Candidates,
      topK: 15,
    });
  }

  const durationMs = Date.now() - start;

  // Estimate cost
  const estimatedCostUsd =
    0.0001 + // Query parsing (Gemini Flash)
    0.0 + // Layer 1 (Neo4j, free)
    0.0 + // Layer 2 (pgvector, free; embedding ~$0.00002)
    (skipLlmRanking ? 0 : 0.005); // Layer 3 (Gemini Flash ~$0.005)

  const result: SearchResult = {
    query,
    candidates: finalCandidates,
    stats: {
      layer1Candidates: layer1Count,
      layer2Candidates: layer2Candidates.length,
      layer3Ranked: finalCandidates.length,
      totalDurationMs: durationMs,
      estimatedCostUsd,
    },
  };

  if (debug) {
    result.debugLayers = {
      layer1: { count: layer1Count, topCandidates: layer1Candidates.slice(0, 20) },
      layer2: { count: layer2Candidates.length, topCandidates: layer2Candidates.slice(0, 20) },
      layer3: { count: finalCandidates.length, results: finalCandidates },
      parsedFilters: filters,
    };
  }

  return result;
}
