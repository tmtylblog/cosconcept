# COS CONCEPT — Collective OS

## Project Overview
COS CONCEPT (Collective OS) is a growth platform for professional services firms (agencies, consultancies, fractional leaders) that replaces broken business development with partnership-driven growth. The platform combines a massive knowledge graph, AI-powered matching, conversational UX, voice agents, call intelligence, and an email agent into a single operating system for partnership-led growth.

**Brand:** Collective OS — "Grow Faster Together"
**AI Consultant:** Ossy (the platform's AI personality)
**Builder:** Solo developer + Claude AI
**Hosting:** Vercel
**Domain:** joincollectiveos.com

## Critical Context
- This is a SEPARATE project from Sanctum SOS. They are completely unrelated.
- All project documentation is in the `docs/` folder
- All reference data is in the `data/` folder
- Read `docs/ARCHITECTURE.md` for the full technical architecture plan
- Read `docs/PRODUCT-VISION.md` for detailed feature descriptions
- Read `docs/KNOWLEDGE-GRAPH.md` for the graph database design
- Read `docs/BRAND.md` for brand voice, colors, and messaging
- Read `docs/ONBOARDING-PROMPT.md` for the conversational onboarding flow

## Tech Stack (Finalized)
- **Framework:** Next.js 15 (App Router) + TypeScript
- **Styling:** Tailwind CSS 4 with `cos-` design token prefix (via `@theme` in globals.css)
- **UI:** shadcn/ui + Radix primitives + Lucide icons
- **Validation:** Zod v4 (runtime validation for AI outputs, API requests, env vars)
- **Graph DB:** Neo4j Aura (knowledge graph — from Phase 0)
- **Relational DB:** Neon PostgreSQL + **Drizzle ORM** (replaced Prisma — smaller bundles, SQL-like API, edge-native)
- **Vector Store:** pgvector on Neon (Phase 3+)
- **Auth:** **Better Auth** (replaced NextAuth — database-first, org/role plugins, stores in Neon)
- **AI Models:** Multi-model via Vercel AI SDK (Claude Sonnet for chat, Gemini Flash for classification, Gemini Pro for matching, OpenAI for embeddings)
- **Voice:** Deepgram Nova-3 (STT) + Deepgram Aura (TTS, ElevenLabs fallback) — Phase 1+
- **Background Jobs:** Inngest — Phase 2+
- **Cache:** Upstash Redis — Phase 4+
- **Monitoring:** Sentry — Phase 0+
- **Deployment:** Vercel (git push auto-deploy)

## Reference Data Files
| File | Description | Rows |
|------|------------|------|
| `data/persona-positioning.csv` | How to pitch by role × firm size | ~190 |
| `data/firm-relationships.csv` | Symbiotic relationships between firm types | 346 |
| `data/categories.csv` | 30 firm categories with definitions | 31 |
| `data/skills-L1.csv` | L1→L2 skill mapping | 247 |
| `data/skills-L2-map.csv` | L2 skill categories | 247 |
| `data/skills-L3-map.csv` | L2→L3 granular skills | 18,421 |

## Project Structure
```
src/
├── app/
│   ├── layout.tsx                  # Root layout
│   ├── page.tsx                    # Landing page
│   ├── globals.css                 # Tailwind + cos- design tokens
│   ├── (auth)/login/page.tsx       # Login page
│   ├── (app)/
│   │   ├── layout.tsx              # Authenticated layout (sidebar + chat)
│   │   └── dashboard/page.tsx      # Main dashboard
│   └── api/auth/[...all]/route.ts  # Better Auth API handler
├── components/
│   ├── ui/button.tsx               # shadcn/ui button component
│   ├── sidebar.tsx                 # App sidebar navigation
│   └── chat-panel.tsx              # Ossy chat panel (right side)
├── lib/
│   ├── db/
│   │   ├── index.ts                # Drizzle + Neon connection (lazy-init)
│   │   └── schema.ts              # Drizzle schema (auth + domain tables)
│   ├── neo4j.ts                    # Neo4j driver singleton + helpers
│   ├── auth.ts                     # Better Auth server config
│   ├── auth-client.ts              # Better Auth client hooks
│   ├── env.ts                      # Zod env validation
│   ├── utils.ts                    # cn() utility for shadcn
│   └── ai/gateway.ts               # AI cost tracking gateway (stub)
drizzle.config.ts                   # Drizzle Kit config
.env.example                        # All required env vars
```

## Build Phases
- Phase 0: Project Scaffold
- Phase 1: Ossy Chat Core (text + voice)
- Phase 2: Organization & Expert Profiles
- Phase 3: Knowledge Graph Population
- Phase 4: Search & Matching Engine
- Phase 5: Partnerships & Opportunities
- Phase 6: Call Intelligence & Chrome Extension
- Phase 7: Ossy Email Agent
- Phase 8: Advanced Features

## API Keys Available
- Jina Reader API (web scraping)
- Proxycurl (LinkedIn enrichment)
- (Others to be configured during setup)

## Key Design Principles
1. **Ground Truth Principle:** What firms have actually done (projects, case studies, clients) matters more than what they say they can do
2. **Abstraction Layer:** Hidden normalized profiles derived from actual work, not self-description
3. **Cascading Search:** Structured filters → Vector similarity → LLM ranking (99% filtered before LLM)
4. **Cost Consciousness:** Cheapest model that can do the job; AI cost gateway tracks everything
5. **Bidirectional Matching:** Both parties must want what the other offers
6. **Progressive Disclosure:** Get basic info first, enrich over time

## Multi-Dev Coordination Rules

These rules apply to **all Claude Code instances** working on this repo:

1. **Never push directly to main.** All work happens on feature branches, merged via PR only.
2. **One branch per task, one dev per branch.** Never have two devs on the same branch.
3. **Branch naming:** `<dev-id>/<type>/<short-description>` (e.g., `dev-1/feat/ossy-chat`). Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`.
4. **Always branch from latest main.** Pull before you branch.
5. **Assign area ownership.** Each dev owns specific directories/features. Stay in your lane. If you need to edit outside your area, coordinate first.
6. **Schema changes are serialized.** Only one dev modifies database schema/migrations at a time. Commit schema changes separately from feature code. Push immediately.
7. **Never edit existing migrations.** Only add new ones.
8. **Coordinate new dependencies.** Don't `npm install` new packages without mentioning it. Always commit `package-lock.json` with `package.json`.
9. **Commit often, commit small.** One concern per commit. Clear messages: `<type>: <what changed>`.
10. **Build + lint must pass before every PR.** Never merge a broken build.
11. **Rebase on main before merging.** Resolve conflicts on your branch, not on main.
12. **Update CLAUDE.md when you establish new patterns.** This is how you communicate decisions to other devs.
13. **Keep a STATUS.md** at project root listing each dev's current branch, task, and files being modified. Update it before starting and after finishing each task.
14. **Don't make drive-by fixes.** If you spot something outside your task, make a separate branch/PR.
15. **Don't let branches live for days.** Merge early and often to avoid drift.
