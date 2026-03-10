# 12. Admin Dashboard

> Last updated: 2026-03-10

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
- **Purpose:** Platform-wide partnership and referral tracking. Shows stats (total, accepted, referrals, opportunities), pipeline flow visualization (suggested -> requested -> accepted), and partnership table with status filter. Admins can trigger intro emails for requested/accepted partnerships.
- **API:** `GET /api/admin/partnerships`, `GET /api/admin/partnerships/stats`, `POST /api/admin/partnerships/intro`

### 9. Neo4j Administration
- **Route:** `/admin/neo4j`
- **File:** `src/app/(admin)/admin/neo4j/page.tsx`
- **Purpose:** Neo4j graph database management. Two actions: Seed Taxonomy (creates schema constraints/indexes and seeds categories, skills L1-L3, firm relationships, markets, languages, firm types, industries) and Legacy Migration (migrates JSON data files into Neo4j). Both require an admin secret input.
- **API:** `POST /api/admin/neo4j/seed`, `POST /api/admin/neo4j/migrate` (both via `x-admin-secret` header)

### 10. External APIs
- **Route:** `/admin/apis`
- **File:** `src/app/(admin)/admin/apis/page.tsx`
- **Purpose:** Public API endpoint documentation and health monitoring. Shows cards for Taxonomy, Experts, Case Studies, and Firms Directory APIs with status, latency, record counts, query params, and examples. Includes integration guide (CORS, caching, rate limits, pagination).
- **API:** `GET /api/public/health`

### 11. Enrichment Audit
- **Route:** `/admin/enrichment`
- **File:** `src/app/(admin)/admin/enrichment/page.tsx`
- **Purpose:** Inspect enrichment pipeline results for any firm by ID. Shows firm header with stats (entries, cost, first/last enriched), phase badges (jina, classifier, pdl, linkedin, case_study, onboarding, memory, deep_crawl), and expandable audit trail entries with raw input/output, extracted data, errors, and confidence scores.
- **API:** `GET /api/admin/enrichment/[firmId]`

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
| POST | `/api/admin/partnerships/intro` | Queue an intro email for a partnership |

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

---

## Admin Layout & Navigation

**File:** `src/app/(admin)/layout.tsx`

The layout renders a fixed sidebar (240px) with a main content area (max-width 6xl). The sidebar has five nav sections:

1. **Knowledge Graph** -- Knowledge Graph (accent link)
2. **Platform** -- Organizations, Users
3. **Operations** -- Subscriptions, AI Costs, API Health, Partnerships
4. **Matching** -- Search Test, Onboarding
5. **Tools** -- Neo4j, APIs, Data Import, Enrichment

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
| **Enrichment Audit** | `/admin/enrichment` | Per-firm enrichment trail, raw I/O, costs |
| **Onboarding Funnel** | `/admin/onboarding` | Conversion funnel, cache/enrichment metrics, question completion, session table with "View" links |
| **Onboarding Session** | `/admin/onboarding/sessions/[domain]` | Per-domain event timeline, cache banner, enrichment audit, interview answers, firm profile JSON |
| **Search Test Tool** | `/admin/search` | 3-layer cascade debug, per-layer candidates, abstraction profile management |
| **Email Queue** | `/admin/email` | Approve/reject/edit Ossy emails, sent/received history |
| **Email Settings** | `/admin/email-settings` | Test mode toggle, whitelist management |
| **Experts** | `/admin/experts` | Legacy view (redirects to KG) |
| **Clients** | `/admin/clients` | Legacy view (redirects to KG) |
