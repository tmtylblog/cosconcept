# Architecture & Data Session — 2026-03-10

## Session Summary

This session covered Track A implementation, company data import, vector optimization research, and onboarding UX redesign.

---

## 1. Track A Implementation — Completed

### Neo4j Schema (`src/lib/neo4j-schema.ts`)
- Added 6 new uniqueness constraints: `company_domain`, `person_linkedin`, `firm_category_name`, `tech_category_name`, `delivery_model_name`, `service_category_name`
- Added 8 new indexes: 3 on Company (name, enrichmentStatus, isCosCustomer), 1 on Person (enrichmentStatus), 2 on WorkHistory (title, companyStageAtTime), 2 fulltext (company_search, person_search)

### Neo4j Seed (`src/lib/neo4j-seed.ts`)
Added 8 new seed functions:
- `seedFirmCategories()` — FirmCategory nodes from categories.csv + PARTNERS_WITH edges
- `seedTechCategories()` — 13 TechCategory nodes
- `seedDeliveryModels()` — 10 DeliveryModel nodes
- `seedServiceCategories()` — 8 ServiceCategory nodes
- `seedServices()` — ~54 Service nodes linked to ServiceCategories
- `seedIndustryHierarchy()` — 15 IndustryL1 nodes, level properties on Industry nodes
- `seedMarketHierarchy()` — level + isoCode on Market nodes, PARENT_REGION edges
- `seedCompanyNodes()` — Company label added to ServiceFirm nodes + Client → Company migration

### Postgres Schema (`src/lib/db/schema.ts`)
Added 7 new enums:
- `enrichmentStatusEnum`, `industryLevelEnum`, `marketLevelEnum`, `companySourceEnum`, `personSourceEnum`, `engagementTypeEnum`, `preferenceSourceEnum`

Added 10 new tables:
- `firmCategories`, `techCategories`, `deliveryModels`, `serviceCategories`, `services`
- `industries` (self-referencing parentId), `industryMappings`, `unmappedIndustries`
- `markets` (self-referencing parentId)

### Drizzle Migration
- Generated: `drizzle/0000_fuzzy_wallflower.sql` (55 tables)
- Applied to Neon PostgreSQL successfully

### Commits pushed to GitHub
- `feat: Track A — taxonomy foundation + canonical company nodes`
- `chore: generate Drizzle migration for Track A schema tables`

---

## 2. Legacy Company Data Import — Completed

### Source Files
- `data/legacy/Data Dump (JSON)/Step 2_ Organization Basic Data/organization.json` — 1,096 orgs
- `data/legacy/Data Dump (JSON)/Step 3_ Organization Content Data/clients.json` — 20,074 clients

### Import Logic
- **Unique key:** `domain` extracted from `website` field
- **Orgs** → `Company:ServiceFirm` nodes, `isCosCustomer: true`, `enrichmentStatus: "partial"`
- **Clients** → `Company` stub nodes, `isCosCustomer: false`, `enrichmentStatus: "stub"`
- **Skip rules:** no valid domain, LinkedIn URL as website, blocklisted generic domains
- **WORKED_WITH edges** created from org → each of their clients (with `confidence: 0.9, source: "legacy_import"`)

### Final Results in Neo4j
| Metric | Count |
|---|---|
| Total Company nodes | 21,564 |
| COS customers (isCosCustomer=true) | 1,449 |
| External companies (isCosCustomer=false) | 20,115 |
| WORKED_WITH edges | 127,480 |

### Scripts created
- `scripts/import-legacy-companies.mjs` — main import script (batched, 100 records/batch)
- `scripts/patch-company-properties.mjs` — one-time patch for 20,084 pre-existing Company nodes missing isCosCustomer/enrichmentStatus
- `scripts/inspect-legacy-data.mjs` — data inspection utility
- `scripts/verify-company-import.mjs` — Neo4j verification utility

### Key finding
~20,084 Company nodes already existed in Neo4j from a prior enrichment pipeline. They had domains but no `isCosCustomer` or `enrichmentStatus`. Patch script fixed all of them.

---

## 3. Neo4j Aura Vector Optimization — Decision

**Decision: Skip for now. Revisit at Phase 4+ (matching engine).**

### Why not now
- Requires AuraDB Professional/Business Critical tier (>4GB) — not available on Free
- A 4GB instance only supports ~0.9M 768-dimension vectors — insufficient for 8M+ company records
- Re-allocates memory away from graph operations — hurts graph traversal at current scale
- pgvector on Neon already handles Layer 2 semantic search in the 3-layer matching cascade

### When to revisit
When graph-aware semantic search is needed — queries combining graph traversal AND vector similarity in one shot. Examples:
- "Find firms semantically similar to X that are also 2 hops in my partner network"
- "Find companies with similar descriptions that have worked with the same client industries"

### Trigger
Upgrade to AuraDB Professional + matching quality demands it.

---

## 4. Bulk Company Import — 8 Million Records

### Incoming dataset fields
`company, domain, industry, size, revenue, company_normalized`

### Existing system analysis findings

| Field | Postgres (importedCompanies) | Neo4j Company | Notes |
|---|---|---|---|
| `industry` | ✅ text, no normalization | ✅ Industry nodes via edge | No taxonomy mapping yet |
| `size` | ✅ `size_band` enum + raw text | ✅ `employeeCount` int | Inconsistent formats |
| `revenue` | ✅ text in importedCompanies | ❌ not stored | Not in Neo4j ServiceFirm |
| `company_normalized` | ❌ MISSING | ❌ MISSING | Needs to be added everywhere |
| `domain` | ✅ | ✅ unique constraint | Clean, ready |

### Files that need updating for 8M import
1. `src/lib/db/schema.ts` — add `company_normalized` to `importedCompanies`
2. `src/app/api/admin/import/companies/route.ts` — parse company_normalized field
3. `src/app/api/admin/import/sync-graph/route.ts` — map to Neo4j (currently 250 records/call, needs batching)
4. `src/lib/db/schema.ts` — extend `migration_batches` with `lastProcessedId` + `retryCount` for resume
5. New Neo4j Company properties needed: `revenue`, `companyNormalized`, `sizeRange`

### Requirements confirmed
- Format: JSON file
- Dedup: domain as unique key — MERGE into existing Neo4j Company nodes
- Enrichment status: reuse `"partial"`
- Labels: Company only (no additional labels)
- Relationships: none for now (map to existing Industry/Market nodes where possible)
- Pipeline: one-time script with checkpoint/resume capability
- Admin page: needed for import progress monitoring

### Checkpoint/resume
- Use `migration_batches` table (already exists)
- Add `lastProcessedId` column for row-level resume
- Add `retryCount` for exponential backoff

### Pending questions (unanswered — needed before writing import MD)
- A. `size` field format — text range like "11-50" or different?
- B. `industry` field format — LinkedIn values, Crunchbase, free text?
- C. Checkpoint granularity — batch level or record level?
- D. Admin page scope — show stats only, or also trigger import and browse failed records?

---

## 5. Onboarding UX Redesign

### Current state (docs/ONBOARDING-PROMPT.md)
- 8 preference dimensions, each with 3-4 sub-questions
- Estimated 24+ total questions
- Target was 5-10 min (too long)

### Problems identified
1. **Math doesn't work** — 24+ questions at < 3 min = 7 seconds per question
2. **Pre-population already covers** dimensions 1 (services), 2 (industry), 3 (geography) via website scraping + PDL
3. **Wrong signal focus** — captures "what you are" not "what you want" (double buy-in gap)
4. **Missing urgency signal** — active client need vs long-term partner building changes matching priority entirely

### What pre-population covers before Q1
- Services offered (Jina website scrape)
- Industry focus (classification)
- Geography / location (website + IP)
- Company size (PDL)
- Team members (LinkedIn/Proxycurl)

### Recommended: 6 questions (not 8 dimensions, not 9)

| # | Question | Signal captured | Replaces |
|---|---|---|---|
| 1 | What kind of partnership are you looking for? (referral / co-delivery / subcontracting / all) | Partnership model intent | Dimension 6 |
| 2 | What's the one thing clients ask for that you don't offer? | Capability gap = what partner you need | Dimension 4 |
| 3 | Who's your ideal client? (industry + size + stage — 3 quick selects) | Shared client context for referral matching | Dimension 5 |
| 4 | Do you need partners in your market or open globally? | Geography preference | Dimension 3 |
| 5 | What's your one non-negotiable in a partner? | Deal-breaker filter | Dimension 7 |
| 6 | Active client need right now, or building for the future? | Matching urgency | Dimension 8 |

**Target: 90 seconds of input, 3 min total experience.**

### Dimensions 1, 7, 8 disposition
Move to **progressive enrichment** — Ossy asks organically during later conversations, not onboarding. Improves match quality over time without causing drop-off.

### Ecosystem discovery framing (key UX principle)
Each question should feel like narrowing 21,000 firms down to the perfect 5 — not filling a form:

> *"You work with mid-market e-commerce brands — there are 340 firms in the network who serve the same clients. Let me narrow this down for you..."*

### Success metric
Successful completion without drop/bounce. User leaves feeling they can discover and navigate the agency/consulting ecosystem like never before.

### Action item
Rewrite `docs/ONBOARDING-PROMPT.md` with the 6-question structure.

---

## 6. Credentials Added to .env.local (local only, not in git)

```
DATABASE_URL=postgresql://neondb_owner:...@ep-cool-king-a4xjnjed-pooler.us-east-1.aws.neon.tech/neondb
NEO4J_URI=neo4j+s://b78f2c65.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=...
BETTER_AUTH_SECRET=...
GOOGLE_CLIENT_ID=...
OPENROUTER_API_KEY=...
JINA_API_KEY=...
PDL_API_KEY=...
```

---

## 7. Pending Next Steps

| Priority | Task | Notes |
|---|---|---|
| High | Write bulk import MD file | Need answers to 4 pending questions (section 4) |
| High | Rewrite ONBOARDING-PROMPT.md | 6-question structure |
| High | Person/Expert migration | user-basic.json + user-details.json + user-work-history.json → Person nodes |
| Medium | Run Neo4j taxonomy seed | POST /api/admin/neo4j/seed never triggered |
| Medium | Build admin company data quality page | One of 11 admin pages from SCHEMA-CHANGE-PLAN.md |
| Medium | Build bulk import admin page | Monitor 8M record import progress |
| Low | Link orgs to taxonomy nodes | Connect ServiceFirm → FirmCategory, Industry, Market |
| Low | GeoNames L3 city import | Too large for current seed, needs separate pipeline |
