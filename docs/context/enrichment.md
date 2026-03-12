# 6. Enrichment Pipeline

> Last updated: 2026-03-09

## Overview

The enrichment pipeline transforms a bare website URL into a fully profiled firm with taxonomy classification, case studies, client lists, team members, and knowledge graph entries. It operates in two phases during onboarding and continues enriching asynchronously via Inngest background jobs.

---

## Two-Phase Onboarding Flow

### Phase 1: Confirm Enrichment (Domain Submission)

The user (or Ossy chat) provides a firm's website URL. The `EnrichmentProvider` (`src/hooks/use-enrichment.ts`) orchestrates a progressive enrichment sequence:

1. **Cache Lookup** (`POST /api/enrich/lookup`) — checks PostgreSQL `serviceFirms.enrichmentData` and Neo4j `ServiceFirm` nodes for previously enriched data. If a full cache hit exists, enrichment skips all paid APIs.
2. **Stage 1 (parallel):**
   - **PDL** (`POST /api/enrich/pdl`) — firmographic data (name, headcount, revenue, location, industry, funding, social URLs)
   - **Jina Scrape** (`POST /api/enrich/scrape`) — homepage + up to 5 priority subpages. Extracts clients, services, case study URLs, team member names, about pitch
3. **Stage 2 (sequential, after scrape):**
   - **AI Classify** (`POST /api/enrich/classify`) — classifies firm against COS taxonomy (30 categories, 247 L2 skills, industries, markets, languages)
4. **Stage 3 (background):**
   - **Persist** (`POST /api/enrich/persist`) — upserts to `serviceFirms` table and writes to Neo4j via `graph-writer.ts`

The user sees progressive results as each stage completes. Stages track status via `EnrichmentStages` (`idle | loading | done | failed`).

### Phase 2: Partner Preferences (Ossy Interview)

After enrichment completes, Ossy (the AI assistant) conducts a conversational interview asking about:
- Desired partner services (what they want from partners)
- Partnership types (referral, white-label, subcontracting)
- Geographic preferences
- Industry focus areas

These answers are logged as `onboardingEvents` with `stage: "interview_answer"`.

### Onboarding Event Tracking

Every step is logged to the `onboarding_events` table via:
- **Client-side:** `logOnboardingEventClient()` in `src/lib/onboarding/log-client.ts` — POSTs to `/api/onboarding-events`
- **Server-side:** `logOnboardingEvent()` in `src/lib/onboarding/event-logger.ts` — direct DB insert

Stages tracked: `domain_submitted`, `cache_lookup` (hit_full/hit_partial/miss), `enrichment_stage_done` (pdl/scrape/classify done/failed), `enrichment_complete`, `interview_answer`, `onboarding_complete`.

---

## Enrichment Modules

All modules live in `src/lib/enrichment/`.

### jina-scraper.ts — Website Scraping

- **Purpose:** Scrape a firm's website for Ground Truth evidence (what they've actually done, not what they claim)
- **Input:** Website URL
- **Output:** `FirmGroundTruth` — homepage content, up to 5 priority subpages, extracted clients/services/team/case study URLs/about pitch, combined raw content (15k char cap)
- **Cost:** Free tier available; paid Jina API key optional for higher limits
- **Page Priority:** case_studies (1) > clients (2) > services (3) > about (4) > industries (5) > team (6)
- **API:** Jina Reader API (`https://r.jina.ai/{url}`) returns markdown-formatted page content
- **Calls:** `extractClientsWithConfidence()` from `client-extractor.ts` for multi-signal client extraction
- **Bot protection:** Exports `isBlockedContent(content)` — detects Cloudflare challenge pages, access denied, and suspiciously short responses. Used by both jina-scraper and deep-crawler to skip blocked pages rather than storing junk.
- **Crawl pacing:** Case study URL scraping is sequential with 5–10 second jitter delay between requests (was parallel) to avoid triggering CF behavioral bot detection on case-study-heavy sites.

### pdl.ts — People Data Labs

- **Purpose:** Structured firmographic and person data from external API
- **Two endpoints:**
  - `enrichCompany({website?, name?, profile?})` -> `PdlCompany | null` — headcount, industry, funding, revenue, location, social URLs
  - `enrichPerson({name?, companyName?, linkedinUrl?, email?})` -> `PdlPerson | null` — job history, skills, education, headline
- **Cost:** 1 PDL credit per successful match (~$0.03-0.10). 404 = free (no charge)
- **Input:** At least one identifier (website/name/profile for company; name+company/LinkedIn/email for person)

### deep-crawler.ts — Enhanced Multi-Page Crawl

- **Purpose:** Deeper website crawl that goes beyond basic Jina scraper. Discovers 10-30+ pages.
- **Input:** `{firmId, website, firmName}`
- **Output:** `DeepCrawlResult` — all crawled pages with AI page classification, structured extracted data (case studies, team, services, clients), combined raw content (20k char cap), stats
- **Discovery strategy:** homepage links -> sitemap.xml -> common URL path probes (/about, /services, /case-studies, etc.) -> subpage link following
- **Cost:** Per-page Jina scrape + per-page AI classification + per-type AI extraction
- **Limits:** MAX_PAGES = 50, SCRAPE_TIMEOUT_MS = 10000
- **Uses:** `page-classifier.ts`, `extractors/case-study-extractor.ts`, `extractors/team-extractor.ts`, `extractors/service-extractor.ts`, `client-extractor.ts`
- **Crawl pacing:** 5–10 second jitter delay (`sleep()`) between every page request in the main loop to avoid Cloudflare behavioral bot detection.
- **Block detection:** Uses `isBlockedContent()` from jina-scraper — blocked pages return null and are skipped (logged as warnings) rather than stored as content.
- **Pre-seeded clients:** After `extractCaseStudyDeep()` runs, extracted `clientName` values are passed as `preSeededClients` to `extractClientsWithConfidence()`, eliminating a duplicate Gemini Flash AI call on the same pages.
- **NDA detection:** `detectNdaProtection()` checks homepage + client pages for NDA/confidentiality disclaimers. Result exposed as `DeepCrawlResult.extracted.clientsNdaProtected: boolean`.

### ai-classifier.ts — COS Taxonomy Classification

- **Purpose:** Classify a firm against the full COS taxonomy using AI
- **Input:** Raw scraped content + optional PDL summary, services list, about pitch
- **Output:** `FirmClassification` — categories (from 30), L2 skills (from 247), industries, markets, languages, confidence score
- **Model:** `google/gemini-2.0-flash-001` via OpenRouter
- **Cost:** ~$0.001 per classification
- **Validation:** Post-processes AI output against actual taxonomy; filters invalid entries

### client-extractor.ts — Multi-Signal Client Extraction

- **Purpose:** Extract client company names with confidence scoring
- **5 signal sources** (ranked by reliability):
  1. Case study AI extraction (0.9 confidence) — Gemini Flash reads case study content
  2. Client section headers (0.8) — names under "Our Clients" / "Trusted By" headers
  3. Logo alt text (0.75) — `![CompanyName](logo.png)` in client sections
  4. Testimonial attribution (0.65) — "-- Name, VP at CompanyName"
  5. Case study title parsing (0.6) — heuristic patterns like "ClientName: How We..."
- **Cross-validation:** Same name from 2+ sources gets +0.1 per extra source
- **Threshold:** Only returns clients with confidence >= 0.5 (aligns with schema plan minimum edge confidence rule)
- **Max:** 30 clients returned
- **Blocklist:** Extensive regex filtering out nav items, generic terms, image references
- **`preSeededClients` param:** Optional `string[]` of client names already extracted by the case study extractor. When provided, these are injected directly as `case_study_ai` signals at 0.9 confidence and the duplicate Gemini Flash AI call on case study pages is skipped entirely. Pass from `deep-crawler.ts` after `extractCaseStudyDeep()` runs.

### page-classifier.ts — AI Page Type Classification

- **Purpose:** Classify scraped pages into types (homepage, about, services, case_study, portfolio, team, clients, blog_post, blog_listing, industries, contact, careers, pricing, other)
- **Strategy:** Fast regex pre-classification (free) -> AI fallback for ambiguous cases
- **Model:** Gemini Flash via OpenRouter
- **Cost:** ~$0.0001 per page (only for ambiguous cases)

### case-study-ingestor.ts — Multi-Format Case Study Ingestion

- **Purpose:** Ingest case studies from URL, PDF, or raw text
- **Formats:** `url` (Jina scrape), `pdf` (basic text extraction from buffer), `text` (direct)
- **Output:** `CaseStudyCosAnalysis` — title, clientName, clientIndustry, challenge, solution, approach, outcomes, metrics, servicesUsed, skillsDemonstrated, industries, projectDuration, teamSize, isCaseStudy flag, confidence
- **Model:** Gemini Flash for structured extraction
- **Includes:** `extractTextFromPdf()` — basic PDF text extraction (placeholder; needs pdf-parse for production)

### case-study-analyzer.ts — Proprietary Analysis Pipeline

- **Purpose:** Generate two layers from ingested case study analysis
- **Visible Layer** (`generateCaseStudySummary()`): 2-sentence summary + auto-tags (skills, industries, services, clientName). Summary via Gemini Flash; tags are direct mapping from analysis fields (no extra AI call).
- **Hidden Layer** (`generateCaseStudyAbstraction()`): Partnership matching signals stored in `abstractionProfiles` table:
  - capabilityProof — what this proves the firm can deliver
  - partnershipSignals — what partner types would complement
  - idealReferralProfile — what incoming opportunity this evidences
  - taxonomyMapping — normalized L2 skills + industries
  - evidenceStrength (weak/moderate/strong) + reasoning
- **Cost:** ~$0.001 per case study (2 Gemini Flash calls)

### expert-classifier.ts — Expert vs Internal Role Classification

- **Purpose:** Classify team members as "expert" (client-facing, platform-worthy) vs "internal" (ops/admin/support)
- **Strategy:** Rule-based keyword matching (free, instant) -> AI fallback for ambiguous titles (Gemini Flash)
- **Keyword lists:** ~95 expert keywords (consultant, strategist, designer, etc.) and ~47 internal keywords (recruiter, bookkeeper, receptionist, etc.)
- **Default:** Ambiguous titles lean toward "expert" (professional services firms have unconventional titles)
- **Sync version:** `classifyTeamMembersSync()` — rule-based only, no AI, for instant UI counts

### specialist-generator.ts — Specialist Profile Generator

- **Purpose:** Analyze expert's work history + skills + firm case studies to generate specialist profile niches
- **Input:** PDL person data, optional firm context (case studies, services), isCurrentMember flag
- **Output:** `ExpertProfileAnalysis` — 1-3 specialist profiles (title, description, skills, industries, yearsRelevant, confidence), division classification (collective_member/expert/trusted_expert), summary, differentiators, top skills/industries
- **Model:** Gemini Flash via OpenRouter
- **Cost:** ~$0.001 per expert

### audit-logger.ts — Enrichment Audit Logger

- **Purpose:** Complete audit trail of every enrichment step
- **Storage:** `enrichment_audit_log` table
- **Fields logged:** firmId, userId, phase, source, rawInput, rawOutput, extractedData, model, costUsd, confidence, durationMs, status, errorMessage
- **Truncation:** Raw input/output capped at 50KB to prevent DB bloat
- **Convenience wrapper:** `withAuditLog()` — times an operation and logs result/error automatically
- **Phases:** `pdl | jina | classifier | linkedin | case_study | onboarding | memory | deep_crawl`

### graph-writer.ts — Neo4j Knowledge Graph Writer

- **Purpose:** Write enrichment results to Neo4j as nodes and relationships
- **Firm graph writes** (`writeFirmToGraph()`):
  - `ServiceFirm` node with all metadata
  - `IN_CATEGORY -> Category`, `HAS_SKILL -> Skill`, `OPERATES_IN -> Market`, `SPEAKS -> Language`, `SERVES_INDUSTRY -> Industry`, `OFFERS_SERVICE -> Service`, `HAS_CLIENT -> Client`, `EMPLOYS -> Expert`, `HAS_CASE_STUDY -> CaseStudy`
- **Expert graph writes** (`writeExpertToGraph()`):
  - `Expert` node linked to `ServiceFirm`, `Skill` (HAS_EXPERTISE), `Industry` (SERVES_INDUSTRY)
- **Specialist profile writes** (`writeSpecialistProfileToGraph()`):
  - `SpecialistProfile` node linked from `Expert` (HAS_SPECIALIST_PROFILE), to `Skill` and `Industry`
- **Case study writes** (`writeCaseStudyToGraph()`):
  - `CaseStudy` node linked to `ServiceFirm`, `Client` (FOR_CLIENT), `Skill` (DEMONSTRATES_SKILL), `Industry` (IN_INDUSTRY)
- **All operations use MERGE** (upsert) — safe to call multiple times

### Extractors (src/lib/enrichment/extractors/)

#### case-study-extractor.ts
- `extractCaseStudyDeep(pageTitle, content, url)` — AI extracts structured case study data from page content. Handles single case study pages and portfolio listings. Returns array of `ExtractedCaseStudy`.

#### team-extractor.ts
- `extractTeamMembers(content, url, firmName)` — AI extracts team member profiles (name, role, LinkedIn URL, bio). Handles grid layouts, detailed bios, leadership pages. Validates names (2+ words, filters false positives). Cap: 50 per page.

#### service-extractor.ts
- `extractServicesDeep(content, url)` — AI extracts service offerings (name, description, sub-services). Cap: 20 services.

All extractors use Gemini Flash via OpenRouter.

---

## Inngest Background Jobs

All functions registered in `src/inngest/functions/index.ts` and served at `/api/inngest`.

### enrich/deep-crawl — Deep Website Crawl

- **File:** `src/inngest/functions/deep-crawl.ts`
- **Event:** `enrich/deep-crawl`
- **Concurrency:** 5, Retries: 2
- **Steps:**
  1. `deep-crawl` — Enhanced multi-page crawl with AI page classification
  2. `pdl-enrich` — PDL company enrichment
  3. `ai-classify` — COS taxonomy classification
  4. `graph-write` — Write firm + all relationships to Neo4j
  5. `queue-case-studies` — Send up to 25 case study URLs as `enrich/case-study-ingest` events
  6. `queue-expert-enrichment` — Send up to 20 team members as `enrich/expert-linkedin` events
- **Triggers:** Admin manual trigger, weekly recrawl cron, or onboarding

### enrich/case-study-ingest — Case Study Ingestion

- **File:** `src/inngest/functions/case-study-ingest.ts`
- **Event:** `enrich/case-study-ingest`
- **Concurrency:** 3, Retries: 2
- **Steps:**
  1. `ingest-and-extract` — Multi-format ingestion (URL/PDF/text) + AI extraction
  2. `graph-write` — Write case study to Neo4j with client, skill, and industry relationships
- **Output:** Status (ingested/skipped), title, client, services, skills, metrics, confidence

### enrich/firm-case-study-ingest — Firm Case Study Full Pipeline

- **File:** `src/inngest/functions/firm-case-study-ingest.ts`
- **Event:** `enrich/firm-case-study-ingest`
- **Concurrency:** 3, Retries: 2
- **Steps:**
  1. `set-ingesting` — Update `firmCaseStudies.status` to "ingesting"
  2. `ingest-and-extract` — Multi-format ingestion + AI extraction
  3. Validate: if not a case study, mark as "failed" with descriptive message
  4. `generate-summary` — Visible layer (2-sentence summary + auto-tags)
  5. `generate-abstraction` — Hidden layer (partnership signals for matching engine)
  6. `graph-write` — Write to Neo4j
  7. `upsert-abstraction` — Insert/update `abstractionProfiles` row
  8. `finalize` — Update `firmCaseStudies` row with all results, set status to "active"

### enrich/expert-linkedin — Expert LinkedIn/PDL Enrichment

- **File:** `src/inngest/functions/expert-linkedin.ts`
- **Event:** `enrich/expert-linkedin`
- **Concurrency:** 5, Retries: 2
- **Steps:**
  1. `pdl-enrich` — PDL person lookup (work history, skills, education)
  2. `generate-specialist-profiles` — AI generates 1-3 specialist niche profiles
  3. `pg-write` — Upsert `expertProfiles` + insert `specialistProfiles` + `specialistProfileExamples`. Quality scoring via `scoreSpecialistProfile()`. Profiles with qualityScore >= 80 marked searchable; >= 50 published.
  4. `graph-write` — Write expert + specialist profiles to Neo4j

### graph/sync-firm — Graph Sync

- **File:** `src/inngest/functions/graph-sync.ts`
- **Event:** `graph/sync-firm`
- **Retries:** 3
- **Purpose:** Re-sync a firm's enrichment data to Neo4j (e.g., after manual data updates)

### cron-weekly-recrawl — Weekly Website Recrawl

- **File:** `src/inngest/functions/weekly-recrawl.ts`
- **Schedule:** `0 2 * * 0` (every Sunday 2:00 AM UTC)
- **Steps:**
  1. `get-firms` — Query all firms with non-null websites
  2. `queue-crawls` — Send `enrich/deep-crawl` event for each firm
- **Purpose:** Detect new case studies, team changes, service updates

---

## Enrichment Audit Trail

### enrichment_audit_log Table

```
id              text PK
firmId          text FK -> serviceFirms.id (nullable)
userId          text FK -> users.id (nullable)
phase           text NOT NULL  -- pdl | jina | classifier | linkedin | case_study | onboarding | memory | deep_crawl
source          text NOT NULL  -- URL, API name, model name, etc.
rawInput        text           -- What was sent (truncated to 50KB)
rawOutput       text           -- What came back (truncated to 50KB)
extractedData   jsonb          -- Structured data stored
model           text           -- AI model used
costUsd         real           -- Cost of this step
confidence      real           -- Confidence score
durationMs      integer        -- Processing time
status          text NOT NULL DEFAULT 'success'  -- success | error | skipped
errorMessage    text
createdAt       timestamp NOT NULL DEFAULT now()
```

### onboarding_events Table

```
id              text PK
userId          text FK -> users.id (nullable)
organizationId  text FK -> organizations.id (nullable)
firmId          text FK -> serviceFirms.id (nullable)
domain          text           -- Firm domain being onboarded
stage           text NOT NULL  -- domain_submitted | cache_lookup | enrichment_stage_done | enrichment_complete | interview_answer | onboarding_complete
event           text NOT NULL  -- Specific event (e.g., cache_hit_full, pdl_done, desiredPartnerServices)
metadata        jsonb          -- Stage-specific context (gaps[], source, questionNumber, etc.)
createdAt       timestamp NOT NULL DEFAULT now()
```

### Admin API

- `GET /api/admin/enrichment/[firmId]` — Returns audit trail entries + summary stats (total entries, total cost, phases used, first/last enriched). Superadmin only. Supports `?phase=` filter and `?limit=` pagination.
- Admin UI at `/admin/enrichment` — search by firmId, browse audit entries with expandable raw data.

---

## Auto-Population Logic

When a user submits their website URL during onboarding, the following data is auto-populated:

| Data Point | Source | Method |
|---|---|---|
| Company name | PDL `displayName` | Direct mapping |
| Industry | PDL `industry` | Direct mapping |
| Headcount / size | PDL `employeeCount`, `size` | Direct mapping |
| Founded year | PDL `founded` | Direct mapping |
| HQ location | PDL `location.name` | Direct mapping |
| Revenue | PDL `inferredRevenue` | Direct mapping |
| LinkedIn URL | PDL `linkedinUrl` | Direct mapping |
| Logo | Clearbit | `https://logo.clearbit.com/{domain}` |
| Services list | Jina scrape | Regex extraction from services pages |
| Client names | Jina + AI | Multi-signal confidence scoring (5 sources) |
| Case study URLs | Jina scrape | URL pattern matching on homepage + subpages |
| Team member names | Jina scrape | Regex extraction from team pages |
| About / pitch text | Jina scrape | First 5 prose lines from about pages (1000 char cap) |
| COS categories | AI Classifier | Gemini Flash structured output against 30 categories |
| L2 skills | AI Classifier | Gemini Flash against 247-item taxonomy |
| Industries | AI Classifier | AI-generated from evidence |
| Markets | AI Classifier | Validated against UN country list |
| Languages | AI Classifier | Validated against language list |
| Description | Jina `aboutPitch` | Stored on `serviceFirms.description` |

---

## Progressive Enrichment Strategy

Enrichment runs in tiers of increasing depth and cost:

### Tier 1: Instant (Onboarding, ~3-8 seconds)
- Cache lookup (free)
- PDL company enrichment (1 credit if found)
- Jina basic scrape: homepage + 5 priority subpages (free tier or API key)
- AI classification (Gemini Flash, ~$0.001)
- **Result:** Firm profile card, taxonomy tags, basic services/clients

### Tier 2: Deep (Background, ~30-120 seconds)
- Deep crawl: sitemap + common probes + link following (up to 30 pages)
- AI page classification per page
- AI extractors per page type (case studies, team, services)
- Case study URLs queued for individual ingestion
- Team members queued for PDL/LinkedIn enrichment
- **Result:** Richer case study data, detailed team profiles, structured services

### Tier 3: Individual Entity (Background, per-entity)
- **Case studies:** Ingest each URL -> AI extract -> visible summary + hidden abstraction profile -> Neo4j
- **Experts:** PDL person lookup -> specialist profile generation -> quality scoring -> PostgreSQL + Neo4j
- **Result:** Deep expert profiles with specialist niches, case studies with partnership matching signals

### Tier 4: Continuous (Weekly Cron)
- Weekly recrawl of all firm websites (Sunday 2 AM UTC)
- Detects new case studies, team changes, service updates
- Re-runs full deep crawl pipeline

---

## API Endpoints

| Endpoint | Method | Purpose | Auth Required |
|---|---|---|---|
| `/api/enrich/lookup` | POST | Cache check (PostgreSQL + Neo4j) before paid APIs | No |
| `/api/enrich/pdl` | POST | PDL company enrichment | No |
| `/api/enrich/scrape` | POST | Jina website scrape (basic: homepage + 5 pages) | No |
| `/api/enrich/classify` | POST | AI taxonomy classification | Yes |
| `/api/enrich/persist` | POST | Save combined enrichment to DB + Neo4j | Yes |
| `/api/enrich/website` | POST | Combined pipeline (PDL + Jina + Classify + persist) | Yes |
| `/api/enrich/firm` | GET | Load persisted enrichment data for a firm | Yes |
| `/api/enrich/deep-crawl` | POST | Queue Inngest deep crawl job | Yes |
| `/api/enrich/case-study` | POST | Queue case study ingestion (URL/PDF/text) | Yes |
| `/api/enrich/expert` | POST | Queue expert PDL + specialist profile enrichment | Yes |
| `/api/enrich/person` | POST | Direct PDL person lookup (synchronous) | Yes |
| `/api/admin/enrichment/[firmId]` | GET | Audit trail for a firm (superadmin only) | Yes (superadmin) |

---

## Key Files

| File | Purpose |
|---|---|
| `src/hooks/use-enrichment.ts` | `EnrichmentProvider` — client-side orchestrator with progressive stages |
| `src/lib/enrichment/jina-scraper.ts` | Jina Reader API scraping + structured extraction |
| `src/lib/enrichment/pdl.ts` | PDL company + person enrichment |
| `src/lib/enrichment/deep-crawler.ts` | Enhanced multi-page crawl orchestrator |
| `src/lib/enrichment/ai-classifier.ts` | COS taxonomy classification (Gemini Flash) |
| `src/lib/enrichment/client-extractor.ts` | Multi-signal client extraction with confidence scoring |
| `src/lib/enrichment/page-classifier.ts` | AI page type classification (regex + Gemini Flash fallback) |
| `src/lib/enrichment/case-study-ingestor.ts` | Multi-format case study ingestion |
| `src/lib/enrichment/case-study-analyzer.ts` | Visible + hidden layer analysis for case studies |
| `src/lib/enrichment/expert-classifier.ts` | Expert vs internal role classification |
| `src/lib/enrichment/specialist-generator.ts` | Specialist profile niche generation |
| `src/lib/enrichment/audit-logger.ts` | Enrichment audit trail logger |
| `src/lib/enrichment/graph-writer.ts` | Neo4j knowledge graph writer |
| `src/lib/enrichment/extractors/case-study-extractor.ts` | AI case study extraction |
| `src/lib/enrichment/extractors/team-extractor.ts` | AI team member extraction |
| `src/lib/enrichment/extractors/service-extractor.ts` | AI service offering extraction |
| `src/lib/onboarding/event-logger.ts` | Server-side onboarding event logger |
| `src/lib/onboarding/log-client.ts` | Client-side onboarding event logger |
| `src/inngest/functions/deep-crawl.ts` | Inngest deep crawl function |
| `src/inngest/functions/case-study-ingest.ts` | Inngest case study ingestion |
| `src/inngest/functions/firm-case-study-ingest.ts` | Inngest firm case study full pipeline |
| `src/inngest/functions/expert-linkedin.ts` | Inngest expert enrichment |
| `src/inngest/functions/weekly-recrawl.ts` | Inngest weekly recrawl cron |
| `src/inngest/functions/graph-sync.ts` | Inngest graph sync |
