# 14. API Reference

> Last updated: 2026-03-11

Comprehensive reference for all API routes in `src/app/api/`. Organized by domain.

---

## Authentication

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/auth/[...all]` | Better Auth catch-all handler (sign-in, sign-up, session, OAuth callbacks) | No |
| POST | `/api/auth/[...all]` | Better Auth catch-all handler (sign-in, sign-up, sign-out, token refresh) | No |

Better Auth handles all auth flows via this single catch-all route. Wraps `toNextJsHandler(auth)`.

---

## Chat & Conversations

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/chat` | Main Ossy chat endpoint. Streams AI responses via OpenRouter (Claude Sonnet 4). Persists messages, extracts memories, logs usage. Supports tool calls for authenticated users with a firm profile. | Yes |
| POST | `/api/chat/guest` | Guest chat endpoint. No auth, no billing. Hard-limited to 6 user messages per request. Reduced output (512 tokens). | No |
| GET | `/api/chat/greeting` | Generates a personalized returning-user greeting using memory context and last conversation. Uses Gemini Flash for speed. | Yes |
| POST | `/api/chat/migrate` | Stub to migrate guest conversation messages into an authenticated user's account. Currently logs only. | Yes |
| GET | `/api/conversations` | Returns the user's most recent conversation with all messages. Filter by `organizationId`. | Yes |

---

## Search

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/search` | Cascading partner search. Accepts natural language `query` + optional `filters` and `firmId`. Returns ranked match candidates with explanations via `executeSearch()`. | No |

---

## Enrichment Pipeline

All enrichment routes require authentication unless noted.

### Progressive Enrichment (Frontend Pipeline)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/enrich/lookup` | Cache check. Queries PostgreSQL + Neo4j for existing enrichment data by domain. Saves PDL/Jina credits on cache hits. | No |
| POST | `/api/enrich/pdl` | Stage 1: PDL company lookup. Returns firmographic data (name, size, revenue, location, industry). ~1s response. | No |
| POST | `/api/enrich/scrape` | Stage 2: Jina website scrape. Scrapes homepage + subpages, extracts clients, services, team, case studies. | No |
| POST | `/api/enrich/classify` | Stage 3: AI classification. Classifies raw content against COS taxonomy (30 categories, 247 L2 skills, industries, markets, languages). | Yes |
| POST | `/api/enrich/persist` | Final stage: Persists combined enrichment result to `serviceFirms` table + writes to Neo4j knowledge graph. | Yes |
| POST | `/api/enrich/cache` | Writes enrichment results to domain-keyed cache (no auth). Guests and auth users both write here. Lookup checks this first. | No |

### Combined Enrichment

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/enrich/website` | All-in-one enrichment pipeline: PDL + Jina (parallel), then AI classifier. Persists to DB. Used when progressive UI is not needed. | Yes |
| GET | `/api/enrich/firm` | Returns persisted enrichment data for a firm by `organizationId`. Used by EnrichmentProvider to hydrate from DB. | Yes |

### Expert & Entity Enrichment

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/enrich/person` | PDL person enrichment. Returns job history, skills, education. Accepts name+company, LinkedIn URL, or email. | Yes |
| POST | `/api/enrich/expert` | Queues expert enrichment via Inngest (`enrich/expert-linkedin`). PDL lookup + specialist profile generation. | Yes |
| POST | `/api/enrich/case-study` | Ingests a case study from URL, PDF upload, or raw text. Queues Inngest job (`enrich/case-study-ingest`). | Yes |
| POST | `/api/enrich/deep-crawl` | Queues a deep website crawl via Inngest (`enrich/deep-crawl`). Background processing for thorough site analysis. | Yes |

---

## Firm & Profiles

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/profile` | Returns confirmed enrichment data + partner preferences for the user's firm. Merges `serviceFirms.enrichmentData.confirmed` with `partnerPreferences`. | Yes |
| GET | `/api/firm/case-studies` | Lists firm's case studies by `organizationId`. Excludes soft-deleted entries. | Yes |
| POST | `/api/firm/case-studies` | Submits a new case study (URL, text paste, or PDF upload). Queues Inngest pipeline (`enrich/firm-case-study-ingest`). Max 10MB for PDFs. | Yes |
| DELETE | `/api/firm/case-studies/[id]` | Soft-deletes a case study. Verifies org membership. | Yes |

---

## Experts

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/experts` | Lists all expert profiles for a firm (by `firmId` or `organizationId`). Includes specialist profiles and quality summaries. | Yes |
| GET | `/api/experts/[id]` | Fetches a single expert profile with all specialist profiles and examples. | Yes |
| PUT | `/api/experts/[id]` | Updates expert overview fields (name, title, bio, photo, LinkedIn, etc.). | Yes |
| POST | `/api/experts/[id]/invite` | Sends a "claim your profile" email with a signed 7-day token. | Yes |
| GET | `/api/experts/claim` | Validates claim token, links the signed-in user to the expert profile, redirects to edit page. | No |
| GET | `/api/experts/[id]/specialist-profiles` | Lists specialist profiles for an expert with examples. | Yes |
| POST | `/api/experts/[id]/specialist-profiles` | Creates a new specialist profile. Auto-computes quality score. Auto-publishes if score >= 80. | Yes |
| GET | `/api/experts/[id]/specialist-profiles/[spId]` | Fetches a single specialist profile with examples. | Yes |
| PUT | `/api/experts/[id]/specialist-profiles/[spId]` | Updates a specialist profile. Recomputes quality score. Syncs examples (delete + re-insert). | Yes |
| DELETE | `/api/experts/[id]/specialist-profiles/[spId]` | Deletes a specialist profile. Recalculates `isPrimary` for remaining profiles. | Yes |

---

## Partnerships & Opportunities

### Partnerships

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/partnerships` | Lists partnerships for a firm (by `firmId`). Enriches with partner firm details. Optional `status` filter. | Yes |
| POST | `/api/partnerships` | Requests a new partnership between two firms. Checks for duplicates. Logs partnership event. | Yes |
| GET | `/api/partnerships/[id]` | Partnership details with event history and both firm details. | Yes |
| PATCH | `/api/partnerships/[id]` | Accept or decline a partnership. Only works on `requested`/`suggested` status. | Yes |
| DELETE | `/api/partnerships/[id]` | Deactivates a partnership (soft delete to `inactive` status). | Yes |
| POST | `/api/partnerships/intro` | Generates (and optionally sends) a three-way intro email between two partner firms. AI-generated content. | Yes |

### Opportunities
Private intelligence. Must be promoted to a Lead to share with the network.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/opportunities` | Lists opportunities for a firm by `firmId`. status/signal/priority filters supported. | Yes |
| POST | `/api/opportunities` | Creates opportunity. New fields: evidence, signalType, priority, resolutionApproach, requiredCategories, requiredMarkets, clientDomain, clientName, clientSizeBand, attachments. status defaults to "new". | Yes |
| GET | `/api/opportunities/[id]` | Opportunity details. | Yes |
| PATCH | `/api/opportunities/[id]` | Updates opportunity fields or status (new→in_review→actioned\|dismissed). | Yes |
| POST | `/api/opportunities/share` | **Promotes** an opportunity to a Lead. Body: `{ opportunityId, overrides? }`. Scores lead quality, inserts `leads` row, marks opportunity "actioned". Returns `{ leadId, qualityScore, qualityTier }`. | Yes |

### Leads
Shareable opportunities, quality-scored (score is internal only, not exposed to recipients).

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/leads` | Lists leads for a firm (own posted + shared-with-us). Supports `status` filter. | Yes |
| POST | `/api/leads` | Creates lead directly (without an opportunity source). Runs quality scoring. Returns `{ id, qualityScore, qualityTier }`. | Yes |
| GET | `/api/leads/[id]` | Lead details with shares + partner firm names. Includes quality breakdown. | Yes |
| PATCH | `/api/leads/[id]` | Updates lead fields or status. Re-scores quality when content fields change. | Yes |

### Referrals

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/referrals` | Lists referrals for a firm (given + received) by `firmId`. Includes summary stats (counts, values, conversion rates). | Yes |
| POST | `/api/referrals` | Creates a new referral between two firms. Optional `partnershipId` and `opportunityId` links. | Yes |

---

## Calls & Voice

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/calls` | Submits a call transcript for analysis. Queues Inngest job (`calls/analyze`). | Yes |
| GET | `/api/calls/[id]` | Fetches a scheduled call with its transcript and coaching report. | Yes |
| GET | `/api/calls/history` | Lists up to 50 recent calls for a firm (by `firmId`) with coaching report summaries. | Yes |
| POST | `/api/voice` | Processes voice input: generates AI response (Claude Sonnet 4), optionally returns TTS audio via ElevenLabs. | Yes |
| POST | `/api/voice/transcribe` | Proxies audio to Deepgram (Nova 3) for transcription. Keeps API key server-side. | No |

---

## Email

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/email/queue` | Lists pending emails in approval queue for a firm (by `firmId`). Optional `status` filter. | Yes |
| POST | `/api/email/queue` | Approves or rejects a queued email. On approve, sends via Resend. | Yes |

---

## Memory

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/memory` | Returns memory stats for the current user. Optional `?theme=` to get entries for a specific theme. | Yes |
| DELETE | `/api/memory` | Deletes memories. Body accepts `{ entryId }`, `{ theme }`, or `{ all: true }`. | Yes |

---

## Billing & Usage

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/billing/usage` | Returns plan info and current usage for an org (by `organizationId`). | No |
| POST | `/api/stripe/checkout` | Creates a Stripe Checkout session for upgrading to Pro or Enterprise. Body: `{ organizationId, plan, interval }`. | Yes |
| POST | `/api/stripe/portal` | Creates a Stripe Customer Portal session for managing billing. Body: `{ organizationId }`. | Yes |

---

## Dashboard & Onboarding

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/dashboard/stats` | Returns dashboard metrics: conversation/message counts, AI usage, firm enrichment status, partnership count, memory count, recent conversations. | Yes |
| POST | `/api/onboarding-events` | Ingestion endpoint for client-side onboarding funnel events. Works for guests (userId/orgId will be null). | No |

---

## Legacy Data

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/legacy/experts` | Returns expert profiles from legacy JSON data files. Requires `orgName` query param. Paginated. | No |
| GET | `/api/legacy/case-studies` | Returns case studies from legacy JSON data files. Requires `orgName` query param. Paginated. Optional `status` filter. | No |

---

## Admin APIs

All admin routes require `superadmin` role unless noted. Prefix: `/api/admin/`.

### Platform Metrics

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/admin/metrics` | Platform-wide metrics: total orgs, users, plan distribution, MRR, expert/client counts. | superadmin |
| GET | `/api/admin/finance` | AI cost analytics. Breakdown by feature/model/org/user. Daily trend data. Query params: `period`, `orgId`, `userId`, `breakdown`. | superadmin |
| GET | `/api/admin/api-health` | Health checks for all external APIs: OpenRouter, PDL, Jina, Deepgram, ElevenLabs, Resend, Recall.ai, Stripe, Neo4j, Neon Postgres. Returns quota/usage for each. | superadmin |
| GET | `/api/admin/onboarding` | Onboarding funnel analytics: domain submissions, cache hit rates, enrichment success rates, interview completion, drop-off analysis, daily trends, recent sessions. Query param: `period=7d\|30d\|90d\|all`. | superadmin |
| GET | `/api/admin/onboarding/sessions/[domain]` | Full session detail for a domain: all `onboarding_events` ordered ASC, enrichment audit log, firm enrichment data, partner preferences. `[domain]` is URL-encoded (e.g. `acme.com`). Returns 404 if no events found. | superadmin |
| POST | `/api/admin/search/test` | Debug run of the 3-layer cascade search. Body: `{ rawQuery, searcherFirmId?, skipLlmRanking? }`. Returns per-layer candidates (layer1/layer2/layer3), parsed filters, and stats. | superadmin |
| GET | `/api/admin/abstractions` | Lists abstraction profiles joined to serviceFirms. Stats: totalFirms, profilesGenerated, missingProfiles, avgConfidence. Query params: `missing=true` (firms with no profile), `limit`, `offset`. | superadmin |
| GET | `/api/admin/abstractions/[firmId]` | Full abstraction profile for one firm (hiddenNarrative, topSkills, typicalClientProfile, partnershipReadiness, evidenceSources, confidenceScores). | superadmin |
| POST | `/api/admin/abstractions/[firmId]` | Triggers `generateFirmAbstraction()` to regenerate the abstraction profile. Returns the newly generated profile. | superadmin |

### Organizations

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/admin/organizations` | Lists all organizations with subscription info and member count. | superadmin |
| GET | `/api/admin/organizations/[orgId]/details` | Org details: members, linked service firms, enrichment stats. | superadmin |
| GET | `/api/admin/organizations/[orgId]/members` | Lists members of an organization with user details. | superadmin |
| PATCH | `/api/admin/organizations/[orgId]/plan` | Updates an org's subscription plan (free/pro/enterprise). | superadmin |

### Firms Directory

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/admin/firms` | Universal firm directory. `source=platform` (PostgreSQL), `source=graph` (Neo4j), `source=all` (merged + deduplicated). Paginated with search. | superadmin |
| GET | `/api/admin/firms/[firmId]/related` | Returns experts, clients, and case studies associated with a firm. Resolves across imported_companies and service_firms. | superadmin |
| GET | `/api/admin/enrichment/[firmId]` | Enrichment audit trail for a firm. All enrichment steps with raw data, cost summary, and phase breakdown. | superadmin |

### Experts (Imported Contacts)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/admin/experts` | Lists imported contacts with classification filter (expert/internal/ambiguous), search, pagination. Includes company info. | superadmin |
| GET | `/api/admin/users/[userId]/expert-profile` | Matches a user's email against imported_contacts to find associated expert profiles. | superadmin |

### Clients

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/admin/clients` | Lists Company nodes from Neo4j (client companies). Enriched properties (logo, description, employees, revenue). Paginated with search. | superadmin |

### Graph Associations

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/admin/graph/associations` | Returns associated nodes for a given graph node. Supports Organization (experts/caseStudies/clients) and Company (firms/caseStudies) node types. | superadmin |

### Knowledge Graph

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/admin/knowledge-graph/stats` | Counts for all Knowledge Graph tabs: Service Providers, Solution Partners, Experts, Clients, Case Studies, Attributes. | superadmin |
| GET | `/api/admin/knowledge-graph/attributes` | Distinct attribute values (skills/industries/markets/languages) with occurrence counts. Paginated with search. | superadmin |
| GET | `/api/admin/knowledge-graph/case-studies` | Paginated imported case studies with search and filters (status, industry, firmName). | superadmin |
| GET | `/api/admin/knowledge-graph/solution-partners` | Paginated solution partners with search and category filter. | superadmin |

### Partnerships (Admin)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/admin/partnerships` | Lists all partnerships platform-wide with firm names. | superadmin |
| GET | `/api/admin/partnerships/stats` | Aggregated stats: partnership counts by status, referral counts, opportunity counts. | superadmin |
| POST | `/api/admin/partnerships/intro` | Queues a partnership intro email for admin-initiated intros. Uses `queuePartnershipIntro()`. | admin |

### Opportunities & Leads (Admin)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/admin/opportunities?period=30d` | Opportunity funnel stats (byStatus, bySignal, byPriority, bySource), lead stats (byStatus, avgQuality, qualityTiers, shares), recentOpportunities (20), recentLeads (20). | superadmin |

### Email (Admin)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/admin/email/queue` | Lists emails by tab: `pending` (approval queue), `sent` (outbound), `received` (inbound). | admin |
| PATCH | `/api/admin/email/queue/[id]` | Edits a queued email's subject, body HTML, or body text before approval. | admin |
| POST | `/api/admin/email/queue/[id]/approve` | Approves a queued email and fires Inngest `email/send-now` event. | admin |
| POST | `/api/admin/email/queue/[id]/reject` | Rejects a queued email. | admin |

### Settings

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/admin/settings` | Returns all platform settings, or a specific setting by `?key=`. | admin |
| POST | `/api/admin/settings` | Upserts one or more settings. Body: `{ key, value }` or array. | admin |

### Data Import (n8n Pipeline)

All import routes are protected by `ADMIN_SECRET` header (not session auth).

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/admin/import/companies` | Imports a batch of companies from n8n workflow into `imported_companies`. | ADMIN_SECRET |
| POST | `/api/admin/import/contacts` | Imports contacts from n8n. Filters out investors. Auto-classifies expert/internal. | ADMIN_SECRET |
| POST | `/api/admin/import/case-studies` | Imports legacy case study records into `imported_case_studies`. | ADMIN_SECRET |
| POST | `/api/admin/import/clients` | Imports legacy client records into `imported_clients`. | ADMIN_SECRET |
| POST | `/api/admin/import/outreach` | Imports outreach messages from n8n's fact.messages table into `imported_outreach`. | ADMIN_SECRET |
| GET | `/api/admin/import/stats` | Returns migration statistics for the admin dashboard. | ADMIN_SECRET |
| POST | `/api/admin/import/sync-graph` | Syncs imported companies and contacts to Neo4j knowledge graph. Uses MERGE (idempotent). | ADMIN_SECRET |
| POST | `/api/admin/import/populate-graph` | Populates graph in 3 modes: `sync` (sync firms to Neo4j), `promote` (promote imported companies to ServiceFirm nodes), `classify` (AI-classify firms). File: `src/app/api/admin/import/populate-graph/route.ts`. | ADMIN_SECRET |

### Neo4j Management

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/admin/neo4j/seed` | Sets up Neo4j schema (constraints + indexes) and seeds taxonomy data (categories, skills L1-L3, markets, languages, firm types, industries). | ADMIN_SECRET |
| POST | `/api/admin/neo4j/migrate` | Runs legacy data migration from JSON files into Neo4j. Optional `steps` array in body to run specific steps. | ADMIN_SECRET |

---

## Webhooks

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/webhooks/stripe` | Stripe webhook handler. Processes: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.paid`. Verifies signature. Logs events to `subscriptionEvents`. | Stripe signature |
| POST | `/api/webhooks/email` | Inbound email webhook (Resend). Receives emails sent to ossy@joincollectiveos.com. Stores in threads/messages. Triggers Inngest `email/process-inbound`. | Bearer token |
| POST | `/api/webhook/email/inbound` | Resend inbound email webhook (v2). HMAC-SHA256 signature validation. Thread detection via `inReplyTo`. Calendar invite detection (ICS parsing). Creates `scheduledCalls` for meeting invites. Schedules Inngest `calls/join-meeting`. | Svix signature |
| POST | `/api/webhook/recall/transcript` | Recall.ai transcript webhook. Receives transcripts when meetings end. Assembles diarized transcript. Creates `callRecordings` + `callTranscripts`. Fires Inngest `calls/analyze`. | Svix signature |

---

## Inngest

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/inngest` | Inngest serve endpoint. Registers all background job functions for discovery. | No |
| POST | `/api/inngest` | Inngest event receiver. Dispatches events to registered functions. | No |
| PUT | `/api/inngest` | Inngest serve endpoint (used for function registration). | No |

### Registered Inngest Functions

- `deepCrawl` -- Deep website crawl for thorough firm analysis
- `graphSyncFirm` -- Syncs firm data to Neo4j knowledge graph
- `caseStudyIngest` -- Processes case study from URL/text/PDF
- `firmCaseStudyIngest` -- Processes firm-submitted case studies
- `expertLinkedIn` -- Expert enrichment via PDL + specialist profile generation
- `weeklyRecrawl` -- Scheduled weekly re-enrichment of firm websites
- `extractMemories` -- Extracts and stores memories from conversations
- `postCallAnalysis` -- AI analysis of call transcripts (coaching reports)
- `processInboundEmail` -- Classifies and processes inbound emails
- `scheduleFollowUp` -- Schedules follow-up actions from emails/calls
- `checkStalePartnerships` -- Identifies inactive or stale partnerships
- `weeklyDigest` -- Generates weekly activity digest emails
- `sendApprovedEmail` -- Sends emails that have been approved in the queue
- `joinMeeting` -- Deploys Recall.ai bot to join scheduled meetings

---

## Public API

No authentication required. Optional `x-api-key` header (configurable). CORS enabled. Designed for third-party integrations.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/public/taxonomy` | Returns the full COS taxonomy: categories (30), skills (L1+L2, 276 items), firm relationships. Optional `?section=categories|skills|relationships`. 1-hour cache. | Optional API key |
| GET | `/api/public/firms` | Returns public firm directory. Only firms with `isPlatformMember=true`. Paginated (`limit`, `offset`). Optional `firmType` filter. | Optional API key |
| GET | `/api/public/experts` | Returns enriched expert abstraction profiles. Paginated. Optional `firmId` filter. | Optional API key |
| GET | `/api/public/case-studies` | Returns enriched case study abstraction profiles. Paginated. Optional `firmId` filter. | Optional API key |
| GET | `/api/public/health` | Health check for all public APIs. Returns status, latency, and record counts for taxonomy, experts, case studies, and firms endpoints. | No |

---

## Partner Sync API

Server-to-server API for bi-directional data sync with partner platforms (e.g., Chameleon Collective CORE). All routes require `x-api-key` and `x-partner-id` headers. Auth is validated by `src/app/api/partner-sync/lib/auth.ts` against the `PARTNER_SYNC_API_KEY` env var and an allow-list of partner IDs.

### Taxonomy & Schema

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/partner-sync/taxonomy` | Returns the full COS taxonomy (skills L1/L2/L3, categories, industries, markets, languages, firm types, services, tech categories, firm relationship edges). Called daily by CORE's `graph_taxonomy` sync job. Uses `src/lib/taxonomy-full.ts`. | Partner key |
| GET | `/api/partner-sync/schema-manifest` | Returns the COS knowledge graph schema: node labels, edge types, property lists, and uniqueness constraints. CORE checks this to detect schema version drift. Includes a `version` and `lastChanged` timestamp. | Partner key |

### Entity Sync

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/partner-sync/entities` | Accepts a batch of entity pushes from the partner. Body: `{ entities: [{ type, id, data, source }] }`. Supported types: `Company`, `Person`, `CaseStudy`, `ServiceFirm`. Upserts into PostgreSQL. Logs a `migrationBatches` record per batch. | Partner key |
| GET | `/api/partner-sync/entities` | Returns entities previously synced for a partner. Query params: `type` (required, one of Company/Person/CaseStudy/ServiceFirm), `partnerId` (required), `limit` (default 1000, max 5000). | Partner key |

### User Provisioning

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/partner-sync/provision-user` | Creates a COS user account and adds them to the matching org (resolved via email domain). Body: `{ name?, email }`. If user already exists, returns existing userId and orgId. | Partner key |
| POST | `/api/partner-sync/deprovision-user` | Removes a user from the partner's organization (does not delete the user account). Body: `{ email }`. Org resolved via email domain matching against `serviceFirms.website`. | Partner key |

---

## Route Count Summary

| Domain | Routes |
|--------|--------|
| Authentication | 1 (catch-all) |
| Chat & Conversations | 5 |
| Search | 1 |
| Enrichment Pipeline | 10 |
| Firm & Profiles | 4 |
| Experts | 8 |
| Partnerships & Opportunities | 9 |
| Referrals | 1 |
| Calls & Voice | 5 |
| Email | 1 |
| Memory | 1 |
| Billing & Usage | 3 |
| Dashboard & Onboarding | 2 |
| Legacy Data | 2 |
| Admin APIs | 28 |
| Webhooks | 4 |
| Inngest | 1 |
| Public API | 5 |
| Partner Sync | 5 |
| **Total** | **96 route files** |
