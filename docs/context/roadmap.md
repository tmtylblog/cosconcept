# 18. Roadmap & Status

> Last updated: 2026-03-20

## Phase Overview

| Phase | Name | Status | Summary |
|-------|------|--------|---------|
| 0 | Project Scaffold | Done | Next.js 15, Drizzle, Neo4j, Better Auth, Vercel deploy, design tokens |
| 1 | Ossy Chat Core | Done | Claude Sonnet chat, streaming, conversation persistence, voice I/O shell |
| 2 | Org & Expert Profiles | Done | Orgs, members, expert profiles, enrichment pipeline, billing, admin |
| 3 | Knowledge Graph | In Progress | Neo4j schema + seed done, graph-sync Inngest partial, pgvector not live, partner sync API live |
| 4 | Search & Matching | In Progress | Three-layer search + 5 Ossy tools wired, graph population admin route built, needs firm data in graph |
| 5 | Partnerships & Opportunities | In Progress | Partnership CRUD, referrals, intros, opportunity extraction — UI built, partner sync API live |
| 6 | Call Intelligence | In Progress | Recall.ai integration, transcript upload, opportunity extraction pipeline, configurable extraction prompt, participant auto-classification |
| 7 | Email Agent | In Progress | Resend email client, inbound processing, approval queue — early MVP |
| 8 | Advanced Features | Planned | Social graph analysis, meeting bot improvements, advanced coaching |

---

## Phase 0: Project Scaffold — Done

**What was delivered:**
- Next.js 15 App Router + TypeScript project initialized
- Tailwind CSS 4 with `cos-` design token prefix (`globals.css` via `@theme`)
- shadcn/ui + Radix primitives + Lucide icons
- Neon PostgreSQL + Drizzle ORM (replaced Prisma)
- Neo4j Aura connection (`src/lib/neo4j.ts`)
- Better Auth v1.5.4 with Google OAuth + email/password
- Vercel deployment pipeline (git push auto-deploy)
- Zod v4 for env validation (`src/lib/env.ts`)
- Sentry error tracking
- Landing page (`src/app/site/page.tsx`)
- Basic layout shell with chat-first interface skeleton

**Key files:**
- `src/app/globals.css` — design tokens
- `src/lib/env.ts` — env validation
- `src/lib/utils.ts` — `cn()` utility
- `drizzle.config.ts` — Drizzle Kit config

---

## Phase 1: Ossy Chat Core — Done

**What was delivered:**
- Vercel AI SDK integration with Claude Sonnet (via OpenRouter)
- Full-screen chat UI (`src/components/chat-panel.tsx`)
- Chat persistence — conversations + messages in Neon
- Ossy personality/system prompt with brand voice
- Streaming text responses
- Voice I/O infrastructure:
  - Deepgram Nova-3 STT (`src/lib/voice/deepgram-stt.ts`)
  - ElevenLabs TTS (`src/lib/voice/elevenlabs-tts.ts`)
  - Voice manager orchestrator (`src/lib/voice/voice-manager.ts`)
  - Audio capture (`src/lib/voice/audio-capture.ts`)
  - Voice toggle button (`src/components/voice-button.tsx`)
  - Voice API route (`src/app/api/voice/route.ts`)
- Guest chat (pre-auth) (`src/app/api/chat/guest/route.ts`)
- Chat migration (guest to authenticated) (`src/app/api/chat/migrate/route.ts`)
- Conversation history API (`src/app/api/conversations/route.ts`)
- Memory extraction from conversations (`src/lib/ai/memory-extractor.ts`)
- Memory retrieval for context (`src/lib/ai/memory-retriever.ts`)
- Tool result rendering in chat (firm cards, expert cards, case study cards)

**Key files:**
- `src/components/chat-panel.tsx` — main chat component
- `src/lib/voice/` — full voice I/O stack (4 files)
- `src/lib/ai/memory-extractor.ts`, `src/lib/ai/memory-retriever.ts`

**Not done (deferred):**
- Voice latency optimization (<1s target not verified in production)
- Advanced voice features (interruption handling, waveform indicator)

---

## Phase 2: Org & Expert Profiles — Done

**What was delivered:**
- Drizzle schema: 43+ tables including users, organizations, members, subscriptions, serviceFirms, expertProfiles, specialistProfiles, partnerPreferences, conversations, messages, memoryEntries, memoryThemes, enrichmentAuditLog, onboardingEvents, aiUsageLog
- Organization CRUD with Better Auth org plugin
- Org select flow (`src/app/(auth)/org/select/page.tsx`)
- Expert profile system: overview + specialist profiles (`src/app/(app)/experts/`)
  - PDL experience picker (`src/components/experts/pdl-experience-picker.tsx`)
  - Specialist profile card + editor
- Website scraping pipeline (Jina via `src/lib/enrichment/jina-scraper.ts`)
- Deep crawler for multi-page enrichment (`src/lib/enrichment/deep-crawler.ts`)
- AI classification pipeline (`src/lib/enrichment/ai-classifier.ts`)
- Service extraction (`src/lib/enrichment/extractors/service-extractor.ts`)
- Team extraction (`src/lib/enrichment/extractors/team-extractor.ts`)
- Case study extraction (`src/lib/enrichment/extractors/case-study-extractor.ts`)
- Client extraction (`src/lib/enrichment/client-extractor.ts`)
- PDL enrichment (`src/lib/enrichment/pdl.ts`) — People Data Labs for company data
- Page classifier (`src/lib/enrichment/page-classifier.ts`)
- Expert classifier (`src/lib/enrichment/expert-classifier.ts`)
- Specialist profile generator (`src/lib/enrichment/specialist-generator.ts`)
- Enrichment audit logging (`src/lib/enrichment/audit-logger.ts`)
- Graph writer — sync enrichment to Neo4j (`src/lib/enrichment/graph-writer.ts`)
- Billing / Stripe: subscriptions, webhooks, plan limits, feature gates
  - `src/lib/billing/` — gate.ts, plan-limits.ts, usage-checker.ts, create-free-subscription.ts
  - `src/app/api/webhooks/stripe/route.ts`
  - `src/app/(app)/settings/billing/page.tsx`
- Inngest background jobs: deep-crawl, case-study-ingest, graph-sync, weekly-recrawl, extract-memories
- Dashboard page (`src/app/(app)/dashboard/page.tsx`) — chat-focused onboarding, progressive reveal cards
- Firm page (`src/app/(app)/firm/page.tsx`)
- Case study management (`src/app/(app)/firm/case-studies/page.tsx`)
- Settings: profile, team, notifications, security, memory, billing
- Admin dashboard (15+ pages):
  - Organizations, Users, Experts, Clients, Partnerships, Finance, Subscriptions
  - Knowledge Graph viewer, Neo4j admin, Enrichment viewer
  - Email settings, Email viewer, API health, APIs, Onboarding funnel
- n8n legacy data import pipeline (`src/lib/neo4j-migrate-legacy.ts`, `src/app/(app)/admin/migration/page.tsx`)
- Imported data tables: companies, contacts, outreach, clients, case studies + migration batches
- Public API endpoints: `/api/public/taxonomy`, `/api/public/experts`, `/api/public/firms`, `/api/public/case-studies`, `/api/public/health`

**Key files:**
- `src/lib/db/schema.ts` — 43+ Drizzle tables
- `src/lib/enrichment/` — 13 enrichment modules
- `src/lib/billing/` — 4 billing modules
- `src/app/(admin)/admin/` — 15+ admin pages

---

## Phase 3: Knowledge Graph Population — In Progress

**What's done:**
- Neo4j schema with constraints + indexes (`src/lib/neo4j-schema.ts`)
  - 12 node labels: ServiceFirm, Expert, Skill, SkillL1, Industry, Market, CaseStudy, Client, Service, Category, Language, FirmType
  - Full-text search indexes on firms, experts, case studies
  - Property indexes for fast lookups
- Taxonomy seeding script (`src/lib/neo4j-seed.ts`)
  - Categories (30), Skills L1/L2 (247), Skills L2/L3 (18,421), Firm Relationships (346), Markets (200+), Languages (75+), Firm Types (10), Industries
  - Taxonomy reference module (`src/lib/taxonomy/index.ts`)
- Graph-sync Inngest function (`src/inngest/functions/graph-sync.ts`)
- Graph writer for enrichment data (`src/lib/enrichment/graph-writer.ts`)
- Case study analysis and ingestion (`src/lib/enrichment/case-study-analyzer.ts`, `src/lib/enrichment/case-study-ingestor.ts`)
- Firm case study ingest Inngest function
- Admin Knowledge Graph page with 6 entity tabs
- Admin Neo4j management page
- Legacy n8n data import to Neo4j

**What's in progress:**
- Graph-sync Inngest function is basic — only syncs firm-level data, does not handle full relationship graph (experts, case studies, clients as nodes)
- Enrichment-to-graph pipeline works for individual firms but not at scale

**What's new (2026-03-11):**
- **Partner Sync API** — 6 REST endpoints under `/api/partner-sync/` for bidirectional knowledge graph sync with Chameleon Collective CORE. Live in production.
- **Taxonomy shared module** (`src/lib/taxonomy-full.ts`) — extracted static data from `neo4j-seed.ts` for reuse by seed script + taxonomy API
- **Graph population admin route** (`POST /api/admin/import/populate-graph`) — batch sync enriched `service_firms` to Neo4j, with promote and classify modes
- **Ossy search tools** — 5 tools wired in `ossy-tools.ts`: `search_partners`, `search_experts`, `search_case_studies`, `lookup_firm`, `get_my_profile`
- **Firm lookup** (`src/lib/matching/firm-lookup.ts`) — PG + Neo4j firm detail query
- **Expert search** (`src/lib/matching/expert-search.ts`) — ILIKE + JSONB search on expert_profiles
- **Case study search** (`src/lib/matching/case-study-search.ts`) — tag-filtered search on firm_case_studies

**What's not done (gaps):**
- **Global firm database import pipeline** — no bulk import of 1.5M+ firms
- **Global client database** — Client nodes are created per-firm enrichment, no global dedup pipeline
- **Client logo recognition pipeline** — no vision model integration for identifying client logos from websites
- ~~**pgvector not live**~~ — **RESOLVED (2026-03-12).** 1,152 firms have Jina embeddings in `abstraction_profiles`.
- **Abstraction profile auto-computation** — `src/lib/matching/abstraction-generator.ts` exists but not triggered automatically on content changes
- **Website re-crawl scheduler** — Inngest cron `weekly-recrawl.ts` exists but unclear if running in production
- **Periodic rebuild** — no weekly full re-computation of abstraction profiles

**Dependencies:**
- Phase 4 (Search & Matching) depends on graph being populated with real data
- Phase 4 depends on pgvector embeddings being generated

---

## Phase 4: Search & Matching Engine — In Progress (Partially Implemented)

**What's done:**
- Full three-layer cascading search architecture implemented:
  - `src/lib/matching/search.ts` — orchestrator
  - `src/lib/matching/query-parser.ts` — NL query to structured filters
  - `src/lib/matching/structured-filter.ts` — Layer 1: Neo4j graph traversal
  - `src/lib/matching/vector-search.ts` — Layer 2: pgvector similarity
  - `src/lib/matching/deep-ranker.ts` — Layer 3: LLM ranking with explanations
  - `src/lib/matching/abstraction-generator.ts` — abstraction profile computation
  - `src/lib/matching/types.ts` — shared types
- Search API endpoint (`src/app/api/search/route.ts`)
- Discover page with search UI (`src/app/(app)/discover/page.tsx`)
  - Search results with match scores, explanations, bidirectional fit
  - Request partnership directly from search results
  - Search stats display (candidate counts, cost, duration)

**What's done (2026-03-12 additions):**
- PostgreSQL search hardcoded (`USE_PG_SEARCH = true`) — Neo4j routing eliminated; all 1,152 firms searchable
- 1,152 abstraction profiles with 1024-dim Jina embeddings — Layer 2 vector search fully operational
- `firm_services`: 7,301 rows covering 1,105 firms (96%) — auto-populated from `enrichment_data.extracted.services`
- `firm_case_studies`: 773+ rows, 150+ firms — ongoing website crawl discovery via `_discover_case_studies.mjs`
- `expert_profiles`: 5,899 rows, 910 firms — PDL batch discovery complete
- `/discover` page fixed: tool access unlocked for discover section, `firmId` optional in `ossy-tools.ts`

**What's done (2026-03-17 additions):**
- **Discover UX overhaul** — 3-column layout: Nav | Content Feed | Ossy Chat
  - Center content feed with inline result cards, firm detail blocks, expert detail blocks
  - Result cards: dismissible (X button), clickable, staggered slide-up animation
  - Firm detail blocks: tabbed (Overview/Case Studies/Experts/Details), closable
  - Expert detail blocks: inline with search relevance highlighting, closable
  - Dedup: clicking same entity twice prevented
  - Auto-scroll to new detail blocks on click
- **Ossy consultative behavior** — sharpening follow-ups, conversation continuity, refinement comparisons
  - `_sharpeningHints` in discover_search tool results (category splits, evidence gaps, etc.)
  - System prompt enforces: always respond after search, compare refinements, maintain continuity
  - Contextual commentary when user views profiles — with actual profile data, not just names
- **Page event system for discover** — `discover_firm_viewed` / `discover_expert_viewed` events
  - Events include full `dataSummary` (categories, skills, industries, case studies, experts)
  - Emitted after data loads (not before), 2s polling flush, no per-section limits
  - `[PAGE_EVENT]` messages hidden from chat UI
- **Empty result handling** — `search_experts` and `search_case_studies` return `_instruction` on empty results for conversational response
- **Legacy components deprecated:** `discover-drawer.tsx`, `discover-results.tsx` replaced by inline stream blocks

**What's not done (gaps):**
- **Abstraction profiles not auto-triggered** — no Inngest job to compute profiles when content changes
- **Bidirectional matching needs real data** — logic exists but untested at scale
- **Match explanation quality** — depends on having rich abstraction profiles
- **AI cost gateway** — `src/lib/ai/gateway.ts` exists as a stub, not wired to all AI calls
- **Redis caching** — Upstash Redis planned for popular search pattern caching, not implemented
- **Proactive matchmaking** — no automatic match generation on firm onboard or preference update
- **Dynamic profile highlighting** — not implemented (show attributes most relevant to viewer)

**Blockers:**
- Phase 3 (Knowledge Graph) must have real data populated before search returns meaningful results
- pgvector embeddings must be generated for Layer 2 to work properly

---

## Phase 5: Partnerships & Opportunities — In Progress (Partially Implemented)

**What's done:**
- Partnership lifecycle schema: partnerships table with status flow (suggested, requested, accepted, declined, inactive)
- Partnership events tracking (`partnershipEvents` table)
- Partnership CRUD API (`src/app/api/partnerships/route.ts`, `src/app/api/partnerships/[id]/route.ts`)
- Partnership intro emails (`src/app/api/partnerships/intro/route.ts`, `src/lib/email/intro-generator.ts`, `src/lib/email/send-partnership-intro.ts`)
- Partnerships page (`src/app/(app)/partnerships/page.tsx`) — list, filter, accept/decline
- Referrals API (`src/app/api/referrals/route.ts`) — referral tracking + conversion
- Opportunities schema: opportunities + opportunityShares tables
- Opportunities CRUD API (`src/app/api/opportunities/route.ts`, `src/app/api/opportunities/[id]/route.ts`)
- Opportunity sharing API (`src/app/api/opportunities/share/route.ts`)
- AI opportunity extraction from call transcripts (`src/lib/ai/opportunity-extractor.ts`)
- Network page (`src/app/(app)/network/page.tsx`)
- Admin partnerships page
- Partnership types defined (`src/types/partnerships.ts`)
- Intro email template (`src/lib/email/templates/intro-email.ts`)

**What's not done (gaps):**
- ~~**Conversational onboarding flow**~~ — **DONE (2026-03-11)** v2 5-question interview live, answers sync to PG + Neo4j PREFERS edges
- **Collectives** — group partnership containers not implemented (schema does not include collectives table)
- **Vendor networks** — one-directional partner visibility not implemented
- **Platform messaging** — no real-time messaging between firms (no Ably/Pusher)
- **Three-way intro emails** — basic intro exists but not the full Ossy-mediated three-way introduction
- **Visibility controls** — case study visibility levels (public/partners/private) not enforced in queries
- **Hidden opportunity detection** — no passive signal monitoring in chat/emails for unmet needs

---

## Phase 6: Call Intelligence & Chrome Extension — In Progress

**What's done:**
- Call data API (`src/app/api/calls/route.ts`) — submit transcripts, list calls
- Call history page (`src/app/(app)/calls/page.tsx`) + detail page (`src/app/(app)/calls/[id]/page.tsx`)
- Post-call analysis Inngest function (`src/inngest/functions/post-call-analysis.ts`)
  - Opportunity extraction from transcripts
  - Coaching analysis (talking time, value prop clarity, topics)
  - Coaching report generation and storage
  - Coaching report email delivery (two-party for partnership calls)
  - Related expert/case study lookup via Neo4j
- Coaching analyzer (`src/lib/ai/coaching-analyzer.ts`)
- Coaching reports schema (`coachingReports` table)
- Call recordings + call transcripts + scheduled calls schemas
- Recall.ai bot integration (`src/inngest/functions/join-meeting.ts`)
  - Sends Ossy bot into meetings
  - `src/lib/recall.ts` — Recall.ai API client
  - Recall.ai health check endpoint
  - Participant auto-classification (service provider vs external company domains)
  - Auto-fires `research/company` jobs for unknown external participant domains
- Recall.ai webhook for receiving transcripts
- **Transcript upload** — admin and frontend chat support paste text, .txt, .docx (via mammoth)
- **Opportunity extraction pipeline** — complete end-to-end, auto-matches opportunities to specialist profiles
- **Configurable extraction prompt** — stored in `platform_settings`, editable via `/admin/calls/settings`
- **Enhanced default prompt** — better pitch vs pain point distinction, latent signal detection, `platformMatchHint` field

**What's not done (gaps):**
- **Chrome extension** — not built (no Manifest V3 extension for tab audio capture)
- **Real-time Deepgram streaming** during calls — no live transcription pipeline
- **Calendar invite detection** — partially done via email parsing, not robust
- **Ossy post-call debrief in chat** — coaching data stored but not surfaced conversationally

---

## Phase 7: Ossy Email Agent — In Progress (Early MVP)

**What's done:**
- Email client via Resend (`src/lib/email/email-client.ts`)
- Inbound email processing Inngest function (`src/inngest/functions/process-inbound-email.ts`)
  - Intent classification (`src/lib/ai/email-intent-classifier.ts`)
  - Context extraction from emails
  - AI response generation (via OpenRouter)
  - Auto-send for high-confidence intents (threshold 0.92)
  - Approval queue for lower-confidence responses
- Email approval queue schema (`emailApprovalQueue` table)
- Email threads + messages schemas
- Email queue management page (`src/app/(app)/email/queue/page.tsx`)
- Admin email page + email settings page
- Approved email sending Inngest function (`src/inngest/functions/send-approved-email.ts`)
- Follow-up reminders Inngest function (`src/inngest/functions/follow-up-reminders.ts`)
- Weekly digest Inngest function (`src/inngest/functions/weekly-digest.ts`)
- Email templates: intro email, weekly digest, follow-up reminder, coaching report
- `RESEND_DEV_OVERRIDE` env safeguard for development

**What's not done (gaps):**
- **ossy@joincollectiveos.com not live** — email address configured but inbound processing not verified in production
- **CC'd email monitoring** — pipeline exists but not tested with real CC'd emails
- **Email response understanding** — basic intent classification done, but no advanced action item extraction from replies
- **Three-way partnership intros via email** — intro generator exists but not the full automated Ossy-mediated flow

---

## Phase 8: Advanced Features — Planned (Future)

**Nothing built yet. Planned features:**
- Social graph analysis (LinkedIn CSV import for relationship mapping)
- Meeting bot improvements via Recall.ai (robust joining, multi-platform)
- Advanced voice agent (interruption handling, multi-turn voice conversations)
- Global client database enrichment pipeline
- Admin dashboard: AI costs tracking, matching quality metrics, user analytics
- Onboarding analytics: conversion funnel, time-to-first-match
- Advanced coaching: pattern recognition across multiple calls
- Collective analytics and reporting

---

## Known Gaps & TODOs (Prioritized)

### Critical (blocks core value proposition)

1. ~~**Knowledge graph needs real firm data**~~ — **RESOLVED (2026-03-12).** All 1,152 customer firms are enriched (scrape + classify). PostgreSQL search is now hardcoded (`USE_PG_SEARCH = true`); Neo4j routing eliminated. `abstraction_profiles` table has 1,152 rows with 1024-dim Jina embeddings. `/discover` now returns results.
2. ~~**pgvector embeddings not generated**~~ — **RESOLVED (2026-03-12).** All 1,152 enriched firms have Jina `jina-embeddings-v3` embeddings (1024-dim) in `abstraction_profiles`. Layer 2 vector search is operational. Dimension bug (1536→1024) fixed in admin backfill route.
3. **Abstraction profile auto-computation** — no Inngest trigger when content changes; profiles must be manually triggered
4. **Graph-sync incomplete** — only syncs firm-level data, not full entity graph (experts, case studies, clients as separate nodes with edges)

### High Priority (needed for launch)

5. ~~**Conversational onboarding flow**~~ — **DONE (2026-03-11)** Redesigned from 9→5 questions. v2 interview implemented in Ossy system prompt + tools. Answers sync to PG + Neo4j PREFERS edges. See `preference-writer.ts`, `ossy-tools.ts`, `update-profile-field.ts`
6. **Collectives + vendor networks** — schema and UI not built
7. **Platform messaging** — no real-time firm-to-firm messaging (Ably/Pusher not integrated)
8. **AI cost gateway** — stub exists but not wired to track actual AI spend
9. **Chrome extension for call recording** — not started; Phase 6 depends on Recall.ai bot only
10. **ossy@ email address in production** — email pipeline built but not verified live

### Medium Priority (polish and scale)

11. **Dynamic profile highlighting** — not implemented
12. **Redis caching for search** — Upstash not integrated
13. **Proactive matchmaking** — no auto-generation of matches on firm events (bidirectional graph filter now exists but not auto-triggered)
14. **Visibility controls enforcement** — public/partners/private not enforced in queries
15. **Voice latency optimization** — not tested against <1s target
16. **Hidden opportunity detection** — no passive signal monitoring

### Low Priority (future enhancement)

17. **Global firm database import** — bulk pipeline for 1.5M+ firms
18. **Client logo recognition** — vision model integration for portfolio pages
19. **LinkedIn CSV upload** — social graph mapping
20. **Meeting bot improvements** — Recall.ai robustness
21. **Advanced call coaching** — cross-call pattern recognition

---

## Recent Development Activity

From git log (most recent first, as of 2026-03-09):

| Commit | Description |
|--------|-------------|
| `3b4d001` | fix: PDL data not showing — cache was returning empty companyData |
| `31113a3` | feat: onboarding funnel dashboard + fix firm card Neo4j cache bug |
| `1d6d950` | feat: case study management UI — submit, track, manage |
| `63de8a6` | docs: add n8n legacy data dictionary for dev annotation |
| `b0a7a9a` | fix: gap-aware cache lookup — only call paid APIs for missing data |
| `8567d64` | fix: security hardening, bug fixes, merge conflict resolution |
| `641db78` | feat: check own data (Postgres + Neo4j) before calling paid APIs |
| `0a0437b` | feat: wire enrichment persist into Neo4j knowledge graph |
| `378cab8` | feat: add RESEND_DEV_OVERRIDE env safeguard to email client |
| `4e3b44d` | feat: wire firm page to DB expert profiles with quality badges |
| `5895612` | feat: admin API health dashboard with quota monitoring |
| `2670fd5` | fix: enrichment data survives page reload + org timing race |
| `589db7d` | feat: progressive enrichment with firm card skeleton fix |
| `58be9c3` | feat: expert profile system — overview + specialist profiles |
| `3594ebe` | feat: Ossy Email Agent + Call Intelligence MVP |
| `b6079ef` | fix: filter garbage from client extraction, show full PDL data at top |
| `63841a6` | feat: add taxonomy references to partner preference questions |
| `cff2158` | feat: real-time dashboard cards from Ossy chat confirmations |
| `55cf9a1` | feat: add Knowledge Graph admin page with 6 entity tabs |

**Recent focus areas:** enrichment pipeline stabilization, expert profile system, case study management, admin tooling, email/call MVPs.

### Recent Activity (2026-03-11)

| Commit | Description |
|--------|-------------|
| `e70064d` | docs: update context files for partner sync API endpoints |
| `80bbfd5` | feat: add partner sync API for Chameleon Collective CORE integration |
| `221f311` | docs: update context files for search tools and graph population route |
| `b652fcc` | feat: wire Ossy search tools + graph population admin route |
| `ba0586d` | docs: update context files for PREFERS edges, bidirectional matching, and Neo4j migration |
| `4da588b` | fix: use Category label instead of FirmCategory in preference-writer |
| `b6cb362` | feat: wire onboarding answers to Neo4j PREFERS edges + bidirectional matching |
| `579dad7` | refactor: redesign onboarding from 9 questions to 5 high-signal questions |
| `dd55de9` | chore: clean up utility scripts for Track A alignment + push taxonomy tables |
| `669b162` | refactor: modernize Neo4j graph layer and deprecate legacy code for Track A |
| `83ea21f` | refactor: migrate admin routes to canonical tables for Track A alignment |
| `3162d45` | chore: add Track A columns to existing tables |

**Focus:** Track A data migration, onboarding redesign, bidirectional matching, Ossy search tools, partner sync API with CORE.

### Recent Activity (2026-03-12)

| Commit | Description |
|--------|-------------|
| `335d757` | fix: ensure services/case studies populate for all firms regardless of domain redirect |
| `c2432d7` | feat: coming-soon pages for Network/Partnerships, chat UX fixes, discover search loading |
| `51ccc70` | feat: grouped expert roster by tier in admin — Experts, Potential, Not Expert sections |
| `7abf50e` | feat: add backfill services/case studies tool to enrichment admin page |
| `21cdc0a` | feat: auto-seed services and case studies on first load, retry stuck jobs after 48h |

**Focus:** Offering/Experience page population fix — multi-layer enrichment cache fallback with HTTP redirect resolution. Admin Knowledge Graph expert grouping by tier.

### Recent Activity (2026-03-12 evening — Data Agent)

| Commit | Description |
|--------|-------------|
| `4f5e254` | data: add bulk enrichment, embedding backfill, and firm connection scripts |
| `f5cc17b` | fix: trim Stripe env vars to prevent whitespace corruption |
| `d8aae16` | chore: add Stripe connectivity test endpoint |
| `6554221` | fix: default to PostgreSQL search — Neo4j firmIds don't map to service_firms |
| `c86e361` | fix: unlock search_partners for discover page without a firm profile |
| `3308b18` | fix: correct Jina embedding dimensions from 1536 to 1024 in admin backfill route |

**Focus:** Data completeness — all 1,152 firms enriched + embedded; discover page search working end-to-end. Firm connections (services, case studies, experts) wired to profile pages.

### Recent Milestones (2026-03-20)

- **AI pipeline classification engine (Gemini Flash)** — auto-classifies inbound responses into 16 stages, auto-stage-progression, stage protection rules, Stripe payment triggers deal progression
- **Transcript upload + opportunity extraction** on both admin and frontend chat — paste text, .txt, .docx support
- **Participant auto-classification** for Recall.ai calls — service providers vs external companies, auto-fires research jobs for unknown domains
- **Admin auth fully separated from customer app** — dedicated `/admin-login` route, staff creation without frontend signup
- **LinkedIn analytics dashboard** with per-account metrics, deal source tracking, outreach account attribution, per-account notes
- **Performance fix:** resolved `setInterval` churn in chat panel that was causing browser freeze on partner-matching page
- **Growth Ops enhancements:** deal source tracking, outreach account attribution, per-account notes

---

## Phase Dependencies

```
Phase 0 (Scaffold) ──→ Phase 1 (Chat) ──→ Phase 2 (Profiles)
                                              │
                                              ▼
                                        Phase 3 (Graph) ──→ Phase 4 (Matching)
                                              │                    │
                                              │                    ▼
                                              │              Phase 5 (Partnerships)
                                              │
                                              ▼
                                        Phase 6 (Calls) ──→ Phase 8 (Advanced)
                                              │
                                              ▼
                                        Phase 7 (Email)
```

**Key dependency chains:**
- Phase 4 (Search) is blocked by Phase 3 (Graph data must be populated + pgvector embeddings generated)
- Phase 5 (Partnerships) depends on Phase 4 (meaningful matches drive partnership discovery)
- Phase 6 (Calls) and Phase 7 (Email) are semi-independent — both have MVP code but need production hardening
- Phase 8 (Advanced) depends on all prior phases being stable

---

## Critical Blockers

1. ~~**Graph needs firm data**~~ — **RESOLVED (2026-03-12).** All 1,152 firms enriched + PostgreSQL search hardcoded. Search is bypassing Neo4j and using `abstraction_profiles` vector search directly. Discover page returns results.

2. ~~**pgvector not operational**~~ — **RESOLVED (2026-03-12).** 1,152 abstraction profiles with 1024-dim embeddings. Dimension bug fixed (was 1536, Jina max is 1024).

3. **Graph-sync is shallow** — The Inngest function `graph-sync-firm` only calls `writeFirmToGraph()` for top-level firm data. It does not create Expert, CaseStudy, or Client nodes with their full relationship edges. This means even enriched firms are only partially represented in Neo4j.

4. ~~**No conversational onboarding**~~ — **RESOLVED (2026-03-11).** v2 5-question interview live. Answers → PG + Neo4j PREFERS edges. Bidirectional matching uses these edges.

5. ~~**No search tools in Ossy**~~ — **RESOLVED (2026-03-11).** All 5 tools wired: `search_partners`, `search_experts`, `search_case_studies`, `lookup_firm`, `get_my_profile`. Backend functions built in `src/lib/matching/`.

6. ~~**No partner sync**~~ — **RESOLVED (2026-03-11).** Partner Sync API live in production (6 endpoints). `PARTNER_SYNC_API_KEY` configured on Vercel. Chameleon Collective CORE can connect.
