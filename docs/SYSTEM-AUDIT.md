# Collective OS — System Audit & Architecture Documentation

**Date:** 2026-03-08
**Scope:** Full codebase review — 200 TypeScript files, 67+ API routes, 15+ database tables
**Codebase:** Next.js 15 (App Router) + TypeScript + Tailwind CSS 4

---

## Table of Contents

1. [Conceptual Overview](#1-conceptual-overview)
2. [Architecture Deep Dive](#2-architecture-deep-dive)
3. [Key Concepts & Design Philosophy](#3-key-concepts--design-philosophy)
4. [Security Audit](#4-security-audit)
5. [Bug Report](#5-bug-report)
6. [Technical Debt & Concerns](#6-technical-debt--concerns)
7. [Strategic Analysis](#7-strategic-analysis)
8. [Multi-Dev Conflict Analysis](#8-multi-dev-conflict-analysis)
9. [Recommended Fix Priority](#9-recommended-fix-priority)

---

## 1. Conceptual Overview

### What is Collective OS?

Collective OS is a **growth platform for professional services firms** — agencies, consultancies, fractional leaders, managed service providers — that replaces broken business development with **partnership-driven growth**. Instead of cold outreach and RFPs, firms find complementary partners through AI-powered matching based on what they've actually done (case studies, client work, real capabilities).

### The Core Insight

Most partnership platforms fail because they rely on self-described capabilities ("We're great at Shopify!"). COS takes a radically different approach:

1. **Ground Truth Principle:** What firms have actually done (projects, case studies, verified client work) matters more than what they say they can do
2. **Abstraction Layer:** A hidden, AI-generated profile derived from actual work evidence — not self-description — powers all matching
3. **Complementary Matching:** The best partnerships are between firms that do *different* things, not identical ones

### How It Works (User Journey)

1. **Sign up with a corporate email** — the email domain IS the firm identifier
2. **Ossy (the AI consultant) already knows you** — it scraped your website, found your case studies, identified your capabilities before you said a word
3. **Conversational onboarding** — Ossy confirms what it found ("I see you focus on Shopify Plus development in the DTC space — is that right?") and fills in the gaps
4. **Automatic enrichment** — Background jobs crawl your site, extract case studies, build your abstraction profile, sync to the knowledge graph
5. **Partner discovery** — Search and match against 1,000+ firms using cascading search: structured filters → vector similarity → LLM ranking
6. **Partnership management** — Introduce, connect, track partnerships. Ossy can email on your behalf, analyze calls, extract opportunities

### The "Magic" Strategy

Every interaction should feel like the system already knows you:
- Derive firm name from email domain
- Auto-scrape firm website from email domain
- Infer capabilities, industries, and services from case studies
- Pre-match partners before the user even asks
- Ossy should already know things about the user's firm before they tell it

---

## 2. Architecture Deep Dive

### 2.1 Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | Next.js 15 (App Router) | Server-rendered React, API routes, middleware |
| Language | TypeScript (strict) | Type safety across the full stack |
| Styling | Tailwind CSS 4 + `cos-` design tokens | Consistent branding via `@theme` in globals.css |
| UI Library | shadcn/ui + Radix + Lucide | Accessible components, consistent primitives |
| Auth | Better Auth v1.5+ | Database-first auth with org/role plugins |
| Relational DB | Neon PostgreSQL + Drizzle ORM | User data, firms, partnerships, AI usage |
| Graph DB | Neo4j Aura | Knowledge graph — firms, skills, industries, case studies |
| AI Models | Multi-model via Vercel AI SDK + OpenRouter | Claude Sonnet (chat), Gemini Flash (classification), OpenAI (embeddings) |
| Background Jobs | Inngest | Event-driven enrichment, crawling, email processing |
| Validation | Zod v4 | Runtime validation for AI outputs, API requests |
| Deployment | Vercel | Auto-deploy from git |

### 2.2 Project Structure (200 files)

```
src/
├── app/                          # Next.js App Router pages & API routes
│   ├── (admin)/                  # Admin panel (superadmin-only layout)
│   │   ├── layout.tsx            # Admin sidebar + role check
│   │   └── admin/                # 12 admin pages (overview, users, firms, etc.)
│   ├── (app)/                    # Main application (authenticated layout)
│   │   ├── layout.tsx            # Chat-first layout with slide panel
│   │   ├── dashboard/            # Main dashboard
│   │   ├── discover/             # Partner search & matching
│   │   ├── firm/                 # Firm profile + case studies
│   │   ├── partnerships/         # Partnership management
│   │   ├── network/              # Network overview
│   │   ├── calls/                # Call intelligence
│   │   ├── email/                # Email queue management
│   │   └── settings/             # Profile, billing, team, memory, security
│   ├── (auth)/                   # Auth pages (login, org select, banned)
│   └── api/                      # 67+ API routes
│       ├── admin/                # Admin management APIs
│       ├── chat/                 # Ossy chat (main, guest, greeting, migrate)
│       ├── enrich/               # Enrichment pipelines (website, person, classify, etc.)
│       ├── partnerships/         # Partnership CRUD
│       ├── opportunities/        # Opportunity management
│       ├── search/               # Partner search
│       ├── billing/              # Usage tracking
│       ├── stripe/               # Payment integration
│       ├── webhooks/             # Stripe + email webhooks
│       └── public/               # Public taxonomy, firms, experts endpoints
│
├── components/                   # React components
│   ├── chat-panel.tsx            # Main Ossy chat UI (right sidebar)
│   ├── nav-bar.tsx               # App navigation
│   ├── login-panel.tsx           # Auth modal
│   ├── landing-page.tsx          # Marketing page
│   ├── voice-button.tsx          # Push-to-talk voice input
│   ├── chat/                     # Chat result cards (firms, experts, case studies)
│   ├── admin/                    # Admin panel components (tabs, types)
│   └── ui/                       # shadcn/ui primitives
│
├── hooks/                        # Client-side React hooks
│   ├── use-enrichment.ts         # Enrichment status polling
│   ├── use-legacy-data.ts        # Legacy data loading
│   └── use-plan.ts               # Subscription plan detection
│
├── inngest/                      # Background job functions
│   ├── client.ts                 # Inngest client + event type definitions
│   └── functions/                # 11 background job functions
│       ├── deep-crawl.ts         # Multi-page website crawl
│       ├── case-study-ingest.ts  # Legacy case study ingestion
│       ├── firm-case-study-ingest.ts  # NEW: User-managed case study pipeline
│       ├── expert-linkedin.ts    # LinkedIn enrichment
│       ├── extract-memories.ts   # Conversation memory extraction
│       ├── graph-sync.ts         # Sync firm to Neo4j
│       ├── weekly-recrawl.ts     # Cron: re-crawl all firm websites
│       ├── weekly-digest.ts      # Cron: email digest
│       ├── post-call-analysis.ts # Call intelligence analysis
│       ├── process-inbound-email.ts  # Email agent
│       └── follow-up-reminders.ts    # Automated follow-ups
│
├── lib/                          # Core business logic
│   ├── ai/                       # AI layer
│   │   ├── gateway.ts            # Cost tracking for all AI calls
│   │   ├── ossy-prompt.ts        # Ossy system prompt (personality, modes)
│   │   ├── ossy-tools.ts         # Ossy's search/lookup tools
│   │   ├── memory-extractor.ts   # Extract memories from conversations
│   │   ├── memory-retriever.ts   # Retrieve relevant memories
│   │   ├── coaching-analyzer.ts  # Partnership coaching analysis
│   │   ├── email-intent-classifier.ts  # Email classification
│   │   └── opportunity-extractor.ts    # Extract opportunities from text
│   │
│   ├── enrichment/               # Data enrichment pipeline
│   │   ├── jina-scraper.ts       # Web scraping via Jina Reader API
│   │   ├── deep-crawler.ts       # Multi-page intelligent crawling
│   │   ├── page-classifier.ts    # Classify page types (case study, about, etc.)
│   │   ├── case-study-ingestor.ts    # Multi-format case study extraction
│   │   ├── case-study-analyzer.ts    # NEW: Summary + abstraction generation
│   │   ├── ai-classifier.ts     # Firm type classification
│   │   ├── specialist-generator.ts   # Generate specialist profiles
│   │   ├── expert-classifier.ts  # Expert role classification
│   │   ├── graph-writer.ts       # Write entities to Neo4j
│   │   ├── audit-logger.ts       # Enrichment audit trail
│   │   ├── pdl.ts                # People Data Labs integration
│   │   └── extractors/           # Specialized extractors (services, team, case studies)
│   │
│   ├── matching/                 # Search & matching engine
│   │   ├── search.ts             # Main search orchestrator
│   │   ├── query-parser.ts       # AI-powered query parsing
│   │   ├── structured-filter.ts  # Structured Neo4j filtering
│   │   ├── vector-search.ts      # Vector similarity search
│   │   ├── deep-ranker.ts        # LLM-powered result ranking
│   │   ├── abstraction-generator.ts  # Generate hidden firm profiles
│   │   └── types.ts              # Search type definitions
│   │
│   ├── db/                       # Database layer
│   │   ├── schema.ts             # 35 tables, 7 enums (Drizzle ORM)
│   │   └── index.ts              # Neon serverless connection
│   │
│   ├── email/                    # Email system
│   │   ├── email-client.ts       # Send emails
│   │   ├── intro-generator.ts    # AI-generated partnership introductions
│   │   └── templates/            # Email templates (intro, digest, follow-up)
│   │
│   ├── voice/                    # Voice interface
│   │   ├── audio-capture.ts      # Browser audio capture
│   │   ├── deepgram-stt.ts       # Speech-to-text
│   │   ├── elevenlabs-tts.ts     # Text-to-speech
│   │   └── voice-manager.ts      # Voice session management
│   │
│   ├── billing/                  # Subscription & billing
│   │   ├── plan-limits.ts        # Free/Pro/Enterprise feature gates
│   │   ├── gate.ts               # Billing enforcement
│   │   ├── usage-checker.ts      # Usage tracking
│   │   └── create-free-subscription.ts
│   │
│   ├── auth.ts                   # Better Auth server config
│   ├── auth-client.ts            # Client-side auth hooks
│   ├── neo4j.ts                  # Neo4j driver singleton
│   ├── stripe.ts                 # Stripe client
│   ├── env.ts                    # Zod environment validation
│   └── taxonomy.ts               # Skill/industry taxonomy helpers
│
├── middleware.ts                  # Cookie-based auth check for protected routes
└── types/                        # Shared TypeScript types
```

### 2.3 Database Architecture

**Neon PostgreSQL (35 tables):**

Core Domain:
- `users` / `sessions` / `accounts` — Better Auth managed
- `organizations` / `members` / `invitations` — Multi-tenant org model
- `service_firms` — The central firm entity
- `partner_preferences` — What firms want in partners
- `partnerships` — Firm-to-firm partnership records
- `opportunities` — Shared business opportunities
- `referrals` — Referral tracking

AI & Enrichment:
- `conversations` / `messages` / `memories` — Chat history and extracted memories
- `ai_usage_log` — Cost tracking for all AI calls
- `enrichment_audit_log` — Full enrichment pipeline audit trail
- `abstraction_profiles` — Hidden AI-generated profiles (the secret sauce)
- `firm_case_studies` — NEW: User-managed case studies with AI analysis

Import/Legacy:
- `imported_companies` / `imported_contacts` / `imported_case_studies` / `imported_clients` / `imported_outreach` — Legacy data import

Infrastructure:
- `subscriptions` — Billing plans
- `email_threads` / `email_messages` / `email_approval_queue` — Email system
- `scheduled_calls` / `call_transcripts` — Call intelligence

**Neo4j Aura (Knowledge Graph):**

```
(ServiceFirm) --[OFFERS_SERVICE]--> (Service)
(ServiceFirm) --[HAS_SKILL]--> (Skill)
(ServiceFirm) --[OPERATES_IN]--> (Market)
(ServiceFirm) --[WORKS_IN]--> (Industry)
(ServiceFirm) --[HAS_CASE_STUDY]--> (CaseStudy)
(ServiceFirm) --[USES_PLATFORM]--> (SolutionPartner)
(CaseStudy) --[FOR_CLIENT]--> (Client)
(CaseStudy) --[DEMONSTRATES_SKILL]--> (Skill)
(CaseStudy) --[IN_INDUSTRY]--> (Industry)
(Expert) --[WORKS_AT]--> (ServiceFirm)
(Expert) --[HAS_SKILL]--> (Skill)
```

### 2.4 AI Architecture

**Multi-Model Strategy:**

| Model | Use Case | Cost/1K tokens |
|-------|----------|----------------|
| Claude Sonnet 4 (via OpenRouter) | Ossy chat, complex reasoning | $3.00/$15.00 |
| Gemini 2.0 Flash (via OpenRouter) | Classification, extraction, case study analysis | $0.10/$0.40 |
| Gemini Pro 1.5 | Deep ranking, complex matching | $1.25/$5.00 |
| OpenAI text-embedding-3-small | Vector embeddings (planned) | $0.02/— |

**Cost Tracking:** Every AI call goes through `src/lib/ai/gateway.ts` which logs model, tokens, cost, duration, and feature to the `ai_usage_log` table.

**Ossy Chat Architecture:**
```
User Message → /api/chat/route.ts
  → Resolve session, org, firm, memories
  → Build system prompt (ossy-prompt.ts with mode-specific context)
  → Attach tools if user has firm (ossy-tools.ts)
  → Stream response via OpenRouter (Claude Sonnet)
  → After stream: fire memory extraction event via Inngest
```

**Ossy Modes:**
1. **GUEST PREVIEW** — Unauthenticated, warm + encouraging, nudges toward sign-up
2. **ONBOARDING** — New user with firm, confirms enrichment data, asks 7 questions one at a time
3. **POST-ONBOARDING** — Returning user with memories, full tool access, consultative
4. **GENERAL** — Authenticated with firm but no memories yet

**Ossy Tools (5):**
- `search_partners` — Search complementary firms
- `search_experts` — Find individual professionals
- `search_case_studies` — Find real project examples
- `lookup_firm` — Get details about a specific firm
- `get_my_profile` — View the user's own firm profile

### 2.5 Enrichment Pipeline

When a user signs up with a corporate email:

```
1. Email domain → website URL
2. Jina scrape homepage → basic info
3. PDL Company API → employee count, industry, description
4. AI classify firm type (Gemini Flash)
5. Store in service_firms + fire Inngest "enrich/deep-crawl"

Deep Crawl (background, Inngest):
6. Crawl 10-15 pages intelligently (classify each page type)
7. Extract services, team members, case studies
8. For each case study URL → fire "enrich/case-study-ingest"
9. Generate abstraction profile (hidden matching layer)
10. Write everything to Neo4j knowledge graph
```

### 2.6 The Matching Engine

**Cascading Search** — filters 99% of data before any LLM call:

```
User Query: "Shopify agencies in Europe that do DTC brands"

Step 1: Query Parser (Gemini Flash) → structured intent
  { skills: ["Shopify"], markets: ["Europe"], industries: ["DTC/E-commerce"] }

Step 2: Structured Filter (Neo4j Cypher) → ~50 candidates
  MATCH (f:ServiceFirm)-[:HAS_SKILL]->(s:Skill {name: "Shopify"})
  WHERE f.market IN ["UK", "Germany", "France", ...]

Step 3: Vector Search (planned, pgvector) → re-rank by semantic similarity

Step 4: Deep Ranker (Gemini Pro) → top 5-10 with explanations
  "This firm is a strong match because their case studies show..."
```

---

## 3. Key Concepts & Design Philosophy

### 3.1 The Abstraction Layer

This is the competitive moat. Every firm has two profiles:

1. **Visible Profile** — What users see: firm name, services, case study summaries, tags
2. **Hidden Profile** (`abstraction_profiles` table) — What powers matching:
   - `hiddenNarrative` — AI-interpreted capability proof, partnership signals, referral profiles
   - `confidenceScores` — Evidence strength, taxonomy mapping
   - `evidenceSources` — What real data backs up the claims

The hidden layer answers: "Based on everything this firm has *actually done*, what are they truly capable of, and who would be their ideal partner?"

### 3.2 Ground Truth Principle

The platform doesn't trust self-descriptions. It trusts evidence:
- Case studies with named clients and metrics = strong evidence
- Website copy about capabilities = weak evidence
- LinkedIn endorsements = noise

Each piece of evidence gets an `evidenceStrength` rating (weak/moderate/strong) that feeds into match quality.

### 3.3 Chat-First UX

The primary interface is a conversation with Ossy, not a traditional dashboard. The chat panel lives on the right side of every page. Users can:
- Search for partners by describing what they need
- Ask Ossy to explain a match recommendation
- Get strategic advice on partnership approaches
- Navigate the platform through conversation

### 3.4 Memory System

Ossy remembers past conversations via extracted memories:
- After each conversation, Inngest fires `memory/extract`
- AI extracts key facts: firm capabilities, preferences, challenges, goals
- Memories are stored in the `memories` table with themes (capability, preference, challenge, etc.)
- When Ossy chats with a returning user, relevant memories are loaded and injected into the system prompt
- This creates continuity: "Last time you mentioned wanting to expand into the UK market..."

### 3.5 Multi-Tenant Architecture

- Every user belongs to an `organization` (1:1 with a firm)
- Organizations have `members` with roles (owner/admin/member)
- Data is scoped to organizations via `organizationId` foreign keys
- Better Auth's organization plugin handles membership and invitations

---

## 4. Security Audit

### CRITICAL (3 Issues)

#### S1. Admin/Import Routes Open When ADMIN_SECRET Is Unset

The auth check on all 9 admin import and Neo4j management routes uses a conditional pattern that silently passes when the env var is absent:

```typescript
// If expectedSecret is undefined, the entire check is skipped
if (expectedSecret && secret !== expectedSecret) { return 401; }
```

**Affected:** `api/admin/neo4j/seed`, `api/admin/neo4j/migrate`, `api/admin/import/*` (7 routes)

**Fix:** Invert the logic: `if (!expectedSecret || secret !== expectedSecret)`

#### S2. Email Webhook Secret Bypass — Same Pattern

`api/webhooks/email/route.ts` — same conditional bypass. An attacker can inject fabricated inbound emails.

#### S3. Rate Limiting Explicitly Disabled

`src/lib/auth.ts` — `rateLimit: { enabled: false }`. Login, registration, and password reset are vulnerable to brute-force attacks in production.

### HIGH (6 Issues)

#### S4. Unauthenticated Enrichment Routes — Cost Abuse

7 enrichment endpoints have zero auth. An attacker can consume paid API credits (PDL, OpenRouter, Jina):
- `api/enrich/person`, `api/enrich/classify`, `api/enrich/deep-crawl`
- `api/enrich/expert`, `api/enrich/case-study`, `api/enrich/website`

#### S5. Unauthenticated Stripe Routes

`api/stripe/checkout` and `api/stripe/portal` accept any `organizationId` without auth.

#### S6. Unauthenticated Search and Voice

`api/search` and `api/voice/transcribe` — data leakage and Deepgram cost abuse.

#### S7. Admin Routes Without Role Verification

`api/admin/organizations` and `api/admin/metrics` skip `superadmin` role check. Any authenticated user can access platform-wide data.

#### S8. Unauthenticated Billing Usage

`api/billing/usage` serves billing data for any `organizationId` with no auth.

#### S9. Missing Tenant Isolation

Multiple authenticated routes accept `firmId`/`organizationId` from the client without verifying the user belongs to that org. An authenticated user can access another firm's partnerships, opportunities, referrals, and email queue.

### MEDIUM (5 Issues)

- Middleware only checks cookie *existence*, not validity
- Error responses leak stack traces and internal details
- `ADMIN_SECRET` and `EMAIL_WEBHOOK_SECRET` not in Zod env validation
- Admin import routes are in middleware's PUBLIC_EXCEPTIONS list
- Guest chat has no server-side rate limiting (client-provided `messageCount` is trivially bypassable)

---

## 5. Bug Report

### CRITICAL BUGS

#### B1. Undefined CSS Token: `cos-accent-warm`

4 files reference `text-cos-accent-warm` and `bg-cos-accent-warm/10`, but this token is **never defined** in `globals.css`. Elements using it render with no color (invisible text or missing backgrounds).

**Files:** `discover/page.tsx`, `calls/page.tsx`, `partnerships/page.tsx`
**Fix:** Replace `cos-accent-warm` with `cos-warm` (the actual defined token)

#### B2. Invalid Tailwind Class: `h-4.5` / `w-4.5`

7 instances in admin pages use `h-4.5 w-4.5`. Not a valid Tailwind 4 size class — silently ignored, icons have no dimensions.

**Fix:** Use `h-4 w-4` or `h-5 w-5`

#### B3. Shared `editInput` State Across Tag Sections

`firm/page.tsx` — single `editInput` state shared across 8 `EditableTagSection` components. Input text persists when switching between sections.

**Fix:** Clear `editInput` when `editingSection` changes, or use per-section state

#### B4. Abstraction Profile Loading Discards Most Data

When the abstraction profile is loaded for matching, only the `hiddenNarrative` text is used. The `confidenceScores` (containing taxonomy mapping, evidence strength) and `evidenceSources` are not passed to the matching engine. This means the rich AI-generated data that powers matching is being generated but never actually used.

**Impact:** The entire matching competitive advantage is undermined by this single bug.

### HIGH BUGS

#### B5. `conversationId` Always Null in Chat

`chat-panel.tsx` — `conversationIdRef` is never assigned a value. Every chat message is sent with `conversationId: null`, meaning the server creates a new conversation for each page load instead of continuing existing ones.

#### B6. Inngest Event Type Mismatches

Two event types define data fields in `client.ts` that don't match what the function handlers expect:
- `CaseStudyIngestEvent.data` has no `rawText` or `filename` fields, but the handler destructures them
- Event field names don't always match between definition and usage

#### B7. 13 AI-Calling Files Bypass Cost Tracking

Many files use `generateObject` or `generateText` directly without going through the AI Gateway. The cost tracking is incomplete:
- `case-study-ingestor.ts`, `page-classifier.ts`, `deep-crawler.ts` — enrichment calls not tracked
- `ossy-tools.ts` — tool executions not tracked
- Various extractors in `extractors/` directory

#### B8. Zod v3/v4 Version Conflict

`ossy-tools.ts` imports from `"zod/v4"` but uses a `zodSchema()` wrapper to make it compatible with the AI SDK, which expects Zod v3. This required a complete type erasure (`tool as (...args: any[]) => any`) to bypass TypeScript. Any future changes to these tools will have zero type checking.

### MEDIUM BUGS

- Non-functional PDF extraction (placeholder byte extraction, not a real PDF parser)
- Guest chat rate limit is client-side only (trivially bypassable)
- Duplicate memory extraction (inline in chat route AND via Inngest event)
- Non-transactional Neo4j writes (partial failures leave inconsistent graph state)
- Admin migration page under `(app)` layout instead of `(admin)` — missing role check

---

## 6. Technical Debt & Concerns

### 6.1 Zero Database Indexes

Beyond primary keys, there are **no indexes** on the PostgreSQL tables. At scale, this will cause severe query performance issues on:
- `memories` (queried by `userId` + `organizationId` on every chat)
- `ai_usage_log` (queried for billing/usage reports)
- `enrichment_audit_log` (queried by `firmId`)
- `firm_case_studies` (queried by `firmId` + `organizationId`)

### 6.2 No Composite Unique Constraints

The `partnerships` table has no unique constraint on `(firmAId, firmBId)`, allowing duplicate partnership records.

### 6.3 Missing FK Constraints

- `firmCaseStudies.organizationId` — no FK to `organizations` table
- `abstractionProfiles.entityId` — no FK to any entity table (by design since it's polymorphic, but risky)

### 6.4 Inconsistent Design Token Usage

Multiple pages use raw Tailwind colors (`green-100`, `blue-600`, `purple-100`) instead of the `cos-` design token system. 5+ files affected. Makes theme changes impossible without touching every file.

### 6.5 No Error Boundaries

The `(app)` route group has no `error.tsx` boundary. Any child page rendering error crashes the entire app layout with no recovery. The `(admin)` group does have one.

### 6.6 No Accessibility Labels

Almost zero `aria-label` attributes across the entire codebase. Only 1 instance found (mobile chat button). All interactive buttons, nav elements, and form controls lack screen reader support.

### 6.7 Missing `STATUS.md`

Required by `CLAUDE.md` for multi-dev coordination but does not exist.

### 6.8 Stashed Changes

One git stash exists with uncommitted WIP work. Should be reviewed and resolved.

---

## 7. Strategic Analysis

### 7.1 What's Working Well

- **The chat-first UX is genuinely differentiated.** Most B2B platforms use form-heavy dashboards. COS makes the AI consultant the primary interface.
- **The enrichment pipeline is sophisticated.** Multi-page intelligent crawling + case study extraction + AI classification is a real competitive advantage.
- **The abstraction layer concept is brilliant.** If the loading bug (B4) is fixed, the hidden profile layer provides matching intelligence no competitor has.
- **Cost-conscious AI usage.** Using Gemini Flash (~$0.001/call) for classification and extraction while reserving Claude Sonnet for chat is smart cost architecture.
- **The memory system creates genuine continuity.** Returning users feel like Ossy already knows them.

### 7.2 Strategic Risks

1. **The matching engine depends on Neo4j being populated.** If enrichment fails or the graph is empty, the entire search experience breaks. There's no graceful fallback.

2. **Single-model dependency on OpenRouter.** All AI calls go through OpenRouter. If OpenRouter has an outage or changes pricing, every feature stops working simultaneously.

3. **AI cost at scale.** At 1,000 firms with 5 case studies each, the enrichment cost is ~$5,000. Manageable. But adding voice, email analysis, and weekly recrawls at 10,000 firms makes costs a concern without aggressive caching.

4. **Cold start problem.** The platform's value depends on having many firms with rich data. Early users will get poor match results because the graph is sparse.

5. **Weekly recrawl queues all firms at once.** The `weeklyRecrawl` function loads ALL firm websites and sends events for each. At scale, this could overwhelm Inngest's queue and the external APIs.

### 7.3 What to Improve

1. **Fix the abstraction profile loading** (B4) — this single fix unlocks the entire matching competitive advantage
2. **Add database indexes** — prevent performance cliff at scale
3. **Implement progressive enrichment** — don't wait for the full pipeline to complete before showing something useful
4. **Add a fallback search** — if Neo4j is empty or down, fall back to PostgreSQL text search
5. **Batch the weekly recrawl** — process firms in waves with delays, not all at once

---

## 8. Multi-Dev Conflict Analysis

### Git History Review

Three committer identities appear in the git history:
1. `freddie@joincollectiveos.com`
2. `freddie@chameleon.co`
3. `tmtylblog@gmail.com`

There is evidence of one merged PR from `tmtylblog/dev-1/feat/admin-overhaul`. The `CLAUDE.md` defines strict multi-dev coordination rules, but the required `STATUS.md` does not exist.

### Conflict Risk Assessment

**Files at highest risk of cross-dev conflicts:**

| File | Reason | Risk |
|------|--------|------|
| `src/lib/db/schema.ts` | Schema changes from multiple devs | HIGH — schema should be serialized |
| `src/app/api/chat/route.ts` | Core chat flow, frequently modified | HIGH |
| `src/lib/ai/ossy-prompt.ts` | Prompt changes affect all modes | MEDIUM |
| `src/lib/ai/ossy-tools.ts` | Tool additions by multiple devs | MEDIUM |
| `src/app/(app)/layout.tsx` | Layout changes affect all pages | MEDIUM |
| `src/middleware.ts` | Auth changes affect all routes | HIGH |
| `src/inngest/functions/index.ts` | New function registration | LOW (additive) |
| `src/app/api/inngest/route.ts` | Same — additive changes | LOW |

### Current Working Directory State

There are **13+ uncommitted modified files** in the working tree, including critical files like `schema.ts`, `chat/route.ts`, `ossy-prompt.ts`, and `ossy-tools.ts`. These need to be committed promptly to avoid conflicts.

### Recommendations

1. **Create `STATUS.md` immediately** — list each dev's current task and files being modified
2. **Commit schema changes separately and push immediately** — per CLAUDE.md rules
3. **The 13 uncommitted files should be committed in logical groups** — not as one giant commit
4. **Consider branch-per-feature** for the remaining case study management work to avoid stepping on other devs

---

## 9. Recommended Fix Priority

### Tier 1: Fix Now (Security + Data Loss Risk)

| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| 1 | S1: Fix ADMIN_SECRET bypass (invert conditional) | 15 min | Prevents public admin access |
| 2 | S2: Fix EMAIL_WEBHOOK_SECRET bypass | 5 min | Prevents email injection |
| 3 | S3: Re-enable rate limiting | 1 min | Prevents brute-force login |
| 4 | S4: Add auth to enrichment routes | 30 min | Prevents API cost abuse |
| 5 | S5: Add auth to Stripe routes | 15 min | Prevents billing manipulation |

### Tier 2: Fix This Week (Bugs + UX)

| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| 6 | B1: Fix `cos-accent-warm` → `cos-warm` | 5 min | Visible text/icons appear |
| 7 | B2: Fix `h-4.5` → `h-4` or `h-5` | 5 min | Admin icons render correctly |
| 8 | B4: Fix abstraction profile loading | 30 min | Matching engine actually works |
| 9 | B5: Fix `conversationId` always null | 20 min | Chat continuity across sessions |
| 10 | S7: Add role check to admin/organizations + metrics | 10 min | Admin data protected |
| 11 | S9: Add tenant isolation to partnership/opportunity routes | 1 hr | Cross-tenant data leaks fixed |

### Tier 3: Fix This Sprint (Performance + Quality)

| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| 12 | Add database indexes | 30 min | Prevents perf cliff at scale |
| 13 | Add `error.tsx` boundary to (app) layout | 10 min | Graceful error recovery |
| 14 | Fix inconsistent design tokens | 30 min | Theme consistency |
| 15 | Add missing env vars to Zod schema | 15 min | Prevents silent misconfig |
| 16 | Move admin/migration from (app) to (admin) | 15 min | Proper auth enforcement |
| 17 | Create STATUS.md | 10 min | Multi-dev coordination |

### Tier 4: Fix Over Time (Tech Debt)

| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| 18 | Route AI calls through gateway consistently | 2 hrs | Complete cost tracking |
| 19 | Add accessibility labels | 2 hrs | Screen reader support |
| 20 | Batch weekly recrawl | 1 hr | Prevents queue overflow at scale |
| 21 | Implement real PDF extraction | 1 hr | PDF case study support |
| 22 | Resolve Zod v3/v4 conflict properly | 2 hrs | Restore type safety on tools |
| 23 | Add dark mode support | 4 hrs | User preference support |
