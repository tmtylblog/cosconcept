# 3. Knowledge Graph (Neo4j)

> Last updated: 2026-03-11

The Neo4j Aura knowledge graph maps the professional services landscape: firms, experts, clients, projects, skills, industries, and markets. It powers the matching engine (Layer 1 structured filtering), search, recommendations, and trust path analysis.

> ⚠️ **Database Migration (2026-03-11):** Cloned to new Neo4j Aura instance `13a38041.databases.neo4j.io` (was `b78f2c65`). All data preserved. New password set — check Vercel env vars or ask the team.

---

## Neo4j Driver Setup

**File:** `src/lib/neo4j.ts`

- Singleton driver pattern via `globalThis` (survives serverless hot reloads in dev)
- Env vars: `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`
- Two helpers exported:
  - `neo4jRead<T>(cypher, params?)` -- read-only session
  - `neo4jWrite<T>(cypher, params?)` -- write session
- Both return `T[]` from `record.toObject()` mapping
- Health check: `src/app/api/admin/api-health/route.ts` pings Neo4j via `neo4jDriver.verifyConnectivity()`

---

## Node Types

### Core Business Nodes

| Label | Key Property | Description | Source |
|-------|-------------|-------------|--------|
| `ServiceFirm` | `id` (PG firm ID) | Enriched firm from the platform. Properties: `name`, `organizationId`, `website`, `description`, `foundedYear`, `employeeCount`, `pdlIndustry`, `pdlHeadline`, `pdlLocation`, `logoUrl`, `classifierConfidence`, `updatedAt` | Enrichment pipeline (graph-writer.ts) |
| `Expert` | `id` (composite: `firmId:name-slug`) | Individual professional. Properties: `fullName`, `headline`, `linkedinUrl`, `location`, `firmId`, `updatedAt` | Enrichment pipeline (graph-writer.ts) |
| `SpecialistProfile` | `id` (generated) | AI-generated specialist niche profile for an expert. Properties: `title`, `firmId`, `expertId`, `updatedAt`. Only created for profiles with qualityScore >= 80. | expert-linkedin.ts |
| `CaseStudy` | `id` (composite: `firmId:cs:index`) | Published case study. Properties: `title`, `description`, `sourceUrl`, `firmId`, `status` (pending/ingested), `outcomes[]`, `updatedAt` | graph-writer.ts, case-study-ingest.ts |
| `Client` | `name` (unique) | Company served by firms. Platform-owned, not firm-owned. | graph-writer.ts |
| `Service` | `name` (unique) | Named service offering extracted from firm websites. | graph-writer.ts (from Jina scrape) |

### Taxonomy/Reference Nodes

| Label | Key Property | Count | Description | Source |
|-------|-------------|-------|-------------|--------|
| `Category` | `name` (unique) | 30 | Firm categories (e.g., "Boutique Agency"). Properties: `definition`, `theme`, `sampleOrgs`, `legacyId`. **Note:** Some nodes carry dual labels `Category:FirmCategory` from legacy migration. `structured-filter.ts` normalizes this with a `CASE WHEN` clause so queries work regardless of which label a node has. | `data/categories.csv` via neo4j-seed.ts |
| `SkillL1` | `name` (unique) | ~26 | Top-level skill categories. Properties: `level="L1"`, `legacyId` | `data/skills-L1.csv` |
| `Skill` | `name` (unique) | ~18,668 | L2 (~247) and L3 (~18,421) skills. Properties: `level` ("L2"/"L3"), `l1` (parent L1 name for L2), `l2` (parent L2 name for L3), `legacyId`, `legacyLevel` | `data/skills-L1.csv`, `data/skills-L3-map.csv` |
| `Industry` | `name` (unique) | ~55+ | Sector verticals (grows via enrichment). Properties: `legacyId` | neo4j-seed.ts (hardcoded list + enrichment) |
| `Market` | `name` (unique) | ~200+ | Countries + regions. Properties: `type` ("region"/"country"), `isoCode` | neo4j-seed.ts (hardcoded list) |
| `Language` | `name` (unique) | ~75+ | Business languages. Properties: `isoCode` | neo4j-seed.ts |
| `FirmType` | `name` (unique) | 10 | Delivery models (e.g., "Staff Augmentation", "Advisory"). Properties: `description` | neo4j-seed.ts |

### Legacy Migration Nodes

| Label | Key Property | Description | Source |
|-------|-------------|-------------|--------|
| `Organization` | `legacyId` | Old COS orgs. Properties: `name`, `legalName`, `about`, `website`, `linkedinUrl`, `employees`, `city`, `state`, `countryCode`, `isLegacy=true`, `isCollectiveOSCustomer` | neo4j-migrate-legacy.ts |
| `User` | `legacyId` | Old COS users. Properties: `firstName`, `lastName`, `fullName`, `email`, `title`, `roles[]` | neo4j-migrate-legacy.ts |
| `Company` | `legacyId` or `{sourceId, source}` | Client companies (legacy + imported). Properties: `name`, `website`, `employees`, `domain`, `industry`, `location`, `country`, `size`, `foundedYear`, `linkedinUrl`, `websiteUrl`, `revenue`, `isIcp`, `icpClassification`, `updatedAt` | neo4j-migrate-legacy.ts, sync-graph route |
| `Person` | `{sourceId, source}` | Imported contacts. Properties: `name`, `firstName`, `lastName`, `email`, `title`, `linkedinUrl`, `city`, `state`, `country`, `expertClassification`, `updatedAt` | sync-graph route |
| `LegacySkill` | `legacyId` | Old skill taxonomy nodes. Properties: `name`, `level` | neo4j-migrate-legacy.ts |
| `ProfessionalService` | `legacyId` | Old professional service specializations. Properties: `name`, `level` | neo4j-migrate-legacy.ts |
| `OrgService` | `legacyId` | Organization-defined services. Properties: `name`, `description`, `tags[]`, `publishStatus` | neo4j-migrate-legacy.ts |
| `Opportunity` | `legacyId` | Partnership opportunities. Properties: `title`, `summary`, `description`, `type`, `urgency`, `status`, `minAmount`, `maxAmount`, `currency` | neo4j-migrate-legacy.ts |
| `PartnershipPreferences` | `orgId` | Firm partnership prefs. Properties: `clientIndustries[]`, `clientSizes[]`, `rateStart`, `rateEnd`, `locationCountries[]`, `locationRegions[]`, `locationType`, `partnerSizes[]`, `partnerTypes[]`, `projectSizeRanges[]`, `servicesOffered[]` | neo4j-migrate-legacy.ts |
| `WorkHistory` | `legacyId` | User work history entries. Properties: `title`, `description`, `startAt`, `endAt`, `isCurrentPosition`, `sortOrder` | neo4j-migrate-legacy.ts |
| `MatchRecommendation` | `legacyId` | Old match results. Properties: `jobId`, `score`, `recommendationType`, `createdAt` | neo4j-migrate-legacy.ts |
| `MatchActivity` | `{orgId, recId}` | Org responses to match recommendations. Properties: `status`, `createdAt` | neo4j-migrate-legacy.ts |

---

## Relationship/Edge Types

### Enrichment Pipeline Edges (graph-writer.ts)

| Edge | From | To | Created By |
|------|------|----|-----------|
| `IN_CATEGORY` | ServiceFirm | Category | AI classifier |
| `HAS_SKILL` | ServiceFirm | Skill | AI classifier (L2 level) |
| `SERVES_INDUSTRY` | ServiceFirm | Industry | AI classifier |
| `OPERATES_IN` | ServiceFirm | Market | AI classifier |
| `SPEAKS` | ServiceFirm | Language | AI classifier |
| `OFFERS_SERVICE` | ServiceFirm | Service | Jina website scrape |
| `HAS_CLIENT` | ServiceFirm | Client | Jina website scrape |
| `HAS_CASE_STUDY` | ServiceFirm | CaseStudy | Jina scrape + case study ingest |
| `EMPLOYS` | ServiceFirm | Expert | Jina scrape (team members) |
| `HAS_EXPERTISE` | Expert | Skill | Expert LinkedIn enrichment |
| `SERVES_INDUSTRY` | Expert | Industry | Expert LinkedIn enrichment |
| `HAS_SPECIALIST_PROFILE` | Expert | SpecialistProfile | Expert LinkedIn enrichment |
| `HAS_EXPERTISE` | SpecialistProfile | Skill | Expert LinkedIn enrichment |
| `SERVES_INDUSTRY` | SpecialistProfile | Industry | Expert LinkedIn enrichment |
| `DEMONSTRATES_SKILL` | CaseStudy | Skill | Case study ingest |
| `FOR_CLIENT` | CaseStudy | Client | Case study ingest |
| `IN_INDUSTRY` | CaseStudy | Industry | Case study ingest |

### Taxonomy Edges (neo4j-seed.ts)

| Edge | From | To | Description |
|------|------|----|-------------|
| `BELONGS_TO` | Skill (L2) | SkillL1 | L2 skill belongs to L1 category |
| `BELONGS_TO` | Skill (L3) | Skill (L2) | L3 skill belongs to L2 parent |
| `PARTNERS_WITH` | Category | Category | 346 firm relationship pairings. Properties: `nature`, `direction`, `frequency`, `revenueModel` |

### Legacy Migration Edges (neo4j-migrate-legacy.ts)

| Edge | From | To |
|------|------|----|
| `OPERATES_IN_INDUSTRY` | Organization | Industry |
| `IN_CATEGORY` | Organization | Category |
| `LOCATED_IN` | Organization | Market |
| `BELONGS_TO` | User | Organization |
| `OPERATES_IN_INDUSTRY` | Company | Industry |
| `HAS_CLIENT` | Organization | Company |
| `OWNED_BY` | CaseStudy | Organization |
| `AUTHORED_BY` | CaseStudy | User |
| `BELONGS_TO_INDUSTRY` | CaseStudy | Industry |
| `DEMONSTRATES_SKILL` | CaseStudy | LegacySkill |
| `TARGETS_MARKET` | CaseStudy | Market |
| `FEATURES_CLIENT` | CaseStudy | Company |
| `OWNED_BY` | OrgService | Organization |
| `OWNED_BY` | Opportunity | Organization |
| `HAS_PREFERENCES` | Organization | PartnershipPreferences |
| `HAS_SKILL` | User | LegacySkill |
| `HAS_INDUSTRY_EXPERIENCE` | User | Industry |
| `HAS_MARKET_EXPERIENCE` | User | Market |
| `SPEAKS` | User | Language |
| `HAS_WORK_HISTORY` | User | WorkHistory |
| `WORKED_AT` | WorkHistory | Company |
| `MATCHED` | MatchRecommendation | Organization |
| `RESPONDED_TO` | Organization | MatchActivity |
| `FOR_RECOMMENDATION` | MatchActivity | MatchRecommendation |
| `BELONGS_TO` | LegacySkill (child) | LegacySkill (parent) |
| `BELONGS_TO_CATEGORY` | ProfessionalService | Category |

### Preference Sync Edges (preference-writer.ts)

| Edge | From | To | Properties | Created By |
|------|------|----|-----------|-----------|
| `PREFERS` | ServiceFirm | Skill | `dimension: "skill"`, `weight: 0.9`, `source: "stated"`, `updatedAt` | Onboarding Q2 (capabilityGaps) |
| `PREFERS` | ServiceFirm | Category | `dimension: "capability_gap_category"`, `weight: 0.9` or `dimension: "firm_category"`, `weight: 0.8` | Onboarding Q2/Q3 |
| `PREFERS` | ServiceFirm | Market | `dimension: "market"`, `weight: 0.7`, `source: "stated"`, `updatedAt` | Onboarding Q5 (geographyPreference) |

**ServiceFirm properties set by preference sync:**
- `partnershipPhilosophy` — Q1 answer, controls matching algorithm variant
- `dealBreaker` — Q4 answer, free text stored as property
- `geographyPreference` — Q5 answer, stored as property + optional Market edge

**Idempotency:** Delete-then-recreate pattern per `(firmId, dimension)` pair. Safe for answer changes.

**Sync triggers:**
1. Per-field: fire-and-forget after PG write in `update-profile-field.ts`
2. Full sync: safety net at onboarding completion in `ossy-tools.ts`
3. Manual: `syncAllPreferencesToGraph(firmId)` can be called from admin

### Import Sync Edges (sync-graph route)

| Edge | From | To |
|------|------|----|
| `WORKS_AT` | Person | Company |

---

## Computed Super-Edges (Query Time, Not Stored)

### Trust Path
How connected is the current user to a potential partner?
```
user -> COMMUNICATES_WITH -> person -> EMPLOYED_BY -> firm
```
- Depth 1: Direct communication with someone at the firm
- Depth 2: Communicate with someone who communicates with someone at the firm
- Max traversal: 3 hops
- **Status: NOT IMPLEMENTED** -- design only, no code yet

### Capability Path
What can a firm actually do, based on evidence?
```
firm -> DELIVERED_PROJECT -> project -> BENEFITED_FROM <- client(industry)
firm -> HAS_CASE_STUDY -> case_study -> skills extracted
firm -> EMPLOYS <- expert -> HAS_EXPERTISE -> skill
```
- Ground-truth capabilities vs. self-reported services
- **Status: PARTIALLY IMPLEMENTED** -- case study and expert skill paths exist; Project/DELIVERED_PROJECT nodes not yet created

### Symbiotic Relationship Path
Which firms naturally work together?
```
firm_type_A -> [firm-relationships.csv lookup] -> firm_type_B
```
- 346 relationship definitions in `data/firm-relationships.csv`
- Weighted by: partnership frequency, revenue model compatibility, direction
- **Status: SEEDED** -- PARTNERS_WITH edges between Category nodes exist; not yet used in matching queries

---

## Schema (Constraints + Indexes)

**File:** `src/lib/neo4j-schema.ts`

### Constraints (12 uniqueness constraints)
- `ServiceFirm.id`, `Expert.id`, `Skill.name`, `SkillL1.name`, `Industry.name`, `Market.name`, `CaseStudy.id`, `Client.name`, `Service.name`, `Category.name`, `Language.name`, `FirmType.name`

### Indexes
- **Full-text:** `firm_search` (ServiceFirm: name, description), `expert_search` (Expert: fullName, headline), `case_study_search` (CaseStudy: title, description)
- **Property:** `firm_website` (website), `firm_org_id` (organizationId), `skill_l1` (Skill.l1), `skill_level` (Skill.level), `category_theme` (Category.theme), `expert_firm` (Expert.firmId), `case_study_firm` (CaseStudy.firmId), `firm_philosophy` (partnershipPhilosophy), `firm_deal_breaker` (dealBreaker), `firm_geo_pref` (geographyPreference)

---

## Seeding and Migration

### Taxonomy Seed
- **Endpoint:** `POST /api/admin/neo4j/seed` (requires `x-admin-secret` header)
- **Code:** `src/lib/neo4j-seed.ts` -> `seedNeo4jTaxonomy()`
- **UI:** `/admin/neo4j` page with "Run Seed" button
- Seeds in order: Categories (30), SkillsL1 (~26), SkillsL2 (~247), SkillsL3 (~18,421), FirmRelationships (346 edges), Markets (~200+), Languages (~75+), FirmTypes (10), Industries (~55)
- Uses MERGE (upsert) -- safe to re-run
- Batch size: 500

### Legacy Data Migration
- **Endpoint:** `POST /api/admin/neo4j/migrate` (requires `x-admin-secret` header, optional body `{ "steps": [1,2,3,4,5] }`)
- **Code:** `src/lib/neo4j-migrate-legacy.ts` -> `runLegacyMigration(steps?)`
- **UI:** `/admin/neo4j` page with "Run Migration" button
- **Data source:** `data/legacy/Data Dump (JSON)/` directory, organized in 5 step folders
- **Steps:**
  1. System Data: skills, professional services, industries, markets, languages
  2. Organizations: core tenant nodes with customer detection
  3. Content: clients, users, case studies, services, opportunities, partnership preferences
  4. User Profiles: user details (skills/industries/markets/languages links), work history
  5. Network Data: match recommendations, match activities
- Uses MERGE (upsert) -- safe to re-run
- Batch size: 250

### Import Sync (n8n data)
- **Endpoint:** `POST /api/admin/import/sync-graph`
- Syncs `importedCompanies` -> `Company` nodes and `importedContacts` -> `Person` nodes
- Links Person -> Company via `WORKS_AT` edge
- Tracks `graphNodeId` back in PostgreSQL for cross-referencing
- Batch size: 100

### Enrichment Pipeline (ongoing)
- **Firm enrichment:** `graph/sync-firm` Inngest event -> `writeFirmToGraph()` creates ServiceFirm + all edges
- **Expert enrichment:** `enrich/expert-linkedin` Inngest event -> `writeExpertToGraph()` + `writeSpecialistProfileToGraph()`
- **Case study ingestion:** `enrich/case-study-ingest` and `enrich/firm-case-study-ingest` Inngest events -> `writeCaseStudyToGraph()`

---

## Matching Engine Integration

**Files:** `src/lib/matching/`

The matching engine uses Neo4j as Layer 1 (structured filtering) in a three-layer cascade:

1. **Layer 1 -- Neo4j** (`structured-filter.ts`): Cypher queries filter `ServiceFirm` nodes by skills, categories, industries, markets. Returns ~500 candidates with structured match scores. Queries use `HAS_SKILL`, `IN_CATEGORY`, `SERVES_INDUSTRY`, `OPERATES_IN` edges.

2. **Layer 2 -- pgvector**: Vector similarity re-ranking on abstraction profile embeddings (~50 candidates).

3. **Layer 3 -- LLM (Gemini)**: Deep ranking with explanations (~15 results).

Target: <$0.10 per search, <3 seconds latency.

---

## Current Gaps and Missing Pieces

### Not Yet Implemented
- **Social graph edges:** `COMMUNICATES_WITH`, `CONNECTED_TO`, `TRUSTS`, `ENDORSES`, `MEMBER_OF` -- designed but no code
- **Preference/routing edges:** `AVOIDS`, `BLOCKS` -- designed but no code. **`PREFERS` edges are now implemented** via `preference-writer.ts` (synced from onboarding answers). Original design had `SEEKS_PARTNER_TYPE`, `PREFERS_INDUSTRY`, `PREFERS_MARKET` as separate edge types; these are consolidated into a single `PREFERS` edge with a `dimension` property.
- **Project nodes:** `Project` node type with `DELIVERED_PROJECT`, `BENEFITED_FROM`, `WORKED_ON` edges -- designed but no code
- **Trust path traversal:** No implementation of the 3-hop trust path computation
- **LinkedIn CSV upload:** Designed for social graph ingestion but not built
- **Email domain analysis:** Designed for COMMUNICATES_WITH edge creation but not built

### Partially Implemented
- **Symbiotic relationship queries:** PARTNERS_WITH edges are seeded between Categories but not yet queried by the matching engine
- **IS_FIRM_TYPE edge:** FirmType nodes are seeded but `IS_FIRM_TYPE` edges from ServiceFirm are not created by the enrichment pipeline
- **pgvector embeddings:** AbstractionProfile embedding field exists in types but pgvector is not live for search
- **Abstraction profiles:** Auto-trigger from enrichment not fully wired; case study abstraction works, firm-level abstraction generation incomplete

### Data Gaps
- **Global firm database:** Not loaded -- ServiceFirm nodes only exist for enriched platform members
- **Graph sync Inngest:** `graph-sync-firm` function exists but only passes basic data (firmId, name, website) without enrichment results -- needs full enrichment data piped through
- **Bidirectional matching:** **Now implemented** via `bidirectionalStructuredFilter()` in `structured-filter.ts`. Reads PREFERS edges for both searcher and candidates, computes mutual fit, and applies up to +20% score boost. Wired into `search.ts` when `searcherFirmId` is provided and Neo4j is configured.

---

## Partner Sync Taxonomy Export

The full COS taxonomy is served to partner platforms (e.g., Chameleon Collective CORE) via `GET /api/partner-sync/taxonomy`. This endpoint returns skills (L1/L2/L3), categories, industries (L1 + L2 hierarchy), markets, languages, firm types, service categories, services, tech categories, and PARTNERS_WITH edges. CORE calls this daily to seed its own graph with the COS taxonomy, ensuring both platforms share the same reference data.

The taxonomy data is sourced from `src/lib/taxonomy-full.ts`, which re-exports CSV-based helpers from `src/lib/taxonomy.ts` and adds static reference data (firm types, tech categories, service categories, industry hierarchy, market hierarchy, language ISO codes). Both the Neo4j seed script and the partner-sync taxonomy endpoint consume this module.

The schema manifest endpoint (`GET /api/partner-sync/schema-manifest`) returns node labels, edge types, and constraints so CORE can detect schema drift.

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/lib/neo4j.ts` | Driver singleton + read/write helpers |
| `src/lib/neo4j-schema.ts` | Constraints + indexes setup |
| `src/lib/neo4j-seed.ts` | Taxonomy seeding (categories, skills, markets, etc.) |
| `src/lib/neo4j-migrate-legacy.ts` | Legacy JSON data migration (5 steps) |
| `src/lib/enrichment/graph-writer.ts` | Enrichment -> Neo4j writer (firms, experts, case studies, specialist profiles) |
| `src/lib/enrichment/preference-writer.ts` | Onboarding answers -> Neo4j PREFERS edges + ServiceFirm properties |
| `src/lib/taxonomy.ts` | CSV parsers for reference data |
| `src/lib/matching/structured-filter.ts` | Layer 1 Neo4j Cypher queries for matching |
| `src/lib/matching/search.ts` | Three-layer search orchestrator |
| `src/lib/matching/types.ts` | Matching type definitions |
| `src/app/api/admin/neo4j/seed/route.ts` | Seed API endpoint |
| `src/app/api/admin/neo4j/migrate/route.ts` | Migration API endpoint |
| `src/app/api/admin/import/sync-graph/route.ts` | Import sync (companies + contacts) |
| `src/app/api/admin/graph/associations/route.ts` | Graph association queries (admin UI) |
| `src/app/(admin)/admin/neo4j/page.tsx` | Admin UI for seed + migrate |
| `src/inngest/functions/graph-sync.ts` | Inngest: firm graph sync |
| `src/inngest/functions/case-study-ingest.ts` | Inngest: case study ingestion |
| `src/inngest/functions/firm-case-study-ingest.ts` | Inngest: firm case study full pipeline |
| `src/inngest/functions/expert-linkedin.ts` | Inngest: expert enrichment + graph write |
| `src/lib/taxonomy-full.ts` | Full taxonomy data: firm types, tech categories, services, industry/market hierarchy, language ISO codes |
| `src/app/api/partner-sync/taxonomy/route.ts` | Partner sync: serves full taxonomy to CORE |
| `src/app/api/partner-sync/schema-manifest/route.ts` | Partner sync: serves graph schema manifest to CORE |
| `src/app/api/partner-sync/entities/route.ts` | Partner sync: bi-directional entity push/pull |
| `src/app/api/partner-sync/provision-user/route.ts` | Partner sync: create COS user from CORE |
| `src/app/api/partner-sync/deprovision-user/route.ts` | Partner sync: remove user org membership from CORE |
| `src/app/api/partner-sync/lib/auth.ts` | Partner sync: x-api-key + x-partner-id auth helper |
| `docs/KNOWLEDGE-GRAPH.md` | Original design document (canonical reference) |
| `data/categories.csv` | 30 firm categories |
| `data/skills-L1.csv` | L1 -> L2 skill mapping |
| `data/skills-L3-map.csv` | L2 -> L3 skill mapping |
| `data/firm-relationships.csv` | 346 firm partnership pairings |
