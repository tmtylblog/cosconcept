# 12. Admin Dashboard

> Last updated: 2026-03-11

## Overview

The admin dashboard is the superadmin-only control center for Collective OS. It lives under the `(admin)` route group at `/admin/*` and provides visibility into platform health, knowledge graph data, user management, billing, AI spend, partnerships, and operational tooling.

**Route group:** `src/app/(admin)/admin/`
**Layout:** `src/app/(admin)/layout.tsx` (server-side, Better Auth session check)
**Error boundary:** `src/app/(admin)/admin/error.tsx`

---

## Access Control

### Layout-level gate (server-side)
The admin layout (`src/app/(admin)/layout.tsx`) performs a server-side session check using `auth.api.getSession()`. It redirects to `/login` if no session exists and to `/dashboard` if the user's role is not `superadmin`.

### Middleware
`src/middleware.ts` protects all `/api/admin/*` routes by checking for the existence of a Better Auth session cookie. It does not verify the role -- that happens in individual API route handlers.

**Public exceptions** (protected by `x-admin-secret` header instead):
- `/api/admin/neo4j/seed`
- `/api/admin/neo4j/migrate`
- `/api/admin/import/*` (all import endpoints)

### API route auth patterns

| Pattern | Role required | Used by |
|---------|--------------|---------|
| `session.user.role !== "superadmin"` | superadmin | Most admin API routes |
| `["admin", "superadmin"].includes(role)` | admin OR superadmin | Email queue, settings |
| `x-admin-secret` header vs `ADMIN_SECRET` env | None (service-to-service) | Neo4j seed/migrate, all import routes |
| Middleware-only (no in-handler check) | Session cookie | metrics, organizations list |

---

## Admin Pages (18 pages)

### 1. Overview (Dashboard Home)
- **Route:** `/admin`
- **File:** `src/app/(admin)/admin/page.tsx`
- **Purpose:** Platform health at a glance. Shows stat cards for orgs, users, expert profiles, clients, subscriptions, and MRR. Includes plan distribution chart and quick-link grid to other admin pages.
- **API:** `GET /api/admin/metrics`

### 2. Knowledge Graph
- **Route:** `/admin/knowledge-graph`
- **File:** `src/app/(admin)/admin/knowledge-graph/page.tsx`
- **Purpose:** Central hub for all knowledge graph entities. Six tabbed views: Service Providers, Solution Partners, Experts, Clients, Case Studies, Attributes. Each tab is a separate component from `src/components/admin/tabs/`.
- **API:** `GET /api/admin/knowledge-graph/stats`, plus tab-specific endpoints (attributes, case-studies, solution-partners)
- **URL params:** `?tab=service-providers|solution-partners|experts|clients|case-studies|attributes`

### 3. Organizations
- **Route:** `/admin/organizations`
- **File:** `src/app/(admin)/admin/organizations/page.tsx`
- **Purpose:** Lists all organizations with plan, status, member count. Expandable rows show members, linked firms, and enrichment stats. Supports search, source filtering (platform/graph/all), and plan editing. Also includes a unified firm directory view.
- **API:** `GET /api/admin/organizations`, `GET /api/admin/organizations/[orgId]/details`, `PATCH /api/admin/organizations/[orgId]/plan`, `GET /api/admin/organizations/[orgId]/members`, `GET /api/admin/firms`, `GET /api/admin/firms/[firmId]/related`

### 4. Users
- **Route:** `/admin/users`
- **File:** `src/app/(admin)/admin/users/page.tsx`
- **Purpose:** User management table. Search by name/email. Set role (user/admin/superadmin), ban/unban users, impersonate users. Expandable rows show linked expert profiles.
- **API:** Better Auth client `authClient.admin.listUsers()`, `authClient.admin.banUser()`, `authClient.admin.unbanUser()`, `authClient.admin.setRole()`, `authClient.admin.impersonateUser()`, `GET /api/admin/users/[userId]/expert-profile`

### 5. Subscriptions
- **Route:** `/admin/subscriptions`
- **File:** `src/app/(admin)/admin/subscriptions/page.tsx`
- **Purpose:** Subscription and revenue overview. Shows MRR, active subscriptions, total orgs, and plan distribution breakdown.
- **API:** `GET /api/admin/metrics`

### 6. AI Costs (Finance)
- **Route:** `/admin/finance`
- **File:** `src/app/(admin)/admin/finance/page.tsx`
- **Purpose:** AI model spend tracking. Shows total cost, total calls, avg cost/call, avg duration, token counts. Breakdown by feature/model/org/user with bar charts. Daily trend visualization. Filterable by period (7d/30d/90d/all).
- **API:** `GET /api/admin/finance?period=30d&breakdown=feature`

### 7. API Health
- **Route:** `/admin/api-health`
- **File:** `src/app/(admin)/admin/api-health/page.tsx`
- **Purpose:** External service status and quota monitoring. Shows health cards for: OpenRouter, People Data Labs, Jina Reader, Deepgram, ElevenLabs, Resend, Recall.ai, Stripe, Neo4j, Neon Postgres. Each card shows status (healthy/warning/error), latency, and quota usage bars. Refresh button triggers live checks.
- **API:** `GET /api/admin/api-health`

### 8. Partnerships
- **Route:** `/admin/partnerships`
- **File:** `src/app/(admin)/admin/partnerships/page.tsx`
- **Purpose:** Platform-wide partnership and referral tracking. Shows stats (total, accepted, referrals, opportunities), pipeline flow visualization (suggested -> requested -> accepted), email settings panel with two auto-send toggles, and partnership table with status filter. Admins can trigger intro emails for requested/accepted partnerships.
- **API:** `GET /api/admin/partnerships`, `GET /api/admin/partnerships/stats`, `POST /api/admin/partnerships/intro`, `GET /api/admin/settings?key=partnership_intro_auto_send`, `GET /api/admin/settings?key=partnership_followup_auto_send`, `POST /api/admin/settings`
- **Email Settings Panel:** Two toggle switches:
  - **Auto-send intro emails** (`partnership_intro_auto_send`) — ON: sends immediately to `masa+{firmslug}@joincollectiveos.com`; OFF: queues for review
  - **Auto-send follow-up emails** (`partnership_followup_auto_send`) — ON: follow-ups send automatically after transcript analysis; OFF: queues for review
  - Button label changes dynamically: "Send Now" (⚡) when auto-send ON, "Queue Intro" (✉️) when OFF
  - Feedback shows "Sent!" (green) vs "Queued!" (blue) based on actual outcome

### 9. Neo4j Administration
- **Route:** `/admin/neo4j`
- **File:** `src/app/(admin)/admin/neo4j/page.tsx`
- **Purpose:** Neo4j graph database management. Three sections: (1) **Graph Health Dashboard** — live node/edge counts by type, client stub stats (stubs vs enriched, coverage %), stale data detection (30d+), ServiceFirm total. (2) **Seed Taxonomy** — creates schema constraints/indexes and seeds categories, skills L1-L3, firm relationships, markets, languages, firm types, industries (requires admin secret). (3) **Re-sync All Firms** — triggers full enrichment pipeline for all firms via Inngest backfill job.
- **API:** `GET /api/admin/neo4j/health`, `POST /api/admin/neo4j/seed` (via `x-admin-secret` header)

### 10. External APIs
- **Route:** `/admin/apis`
- **File:** `src/app/(admin)/admin/apis/page.tsx`
- **Purpose:** Public API endpoint documentation and health monitoring. Shows cards for Taxonomy, Experts, Case Studies, and Firms Directory APIs with status, latency, record counts, query params, and examples. Includes integration guide (CORS, caching, rate limits, pagination).
- **API:** `GET /api/public/health`

### 11. Enrichment (Full System Enrichment + Audit)
- **Route:** `/admin/enrichment`
- **File:** `src/app/(admin)/admin/enrichment/page.tsx`
- **Purpose:** Two sections: (1) **Full System Enrichment** — unified enrichment control panel with mode selector (Incremental vs Full System/Pro), provider health status inline (EnrichLayer, PDL, Jina, OpenRouter), preview with per-firm step breakdown and cost estimates, firm selection checkboxes with select-all, expandable step details per firm, real-time progress bar with phase indicators. Full System mode: Pro treatment (enrich ALL experts, force re-abstraction, run skill strength recomputation). (2) **Enrichment Audit Trail** — firm ID search, firm header with stats/phase badges, expandable audit entries with raw I/O, extracted data, provider info, errors, confidence.
- **API:** `GET /api/admin/enrichment/[firmId]`, `POST /api/admin/enrich/backfill-all` (supports `mode: "full-system" | "incremental"`), `GET /api/admin/enrich/backfill-all?jobId=X`, `GET /api/admin/api-health` (for provider status)

### 12. Onboarding Funnel
- **Route:** `/admin/onboarding`
- **File:** `src/app/(admin)/admin/onboarding/page.tsx`
- **Purpose:** Tracks firm onboarding from domain entry to profile completion. Shows conversion funnel (domain submitted -> enrichment complete -> interview started -> interview complete), enrichment breakdown (cache distribution, stage success rates for PDL/scrape/classify), interview question completion heatmap with drop-off analysis, daily trend chart, and recent sessions table (last 50). Each session row has a "View" link to the session detail page. Filterable by period.
- **API:** `GET /api/admin/onboarding?period=30d`

### 17. Onboarding Session Detail
- **Route:** `/admin/onboarding/sessions/[domain]`
- **File:** `src/app/(admin)/admin/onboarding/sessions/[domain]/page.tsx`
- **Purpose:** Per-domain onboarding drill-down. Shows: (1) header with firm name, overall status badge, local timestamps, and a cache status banner (full hit / partial hit / miss, source = enrichment_cache / postgres / neo4j, gaps list for partial); (2) event timeline from `onboarding_events` with stage badges and expandable metadata JSON; (3) enrichment pipeline audit tabbed by phase (PDL/jina/classifier/etc) with cost, duration, confidence, extracted data; (4) interview answers from `partnerPreferences`; (5) full enrichment JSON from `serviceFirms.enrichmentData`.
- **API:** `GET /api/admin/onboarding/sessions/[domain]`
- **Note:** `[domain]` is URL-encoded domain string (e.g. `acme.com`). All timestamps display in the browser's local timezone via `toLocaleString()`.

### 18. Search Test Tool (Matching)
- **Route:** `/admin/search`
- **File:** `src/app/(admin)/admin/search/page.tsx`
- **Purpose:** Two sections. (1) **Search Test Tool**: natural language query input, optional searcher firm ID, skip-LLM toggle, Run Search button. Results show 3 expandable layers — Layer 1 (Neo4j structured filter candidates with structuredScore), Layer 2 (vector re-ranked with vectorScore), Layer 3 (LLM-ranked with llmScore and matchExplanation) — plus parsed filters, duration, and estimated cost. (2) **Abstraction Profile Status**: stat cards (total firms, profiles generated, missing, avg confidence) and a table of firms with confidence, top services, last generated, and per-row Regenerate button.
- **API:** `POST /api/admin/search/test`, `GET /api/admin/abstractions?missing=true`, `GET /api/admin/abstractions/[firmId]`, `POST /api/admin/abstractions/[firmId]`

### 28. Call Transcripts
- **Route:** `/admin/calls`
- **File:** `src/app/(admin)/admin/calls/page.tsx`
- **Purpose:** View and manage all call transcripts platform-wide. Shows 4 stat cards (total, processed, opps extracted, avg coaching score). Filter tabs: All / Manual / Recall.ai. Expandable transcript rows with preview. "Upload Transcript" button opens a modal for manual upload.
- **Upload Modal:**
  - Firm picker (search from `GET /api/admin/calls/firms`)
  - Client domain field (optional, stored on opportunities)
  - Two tabs: Paste text (textarea) | Upload file (.txt)
  - On submit: POST to `/api/admin/calls/upload` → AI analysis → opportunities stored → optional follow-up email
  - Results shown inline with opportunity cards
- **API:**
  - `GET /api/admin/calls` — list all transcripts with stats
  - `GET /api/admin/calls/firms` — lightweight firm search for modal (`[{id, name}]`)
  - `POST /api/admin/calls/upload` — upload + analyze transcript (see below)

### /api/admin/calls/upload
- Creates a `callRecording` (type: partnership) and `callTranscript` record
- Runs AI analysis via Gemini Flash (OpenRouter) to extract partnership opportunities
- Stores each opportunity in the `opportunities` table with `source = "call"`, `sourceId = transcriptId`
- Marks transcript `processingStatus = "done"` on success
- If `partnership_followup_auto_send = "true"` AND opportunities were found: sends follow-up email to `masa+{firmslug}@joincollectiveos.com` via Resend
- Returns: `{ transcriptId, recordingId, opportunityCount, opportunities, summary }`

### 13. Email Queue
- **Route:** `/admin/email`
- **File:** `src/app/(admin)/admin/email/page.tsx`
- **Purpose:** Review, approve, or reject Ossy's outgoing emails. Three tabs: Pending (with approve/reject actions), Sent, Received. Side drawer for editing email body before approval. Shows intent classification badges and confidence scores.
- **API:** `GET /api/admin/email/queue?tab=pending|sent|received`, `POST /api/admin/email/queue/[id]/approve`, `POST /api/admin/email/queue/[id]/reject`, `PATCH /api/admin/email/queue/[id]`

### 14. Email Settings
- **Route:** `/admin/email-settings`
- **File:** `src/app/(admin)/admin/email-settings/page.tsx`
- **Purpose:** Control how Ossy sends emails. Test mode toggle redirects all outgoing mail to a safe whitelist. When test mode is on, recipients are replaced with whitelist addresses, subjects are prefixed, a warning banner is added, and auto-approved emails are downgraded to pending.
- **API:** `GET /api/admin/settings?key=email_test_mode`, `GET /api/admin/settings?key=email_test_whitelist`, `POST /api/admin/settings`

### 15. Experts & Contacts
- **Route:** `/admin/experts`
- **File:** `src/app/(admin)/admin/experts/page.tsx`
- **Purpose:** Imported contacts browser with classification filters (all/expert/internal/ambiguous). Search, pagination, expandable detail cards. Includes banner redirecting to Knowledge Graph. Being consolidated into the Knowledge Graph page.
- **API:** `GET /api/admin/experts?q=&classification=&page=&limit=`

### 16. Client Companies
- **Route:** `/admin/clients`
- **File:** `src/app/(admin)/admin/clients/page.tsx`
- **Purpose:** Client companies sourced from the knowledge graph. Search, pagination, expandable rows showing associated service firms and case studies. Includes banner redirecting to Knowledge Graph. Being consolidated into the Knowledge Graph page.
- **API:** `GET /api/admin/clients?q=&page=&limit=`

### 19. Opportunities & Leads
- **Route:** `/admin/opportunities`
- **File:** `src/app/(admin)/admin/opportunities/page.tsx`
- **Purpose:** Platform-wide visibility into the opportunity-to-lead funnel. Period filter (7d/30d/90d/all). Four stat cards (Total Opportunities, Action Rate, Leads Posted, Network Claim Rate). Two breakdown panels: opportunity breakdown by signal type/priority/source, and lead quality distribution (tier bar chart + status pills). Recent Opportunities table (title, firm, signal/priority/resolution badges, status, date). Recent Leads table (title, firm, quality score+tier, status, value, timeline, date).
- **API:** `GET /api/admin/opportunities?period=30d`

### 20. Growth Ops — Overview
- **Route:** `/admin/growth-ops`
- **File:** `src/app/(admin)/admin/growth-ops/page.tsx`
- **Purpose:** Landing page for the Growth Ops section. Shows a 2-column grid of cards linking to LinkedIn, Instantly, HubSpot, and Attribution sub-sections.

### 21. Growth Ops — LinkedIn Inbox (Unibox)
- **Route:** `/admin/growth-ops/linkedin`
- **File:** `src/app/(admin)/admin/growth-ops/linkedin/page.tsx`
- **Purpose:** Unified LinkedIn inbox. Account selector (if multiple accounts), chat list from Unipile, message thread viewer, and reply composer. Real-time send via Unipile API.
- **API:** `GET /api/admin/growth-ops/linkedin-accounts`, `GET /api/admin/growth-ops/unipile?action=listChats&accountId=`, `GET /api/admin/growth-ops/unipile?action=getChatMessages&chatId=`, `POST /api/admin/growth-ops/unipile` (action: sendMessage)

### 22. Growth Ops — LinkedIn Accounts
- **Route:** `/admin/growth-ops/linkedin/accounts`
- **File:** `src/app/(admin)/admin/growth-ops/linkedin/accounts/page.tsx`
- **Purpose:** Manage connected LinkedIn accounts. Shows account table with status badges (OK/CONNECTING/CREDENTIALS/ERROR). "Connect Account" button generates a Unipile hosted auth link. "Reconnect" button for errored accounts.
- **API:** `GET /api/admin/growth-ops/linkedin-accounts`, `POST /api/admin/growth-ops/unipile` (action: generateAuthLink, generateReconnectLink)

### 23. Growth Ops — LinkedIn Invite Campaigns
- **Route:** `/admin/growth-ops/linkedin/campaigns`
- **File:** `src/app/(admin)/admin/growth-ops/linkedin/campaigns/page.tsx`
- **Purpose:** LinkedIn connection invite campaigns. Create campaigns (name, target list, account, daily min/max 15–19, invite message). Status management (draft → active → paused → active). Campaign table with status badges.
- **API:** `GET /api/admin/growth-ops/invite-campaigns`, `POST /api/admin/growth-ops/invite-campaigns`, `PATCH /api/admin/growth-ops/invite-campaigns/[id]`, `GET /api/admin/growth-ops/linkedin-accounts`, `GET /api/admin/growth-ops/target-lists`

### 24. Growth Ops — Target Lists
- **Route:** `/admin/growth-ops/linkedin/targets`
- **File:** `src/app/(admin)/admin/growth-ops/linkedin/targets/page.tsx`
- **Purpose:** LinkedIn invite target lists. Create lists, import targets via CSV (firstName, linkedinUrl). Expandable accordion rows showing target table per list with status badges (pending/invited/failed/skipped).
- **API:** `GET /api/admin/growth-ops/target-lists`, `POST /api/admin/growth-ops/target-lists`, `GET /api/admin/growth-ops/target-lists/[id]/targets`, `POST /api/admin/growth-ops/target-lists/[id]/targets`

### 25. Growth Ops — Instantly Email Campaigns
- **Route:** `/admin/growth-ops/instantly`
- **File:** `src/app/(admin)/admin/growth-ops/instantly/page.tsx`
- **Purpose:** Email outreach campaign performance dashboard. Summary stat cards (sent, opened, clicked, replied totals). Campaign table with open/click/reply rate columns. Analytics loaded for up to 20 campaigns.
- **API:** `GET /api/admin/growth-ops/instantly?action=listCampaigns`, `POST /api/admin/growth-ops/instantly` (action: getAnalytics)

### 26. Growth Ops — HubSpot Kanban
- **Route:** `/admin/growth-ops/hubspot`
- **File:** `src/app/(admin)/admin/growth-ops/hubspot/page.tsx`
- **Purpose:** HubSpot pipeline Kanban board. Drag-and-drop deal cards between stage columns. Pipeline selector if multiple pipelines. Optimistic UI updates on drag-drop, then persists via API.
- **API:** `GET /api/admin/growth-ops/hubspot?action=listPipelines`, `GET /api/admin/growth-ops/hubspot?action=getAllDeals&pipelineId=`, `POST /api/admin/growth-ops/hubspot` (action: updateDealStage)

### 27. Growth Ops — Attribution Report
- **Route:** `/admin/growth-ops/attribution`
- **File:** `src/app/(admin)/admin/growth-ops/attribution/page.tsx`
- **Purpose:** Cross-channel attribution. On-demand "Run Report" cross-references COS platform users against Instantly email leads (by email) and LinkedIn invited targets (by first name). Shows matched users with which campaign attributed them.
- **API:** `GET /api/admin/users?limit=500`, `GET /api/admin/growth-ops/instantly?action=listCampaigns`, `POST /api/admin/growth-ops/instantly` (action: listLeads), `GET /api/admin/growth-ops/target-lists`, `GET /api/admin/growth-ops/target-lists/[id]/targets`

---

## Admin API Endpoints

### Platform Metrics
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/metrics` | Platform-wide stats (orgs, users, subscriptions, MRR, plan distribution, experts, clients) |

### Organizations
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/organizations` | List all orgs with plan/status/members |
| GET | `/api/admin/organizations/[orgId]/details` | Org members, firms, enrichment stats |
| GET | `/api/admin/organizations/[orgId]/members` | Org member list |
| PATCH | `/api/admin/organizations/[orgId]/plan` | Update org plan |

### Users
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/users/[userId]/expert-profile` | Linked expert profile for a user |

### Firms
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/firms` | Unified firm directory (platform + imported + neo4j) |
| GET | `/api/admin/firms/[firmId]/related` | Related entities for a firm |

### Knowledge Graph
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/knowledge-graph/stats` | Counts for all 6 KG tabs |
| GET | `/api/admin/knowledge-graph/attributes` | Skills, industries, markets, languages |
| GET | `/api/admin/knowledge-graph/case-studies` | Case study records |
| GET | `/api/admin/knowledge-graph/solution-partners` | Solution partner records |
| GET | `/api/admin/graph/associations` | Associations for a node (firms, case studies) |

### Experts & Clients
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/experts` | Expert contacts with classification filter |
| GET | `/api/admin/clients` | Client companies with search/pagination |

### Email System
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/email/queue?tab=` | Email queue (pending/sent/received) |
| POST | `/api/admin/email/queue/[id]/approve` | Approve and send a pending email |
| POST | `/api/admin/email/queue/[id]/reject` | Reject a pending email |
| PATCH | `/api/admin/email/queue/[id]` | Edit email body before approval |

### Settings
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/settings?key=` | Read a platform setting |
| POST | `/api/admin/settings` | Write platform settings (batch) |

### Finance
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/finance?period=&breakdown=` | AI cost/usage data with breakdowns |

### API Health
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/api-health` | Health checks for all external services |

### Partnerships
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/partnerships` | List all partnerships |
| GET | `/api/admin/partnerships/stats` | Partnership pipeline stats |
| POST | `/api/admin/partnerships/intro` | Queue or auto-send intro email (respects `partnership_intro_auto_send` toggle) |

### Call Transcripts
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/calls` | List all transcripts with stats (filter: `?source=manual\|recall`) |
| GET | `/api/admin/calls/firms` | Lightweight firm search for upload modal (`?q=`) |
| POST | `/api/admin/calls/upload` | Upload transcript, run AI analysis, store opportunities, optional follow-up email |

### Neo4j
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/admin/neo4j/seed` | Seed taxonomy schema + data (ADMIN_SECRET) |
| POST | `/api/admin/neo4j/migrate` | Run legacy data migration (ADMIN_SECRET) |

### Onboarding
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/onboarding?period=` | Onboarding funnel analytics |
| GET | `/api/admin/onboarding/sessions/[domain]` | Full session detail for a domain (events, enrichment audit, interview answers, firm profile) |

### Search & Matching
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/admin/search/test` | Run a debug search through the 3-layer cascade; returns intermediate per-layer candidates + stats |
| GET | `/api/admin/abstractions?missing=&limit=&offset=` | List abstraction profiles with stats; `?missing=true` shows firms without a profile |
| GET | `/api/admin/abstractions/[firmId]` | Full abstraction profile detail for one firm |
| POST | `/api/admin/abstractions/[firmId]` | Trigger `generateFirmAbstraction()` to regenerate profile |

### Enrichment
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/enrichment/[firmId]` | Full enrichment audit trail for a firm |

### Data Import (n8n workflow endpoints)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/admin/import/contacts` | Import contacts batch (ADMIN_SECRET) |
| POST | `/api/admin/import/companies` | Import companies batch (ADMIN_SECRET) |
| POST | `/api/admin/import/clients` | Import client companies (ADMIN_SECRET) |
| POST | `/api/admin/import/case-studies` | Import case studies (ADMIN_SECRET) |
| POST | `/api/admin/import/outreach` | Import outreach data (ADMIN_SECRET) |
| GET | `/api/admin/import/stats` | Import statistics (ADMIN_SECRET) |
| POST | `/api/admin/import/sync-graph` | Sync imported data to Neo4j graph (ADMIN_SECRET) |
| POST | `/api/admin/import/populate-graph` | Populate graph with 3 modes: `sync` (sync firms to Neo4j), `promote` (promote imported companies to ServiceFirm nodes), `classify` (AI-classify firms). Body: `{ mode }`. (ADMIN_SECRET) |

---

## Admin Layout & Navigation

**File:** `src/app/(admin)/layout.tsx`

The layout renders a fixed sidebar (240px) with a main content area (max-width 6xl). The sidebar has six nav sections:

1. **Knowledge Graph** -- Knowledge Graph (accent link)
2. **Platform** -- Organizations, Users
3. **Operations** -- Subscriptions, AI Costs, API Health, Partnerships
4. **Matching** -- Search Test, Onboarding
5. **Growth Ops** -- Overview, LinkedIn, Instantly, HubSpot, Attribution
6. **Tools** -- Neo4j, APIs, Data Import, Enrichment

Footer: "Back to App" link to `/dashboard`.

Note: The sidebar links to `/admin/migration` for Data Import but no corresponding page directory exists at that path -- the import functionality is API-only (called from n8n workflows).

---

## Admin Components

### `src/components/admin/constants.ts`
Shared constants: `CLASSIFICATION_COLORS` (expert/internal/ambiguous badge styles), `SOLUTION_PARTNER_CATEGORIES` (13 categories).

### `src/components/admin/types.ts`
Shared TypeScript interfaces: `DirectoryFirm`, `ExpertContact`, `ImportedClient`, `CaseStudyRecord`, `SolutionPartner`, `AttributeItem`.

### `src/components/admin/tabs/`
Knowledge Graph tab components:
- `service-providers-tab.tsx` -- Service provider firms with search, expand, details
- `solution-partners-tab.tsx` -- Solution partners (SaaS/tech vendors)
- `experts-tab.tsx` -- Expert contacts with classification filters
- `clients-tab.tsx` -- Client companies with associations
- `case-studies-tab.tsx` -- Case study records with linked entities
- `attributes-tab.tsx` -- Skills, industries, markets, languages counts

---

## Feature Summary

| Feature | Admin Page | Key Capabilities |
|---------|-----------|-----------------|
| **Dashboard Overview** | `/admin` | KPIs, plan distribution, quick links |
| **Knowledge Graph** | `/admin/knowledge-graph` | 6-tab entity browser (providers, partners, experts, clients, case studies, attributes) |
| **Organizations** | `/admin/organizations` | List, search, plan management, member/firm drill-down |
| **Users** | `/admin/users` | Role management, ban/unban, impersonation, expert profile linking |
| **Subscriptions** | `/admin/subscriptions` | MRR, plan distribution, revenue metrics |
| **AI Costs** | `/admin/finance` | Spend tracking by feature/model/org/user, daily trends, token counts |
| **API Health** | `/admin/api-health` | 10 external services monitored, quota bars, latency |
| **Partnerships** | `/admin/partnerships` | Pipeline flow, status filters, intro email triggers |
| **Neo4j Admin** | `/admin/neo4j` | Taxonomy seeding, legacy migration |
| **External APIs** | `/admin/apis` | Public API docs, health, integration guide |
| **Enrichment** | `/admin/enrichment` | Full System Enrichment (incremental/full-system modes), provider health, per-firm audit trail |
| **Onboarding Funnel** | `/admin/onboarding` | Conversion funnel, cache/enrichment metrics, question completion, session table with "View" links |
| **Onboarding Session** | `/admin/onboarding/sessions/[domain]` | Per-domain event timeline, cache banner, enrichment audit, interview answers, firm profile JSON |
| **Search Test Tool** | `/admin/search` | 3-layer cascade debug, per-layer candidates, abstraction profile management |
| **Email Queue** | `/admin/email` | Approve/reject/edit Ossy emails, sent/received history |
| **Email Settings** | `/admin/email-settings` | Test mode toggle, whitelist management |
| **Experts** | `/admin/experts` | Legacy view (redirects to KG) |
| **Clients** | `/admin/clients` | Legacy view (redirects to KG) |
| **Growth Ops Overview** | `/admin/growth-ops` | Landing page with links to all Growth Ops sub-sections |
| **LinkedIn Inbox** | `/admin/growth-ops/linkedin` | Unified inbox, chat list, message thread, reply composer |
| **LinkedIn Accounts** | `/admin/growth-ops/linkedin/accounts` | Connect/reconnect LinkedIn accounts via Unipile |
| **LinkedIn Campaigns** | `/admin/growth-ops/linkedin/campaigns` | Invite campaigns with daily limits, status management |
| **Target Lists** | `/admin/growth-ops/linkedin/targets` | Target lists with CSV import and status tracking |
| **Instantly** | `/admin/growth-ops/instantly` | Email campaign analytics (sent/open/click/reply rates) |
| **HubSpot Kanban** | `/admin/growth-ops/hubspot` | Drag-and-drop deal pipeline board |
| **Attribution** | `/admin/growth-ops/attribution` | Cross-channel user attribution against outbound campaigns |
