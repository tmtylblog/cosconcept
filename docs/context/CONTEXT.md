# COS CONCEPT 2 — Context Knowledge System

> **IMPORTANT:** All Claude agents working on this project MUST read this index and the relevant context files before making changes. After completing work, update any context files affected by your changes.

## Master Index

| # | Area | File | Summary |
|---|------|------|---------|
| 1 | Architecture & Stack | [architecture.md](architecture.md) | Tech stack, infrastructure, deployment, env vars |
| 2 | Database Schema | [database.md](database.md) | All 43+ Drizzle tables, relationships, migrations |
| 3 | Knowledge Graph | [knowledge-graph.md](knowledge-graph.md) | Neo4j nodes, edges, computed super-edges, seeding |
| 4 | Auth & Organizations | [auth.md](auth.md) | Better Auth, roles, permissions, org management |
| 5 | AI & Ossy | [ai-ossy.md](ai-ossy.md) | Chat system, prompts, tools, memory, multi-model strategy |
| 6 | Enrichment Pipeline | [enrichment.md](enrichment.md) | Website scraping, PDL, classification, case study analysis |
| 7 | Search & Matching | [search-matching.md](search-matching.md) | Three-layer cascade, vector search, deep ranker |
| 8 | Voice System | [voice.md](voice.md) | Deepgram STT, ElevenLabs TTS, voice manager |
| 9 | Email System | [email.md](email.md) | Resend, approval queue, inbound/outbound, Inngest jobs |
| 10 | Billing & Subscriptions | [billing.md](billing.md) | Stripe, plans, feature gates, webhooks |
| 11 | Partnerships & Opportunities | [partnerships.md](partnerships.md) | Partnership lifecycle, intros, referrals, opportunities |
| 12 | Admin Dashboard | [admin.md](admin.md) | All 27+ admin pages, APIs, features |
| 13 | Design System & Brand | [design-system.md](design-system.md) | Tokens, colors, typography, component patterns |
| 14 | API Reference | [api-reference.md](api-reference.md) | All 70+ endpoints organized by domain |
| 15 | Background Jobs | [inngest-jobs.md](inngest-jobs.md) | All Inngest functions, triggers, cron schedules |
| 16 | Data & Taxonomy | [data-taxonomy.md](data-taxonomy.md) | CSV reference files, 3-level skill hierarchy, firm relationships |
| 17 | Multi-Dev Coordination | [multi-dev.md](multi-dev.md) | Git workflow, branch naming, conflict avoidance |
| 18 | Roadmap & Status | [roadmap.md](roadmap.md) | Build phases, what's done, gaps, TODOs |
| 19 | Growth Operations | [growth-ops.md](growth-ops.md) | Unipile/LinkedIn, Instantly, HubSpot, invite scheduler, attribution |
| 20 | CRM & Acquisition | [crm-acquisition.md](crm-acquisition.md) | HubSpot sync, acquisition pipeline vs marketplace pipeline, attribution |

## Rules for Claude Agents

1. **Before starting any task:** Read `CONTEXT.md` (this file) and the relevant area file(s)
2. **After completing work:** Update the affected context file(s) with any changes you made
3. **New files/routes/tables:** Add them to the appropriate context file immediately
4. **Status changes:** Update `roadmap.md` when features move between phases
5. **Schema changes:** Update `database.md` with new/modified tables
6. **New API endpoints:** Add to `api-reference.md`
7. **New Inngest functions:** Add to `inngest-jobs.md`
8. **Design token changes:** Update `design-system.md`

## Quick Reference — Key Directories

```
src/app/(app)/        → Authenticated app pages
src/app/(admin)/      → Admin dashboard
src/app/(auth)/       → Auth pages (login, org select)
src/app/api/          → All API routes
src/components/       → Shared UI components
src/lib/ai/           → AI/Ossy logic
src/lib/db/           → Drizzle schema & connection
src/lib/enrichment/   → Enrichment pipeline modules
src/lib/matching/     → Search & matching engine
src/lib/billing/      → Stripe & feature gates
src/lib/email/        → Email client
src/lib/voice/        → Voice I/O
src/lib/taxonomy-full.ts → Full taxonomy data (firm types, services, industries, markets, languages)
src/app/api/partner-sync/ → Partner sync API (taxonomy, schema, entities, user provisioning)
data/                 → Reference CSVs (taxonomy, relationships)
docs/                 → Architecture docs & specs
docs/context/         → THIS — living knowledge files
scripts/              → Migration & seeding utilities
drizzle/              → Generated DB migrations
```
