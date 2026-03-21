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
import { structuredFilter, bidirectionalStructuredFilter, toMatchCandidates, universalStructuredFilter, enrichWithConnectedEntities } from "./structured-filter";
import { pgStructuredFilter } from "./pg-structured-filter";
import { vectorRerank } from "./vector-search";
import { deepRank } from "./deep-ranker";
import { loadAbstractionProfile } from "./abstraction-generator";
import type { SearchQuery, SearchResult, SearchFilters } from "./types";

// Search mode: "pg" for PostgreSQL-only, "neo4j" for graph-based Layer 1.
// After running scripts/sync-neo4j-firm-ids.ts, all Neo4j nodes have valid f.id
// matching PG serviceFirms.id, so Neo4j path is safe to use.
// Falls back to PG if Neo4j query fails.
const USE_PG_SEARCH = process.env.SEARCH_MODE === "pg";

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

  console.warn("[Search] mode=%s query=%s filters=%j", USE_PG_SEARCH ? "pg" : "neo4j", rawQuery.slice(0, 60), Object.keys(filters));

  // Step 2: Layer 1 — Structured filtering (PostgreSQL or Neo4j)
  let layer1Candidates;
  let layer1Count: number;
  let layer1Source: "neo4j" | "pg" = USE_PG_SEARCH ? "pg" : "neo4j";
  if (USE_PG_SEARCH) {
    layer1Candidates = await pgStructuredFilter(filters, 500, searcherFirmId);
    layer1Count = layer1Candidates.length;
  } else {
    // Neo4j-based Layer 1 with PG fallback on failure
    try {
      if (searcherFirmId) {
        // Neo4j with bidirectional matching: enriches filters from PREFERS edges
        // and boosts candidates with mutual preference fit
        const biCandidates = await bidirectionalStructuredFilter(filters, searcherFirmId, 500);
        layer1Candidates = toMatchCandidates(biCandidates);
        layer1Count = biCandidates.length;
      } else {
        layer1Candidates = await universalStructuredFilter(filters, 500);
        layer1Count = layer1Candidates.length;
      }
      console.warn("[Search] Neo4j Layer 1 returned %d candidates", layer1Count);
      // Safety net: if Neo4j returned 0, fall back to PG firms so we never return empty
      if (layer1Count === 0) {
        console.warn("[Search] Neo4j returned 0, falling back to PG firms");
        layer1Candidates = await pgStructuredFilter(filters, 500, searcherFirmId);
        layer1Count = layer1Candidates.length;
        layer1Source = "pg";
      }
    } catch (neo4jErr) {
      console.error("[Search] Neo4j Layer 1 failed, falling back to PG:", neo4jErr);
      layer1Candidates = await pgStructuredFilter(filters, 500, searcherFirmId);
      layer1Count = layer1Candidates.length;
      layer1Source = "pg";
      console.warn("[Search] PG fallback returned %d candidates", layer1Count);
    }
  }

  // Step 2.5: Enrich Layer 1 candidates with connected entity data (case study skills, expert skills, client industries)
  if (layer1Source === "neo4j" && layer1Candidates.length > 0) {
    try {
      await enrichWithConnectedEntities(layer1Candidates, filters);
    } catch (err) {
      console.error("[Search] Connected entity enrichment failed, continuing without:", err);
    }
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

  // Step 5: Final diversity guarantee — ensure experts and case studies survive all ranking layers
  // Without this, Layer 2's vector scoring or Layer 3's LLM ranking can push non-firm
  // entities to the bottom even though Layer 1 returned them with good structured scores.
  if (!filters.entityType && finalCandidates.length > 5) {
    const firms = finalCandidates.filter((c) => c.entityType === "firm");
    const experts = finalCandidates.filter((c) => c.entityType === "expert");
    const cases = finalCandidates.filter((c) => c.entityType === "case_study");

    if ((experts.length > 0 || cases.length > 0) && firms.length > 0) {
      const diverse: MatchCandidate[] = [];
      const usedIds = new Set<string>();

      const take = (pool: MatchCandidate[], n: number) => {
        for (const c of pool) {
          if (n <= 0) break;
          if (!usedIds.has(c.entityId)) {
            diverse.push(c);
            usedIds.add(c.entityId);
            n--;
          }
        }
      };

      // Guarantee minimums from each entity type
      take(experts, Math.min(3, experts.length));
      take(cases, Math.min(2, cases.length));

      // Fill remaining with all candidates by their ranking order
      for (const c of finalCandidates) {
        if (diverse.length >= finalCandidates.length) break;
        if (!usedIds.has(c.entityId)) {
          diverse.push(c);
          usedIds.add(c.entityId);
        }
      }

      finalCandidates = diverse;
    }
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
    searchIntent: filters.searchIntent,
    stats: {
      layer1Candidates: layer1Count,
      layer2Candidates: layer2Candidates.length,
      layer3Ranked: finalCandidates.length,
      totalDurationMs: durationMs,
      estimatedCostUsd,
      layer1Source,
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
