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
import { structuredFilter, toMatchCandidates } from "./structured-filter";
import { vectorRerank } from "./vector-search";
import { deepRank } from "./deep-ranker";
import { loadAbstractionProfile } from "./abstraction-generator";
import type { SearchQuery, SearchResult, SearchFilters } from "./types";

/**
 * Execute a full cascading search.
 *
 * @param rawQuery - Natural language search query
 * @param searcherFirmId - The firm performing the search (for bidirectional matching)
 * @param explicitFilters - Optional explicit filters (override NL parsing)
 */
export async function executeSearch(params: {
  rawQuery: string;
  searcherFirmId?: string;
  explicitFilters?: Partial<SearchFilters>;
  skipLlmRanking?: boolean;
}): Promise<SearchResult> {
  const start = Date.now();
  const { rawQuery, searcherFirmId, explicitFilters, skipLlmRanking } = params;

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

  // Step 2: Layer 1 — Structured filtering (Neo4j)
  const structuredCandidates = await structuredFilter(filters, 500);
  const layer1Candidates = toMatchCandidates(structuredCandidates);

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

  return {
    query,
    candidates: finalCandidates,
    stats: {
      layer1Candidates: structuredCandidates.length,
      layer2Candidates: layer2Candidates.length,
      layer3Ranked: finalCandidates.length,
      totalDurationMs: durationMs,
      estimatedCostUsd,
    },
  };
}
