# 7. Search & Matching Engine

> Last updated: 2026-03-11

## Overview

Three-layer cascading search that narrows 1.5M+ firms to ~15 ranked results per query. Designed to keep costs under $0.10 per search by eliminating 99% of candidates before any LLM touches the data. Bidirectional matching ensures both parties benefit.

**Target latency:** <3 seconds
**Target cost per search:** <$0.10
**Entry point:** `POST /api/search` -> `executeSearch()` in `src/lib/matching/search.ts`

---

## Architecture

```
User query (NL or explicit filters)
         |
    Query Parser (Gemini Flash, ~$0.0001)
         |
         v
Layer 1: Neo4j Structured Filter
    ~500 candidates, $0
         |
         v
Layer 2: pgvector Similarity Re-rank
    ~50 candidates, ~$0.001
         |
         v
Layer 3: Gemini Flash Deep Ranking
    ~15 results, ~$0.005
         |
         v
Ranked MatchCandidate[] with explanations
```

---

## Layer 1: Structured Filtering (Neo4j)

**File:** `src/lib/matching/structured-filter.ts`
**Cost:** $0 (database queries only)
**Output:** ~500 `StructuredCandidate` objects

Builds dynamic Cypher queries based on parsed filters. Supports four filter dimensions:

| Filter | Neo4j Pattern | Edge Type |
|--------|--------------|-----------|
| Skills | `(f)-[:HAS_SKILL]->(s:Skill)` | `HAS_SKILL` |
| Categories | `(f)-[:IN_CATEGORY]->(c:Category)` | `IN_CATEGORY` |
| Industries | `(f)-[:SERVES_INDUSTRY]->(i:Industry)` | `SERVES_INDUSTRY` |
| Markets | `(f)-[:OPERATES_IN]->(m:Market)` | `OPERATES_IN` |

**Scoring:** Each dimension contributes equally. Score = (matched criteria / total criteria) averaged across dimensions. If no filters provided, all firms get a default 0.5 score.

**Note:** The edge types used in structured-filter.ts (`HAS_SKILL`, `IN_CATEGORY`, `SERVES_INDUSTRY`) differ from those in KNOWLEDGE-GRAPH.md (`OFFERS_SERVICE`, `HAS_EXPERTISE_IN`). The filter code reflects the actual Neo4j schema as seeded.

**Exports:**
- `structuredFilter(filters, limit)` -- returns `StructuredCandidate[]`
- `bidirectionalStructuredFilter(filters, searcherFirmId, limit)` -- reads searcher's PREFERS edges, enriches filters, checks mutual fit, applies up to +20% score boost
- `toMatchCandidates(candidates)` -- converts to `MatchCandidate[]` format for Layer 2

**Bidirectional routing in `search.ts`:** When `searcherFirmId` is provided and Neo4j is configured (not PG fallback), the orchestrator automatically uses `bidirectionalStructuredFilter` instead of `structuredFilter`. This reads the searcher's `PREFERS` edges from Neo4j, unions them into the search filters, then checks if candidate firms also PREFERS what the searcher offers.

---

## Layer 2: Vector Similarity (pgvector)

**File:** `src/lib/matching/vector-search.ts`
**Cost:** ~$0.001 (one OpenAI embedding call)
**Output:** ~50 `MatchCandidate` objects

**Intended flow:**
1. Embed the raw query via OpenAI `text-embedding-3-small` (1536-dim)
2. Cosine similarity against each candidate's abstraction profile embedding
3. Combine: 60% structured score + 40% vector score
4. Return top 50

**Current status: FALLBACK MODE.** pgvector columns are commented out in schema.ts (line 249: `// embedding: vector(1536) -- added when pgvector extension is enabled`). The code currently uses a text-based term-overlap scoring fallback instead of true cosine similarity. The `generateQueryEmbedding()` function is implemented but its output is not yet wired to the reranking logic.

**What works:**
- `generateQueryEmbedding(queryText)` -- calls OpenAI, returns `number[]`
- `vectorRerank(candidates, rawQuery, topK)` -- loads abstraction profiles, scores by term overlap in `hiddenNarrative`

**What's missing:**
- `embedding` column on `abstraction_profiles` table (pgvector extension not enabled on Neon)
- SQL-based cosine similarity query (`ORDER BY embedding <=> $queryEmbedding`)
- Embedding generation pipeline for abstraction profiles (generate profile -> embed -> store)

---

## Layer 3: LLM Deep Ranking

**File:** `src/lib/matching/deep-ranker.ts`
**Cost:** ~$0.005-0.05 per query
**Output:** ~15 `MatchCandidate` objects with `matchExplanation` and `bidirectionalFit`

Takes top 50 from Layer 2. Sends all candidate summaries + searcher profile in a single batch to Gemini Flash via OpenRouter. The LLM:

1. Ranks top K candidates by relevance
2. Generates 1-2 sentence match explanations
3. Scores bidirectional fit: `theyWantUs` (0-1) and `weWantThem` (0-1)
4. Assigns `llmScore` (0-1)

**Final score formula:** `structuredScore * 0.3 + vectorScore * 0.2 + llmScore * 0.5`

**Model:** `google/gemini-2.0-flash-001` via OpenRouter (the code comments mention "Gemini Pro" but the actual implementation uses Flash for cost reasons).

**Fallback:** If LLM call fails, returns Layer 2 results unchanged.

**Feature gate:** `skipLlmRanking` parameter on `executeSearch()` and the API route. When true, Layer 3 is skipped entirely.

---

## Query Parser

**File:** `src/lib/matching/query-parser.ts`
**Cost:** ~$0.0001 per query (Gemini Flash)

Converts natural language to `SearchFilters`:

```typescript
interface SearchFilters {
  skills?: string[];       // L2 skill names (validated against 247 taxonomy items)
  industries?: string[];   // Free-form industry names
  markets?: string[];      // Countries/regions (validated against ~120 markets)
  categories?: string[];   // Firm categories (validated against 30 COS categories)
  sizeBand?: string;       // micro | small | medium | large
}
```

**Validation:** After AI extraction, filters are validated against actual taxonomy data from `src/lib/taxonomy.ts`. Invalid skill/category/market names are silently dropped. Industries pass through unvalidated (free-form).

**Taxonomy source:** CSV files in `data/` parsed at runtime with in-memory caching:
- `categories.csv` -- 30 firm categories
- `skills-L1.csv` -- 247 L2 skills (L1->L2 mapping)
- Market list hardcoded in `getMarkets()` (~120 countries/regions)

**Graceful failure:** On parse error, returns empty filters `{}` which results in a broad unfiltered search.

---

## Abstraction Profiles

**File:** `src/lib/matching/abstraction-generator.ts`
**DB Table:** `abstraction_profiles` (schema.ts line 233)

Hidden, normalized profiles for firms/experts/case studies. The abstraction is what gets embedded and compared -- not the raw user-facing profile.

### Schema

```typescript
abstractionProfiles = pgTable("abstraction_profiles", {
  id: text,                          // "abs_{entityId}"
  entityType: text,                  // "firm" | "expert" | "case_study"
  entityId: text,
  hiddenNarrative: text,             // AI-generated 200-word structured summary
  topServices: jsonb<string[]>,
  topSkills: jsonb<string[]>,
  topIndustries: jsonb<string[]>,
  typicalClientProfile: text,
  partnershipReadiness: jsonb<{
    openToPartnerships: boolean,
    preferredPartnerTypes: string[],
    partnershipGoals: string[],
  }>,
  confidenceScores: jsonb,           // Per-dimension confidence (0-1)
  evidenceSources: jsonb,            // What data was used
  // embedding: vector(1536)         // NOT YET ENABLED
  lastEnrichedAt: timestamp,
  enrichmentVersion: integer,        // Default 1
});
```

### Firm Abstraction Generation

`generateFirmAbstraction(evidence: FirmEvidence)`:

**Input:** All available evidence about a firm:
- Name, website, services, about/pitch text
- AI-classified categories, L2 skills, industries, markets
- Case studies (title, client, skills, industries, outcomes) -- capped at 10
- Team/experts (name, headline, skills) -- capped at 10
- PDL firmographic data (industry, size, employee count)

**AI model:** Gemini Flash via OpenRouter
**Prompt principle:** "Prioritize EVIDENCE over CLAIMS. Case studies and actual work > marketing copy."

**Confidence scoring formula** (evidence-weighted, 0-1 scale):
- `services`: case study count * 0.15 + has services * 0.3 + has PDL * 0.1
- `skills`: case study count * 0.1 + skill count * 0.03
- `industries`: case study count * 0.1 + industry count * 0.05
- `clientProfile`: case study count * 0.2
- `overall`: case studies * 0.1 + experts * 0.05 + website * 0.15 + PDL * 0.1 + services * 0.1

**Persistence:** Upsert via `onConflictDoUpdate` on the `id` column.

### Case Study Abstraction Generation

Handled separately in `src/lib/enrichment/case-study-analyzer.ts`.

**Two-layer output per case study:**
1. **Visible layer** (shown to users): 2-sentence summary + auto-tags
2. **Hidden layer** (powers matching): capability proof, partnership signals, ideal referral profile, taxonomy mapping, evidence strength (weak/moderate/strong)

**Triggered by:** Inngest function `enrich/firm-case-study-ingest` in `src/inngest/functions/firm-case-study-ingest.ts`. Full pipeline: ingest content -> validate -> generate visible layer -> generate hidden layer -> write to Neo4j -> upsert abstraction profile -> update firmCaseStudies row.

**Cost:** ~$0.001 per case study (2 Gemini Flash calls).

---

## Partner Preferences (8-Dimension Matching)

**DB Table:** `partner_preferences` (schema.ts line 216)

The "dating profile" for firms. Collected during Ossy conversational onboarding.

```typescript
partnerPreferences = pgTable("partner_preferences", {
  id: text,
  firmId: text -> serviceFirms.id (cascade delete),
  preferredFirmTypes: jsonb<string[]>,     // Dim 4: agency, consultancy, fractional, etc.
  preferredSizeBands: jsonb<string[]>,     // Dim 4: micro, small, medium, large
  preferredIndustries: jsonb<string[]>,    // Dim 2: verticals they want in a partner
  preferredMarkets: jsonb<string[]>,       // Dim 3: geographies they want partners in
  partnershipModels: jsonb<string[]>,      // Dim 6: subcontracting, co-delivery, referral, white-label
  dealBreakers: jsonb<string[]>,           // Dim 7: hard no's
  growthGoals: text,                       // Dim 8: what they want to achieve
  rawOnboardingData: jsonb,               // Full onboarding conversation data
});
```

**The 8 dimensions** (from ONBOARDING-PROMPT.md):
1. Service offerings & capabilities
2. Industry & vertical focus
3. Geographic markets
4. Ideal partner profile (type + size)
5. Client profile & deal size
6. Partnership model preferences
7. Values & working style (incl. deal breakers)
8. Growth goals

**Data flow (v2, 2026-03-11):** Onboarding conversation → `update_profile` tool → PG `partnerPreferences.rawOnboardingData` JSONB → fire-and-forget `syncPreferenceFieldToGraph()` → Neo4j `PREFERS` edges (to Skill/Category/Market nodes) + ServiceFirm properties. On completion → safety-net `syncAllPreferencesToGraph()`. See `src/lib/enrichment/preference-writer.ts`.

**Legacy data flow:** Onboarding conversation -> partner_preferences row + (Neo4j edges were planned as `SEEKS_PARTNER_TYPE`, `PREFERS_INDUSTRY`, `PREFERS_MARKET` but were never implemented for v1 fields).

---

## Bidirectional Matching

Both firms must want what the other offers. Bidirectional fit is now computed at **two layers**:

### Layer 1: Graph-Based Bidirectional Filter (NEW — 2026-03-11)

**File:** `src/lib/matching/structured-filter.ts` → `bidirectionalStructuredFilter()`

When `searcherFirmId` is provided:
1. Reads the searcher's `PREFERS` edges from Neo4j (skills, categories, markets)
2. Enriches the search filters with the searcher's stated preferences (union with explicit filters)
3. Runs standard structured filter with enriched filters
4. For each candidate, checks their `PREFERS` edges against what the searcher **offers** (HAS_SKILL, IN_CATEGORY, OPERATES_IN)
5. Computes:
   - **`weWantThem`** (0-1): fraction of searcher's PREFERS that the candidate matches
   - **`theyWantUs`** (0-1): fraction of candidate's PREFERS that the searcher matches
6. Applies bidirectional boost: up to +20% score increase for mutual preference fit

**Data source:** `PREFERS` edges created by `src/lib/enrichment/preference-writer.ts` during onboarding.

### Layer 3: LLM-Based Bidirectional Scoring

The deep ranker (Layer 3) also evaluates bidirectional fit, but based on richer signals:
- Searcher's abstraction profile (services, skills, industries, partnership goals)
- Candidate's available data (categories, skills, industries)
- Complementary capabilities (firms that fill gaps, not duplicates)

The LLM assigns `theyWantUs` and `weWantThem` scores (0-1) along with match explanations.

**Symbiotic relationships:** The `data/firm-relationships.csv` (346 rows) maps natural partnership pairings between firm types. This data is referenced in the design docs but is **not yet wired into the deep ranker prompt** -- the current implementation sends candidate data but doesn't include firm-relationship lookup.

---

## Cost Controls

### AI Cost Gateway

**File:** `src/lib/ai/gateway.ts`
**DB Table:** `ai_usage_log`

Every AI call is tracked with:
- Model name, feature, input/output tokens
- Calculated cost (model-specific rates)
- Organization/user ID, entity type/ID, duration

**Pricing table (per 1K tokens):**

| Model | Input | Output |
|-------|-------|--------|
| Gemini Flash | $0.0001 | $0.0004 |
| Gemini Pro | $0.00125 | $0.005 |
| Claude Sonnet | $0.003 | $0.015 |
| text-embedding-3-small | $0.00002 | $0 |

**Utilities:**
- `logUsage()` -- convenience wrapper with auto-cost calculation
- `estimateCost()` -- pure cost calculation
- `withUsageTracking()` -- wraps any AI call to auto-log timing and tokens

### Feature Gates

- `skipLlmRanking` parameter on `executeSearch()` -- skips Layer 3 entirely
- `explicitFilters` parameter -- override NL parsing to skip query parser cost
- Fallback mode in vector search when `OPENAI_API_KEY` is not set

---

## API

### `POST /api/search`

**File:** `src/app/api/search/route.ts`

**Request body:**
```json
{
  "query": "I need a Shopify partner in APAC",
  "firmId": "firm_abc123",
  "filters": { "skills": ["eCommerce"], "markets": ["Asia Pacific"] },
  "skipLlmRanking": false
}
```

**Response:**
```json
{
  "candidates": [MatchCandidate[]],
  "filters": { "parsed SearchFilters" },
  "stats": {
    "layer1Candidates": 487,
    "layer2Candidates": 50,
    "layer3Ranked": 15,
    "totalDurationMs": 2340,
    "estimatedCostUsd": 0.0051
  }
}
```

**Auth:** None currently (no auth check in route). Needs to be added before production.

---

## Types

**File:** `src/lib/matching/types.ts`

Key types:
- `SearchQuery` -- raw query + parsed filters + searcher context
- `SearchFilters` -- skills, industries, markets, categories, sizeBand, minScore
- `AbstractionProfile` -- hidden normalized profile with confidence scores
- `MatchCandidate` -- per-firm result with structured/vector/llm scores, explanation, bidirectional fit, preview data
- `SearchResult` -- candidates + query + stats (layer counts, duration, cost)

---

## Current Status

### Working
- Full three-layer pipeline is wired and callable via `POST /api/search`
- Query parser (NL -> structured filters via Gemini Flash with taxonomy validation)
- Neo4j structured filtering with dynamic Cypher generation
- Firm abstraction profile generation (Gemini Flash)
- Case study abstraction pipeline (Inngest: ingest -> analyze -> graph write -> abstraction upsert)
- Deep ranker with bidirectional fit scoring and match explanations
- AI cost gateway with per-call logging
- Text-based fallback for vector reranking

### Incomplete / Not Yet Live
- **pgvector not enabled on Neon** -- `embedding` column commented out in schema. Vector search uses term-overlap fallback instead of cosine similarity
- **No embedding generation pipeline** -- `generateQueryEmbedding()` exists but returned embeddings are not used in ranking; abstraction profiles lack stored embeddings
- **Firm-relationships.csv not wired into deep ranker** -- symbiotic relationship data (346 rows) exists but the LLM prompt does not include it
- **No proactive matchmaking** -- design calls for auto-generating matches on onboarding/preference change/new case study, but no Inngest jobs exist for this
- **No search API auth** -- route has no authentication check
- ~~**Ossy chat not integrated**~~ -- all 5 search tools are now wired in `ossy-tools.ts` (`search_partners`, `search_experts`, `search_case_studies`, `lookup_firm`, `get_my_profile`)
- **No Redis caching** -- popular search patterns should be cached per design
- ~~**Expert/case study search**~~ -- DONE: `searchExperts()` and `searchCaseStudies()` implemented and wired to Ossy tools
- **Size band filtering** -- parsed by query parser but not used in Neo4j structured filter
- **Graph needs firm data** -- search tools return thin results until `POST /api/admin/import/populate-graph` is run to batch-sync enriched service_firms → Neo4j ServiceFirm nodes
- **Graph population admin route** -- `src/app/api/admin/import/populate-graph/route.ts` built with `sync`, `promote`, and `classify` modes. Not yet executed.

---

## File Index

| File | Purpose |
|------|---------|
| `src/lib/matching/types.ts` | Shared TypeScript types for all layers |
| `src/lib/matching/search.ts` | Orchestrator -- `executeSearch()` |
| `src/lib/matching/query-parser.ts` | NL -> structured filters (Gemini Flash) |
| `src/lib/matching/structured-filter.ts` | Layer 1: Neo4j Cypher queries + bidirectional filter |
| `src/lib/matching/vector-search.ts` | Layer 2: pgvector / text fallback |
| `src/lib/matching/deep-ranker.ts` | Layer 3: LLM ranking + explanations |
| `src/lib/matching/abstraction-generator.ts` | Firm abstraction profile generation |
| `src/lib/enrichment/case-study-analyzer.ts` | Case study visible + hidden layer generation |
| `src/lib/enrichment/preference-writer.ts` | Onboarding → Neo4j PREFERS edges + ServiceFirm properties |
| `src/lib/profile/update-profile-field.ts` | PG write + fire-and-forget Neo4j sync |
| `src/inngest/functions/firm-case-study-ingest.ts` | Full case study ingestion Inngest pipeline |
| `src/lib/ai/gateway.ts` | AI cost tracking gateway |
| `src/lib/taxonomy.ts` | CSV taxonomy parsers (categories, skills, markets) |
| `src/lib/matching/firm-lookup.ts` | `lookupFirmDetail()` -- firm lookup by name, domain, or ID (PG + Neo4j) |
| `src/lib/matching/expert-search.ts` | `searchExperts()` -- ILIKE + JSONB overlap on `expert_profiles` |
| `src/lib/matching/case-study-search.ts` | `searchCaseStudies()` -- tag-filtered search on `firm_case_studies` |
| `src/app/api/search/route.ts` | HTTP endpoint |
| `src/lib/db/schema.ts` | `abstractionProfiles` (line 233), `partnerPreferences` (line 216) |
