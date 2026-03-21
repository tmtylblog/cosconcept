# COS CONCEPT — Collective OS

## Project Overview
COS CONCEPT (Collective OS) is a growth platform for professional services firms (agencies, consultancies, fractional leaders) that replaces broken business development with partnership-driven growth. The platform combines a massive knowledge graph, AI-powered matching, conversational UX, voice agents, call intelligence, and an email agent into a single operating system for partnership-led growth.

**Brand:** Collective OS — "Grow Faster Together"
**AI Consultant:** Ossy (the platform's AI personality)
**Builder:** Solo developer + Claude AI
**Hosting:** Vercel
**Domain:** joincollectiveos.com

## Standard Nomenclature
- **Customer service providers** — the unified term for ALL firms on the platform (legacy imports + app-registered). Do NOT split into "legacy firms" vs "real customers" — they are all real customers. The distinction is only technical (ID prefix `firm_leg_*` vs `firm_*`) and irrelevant to product/business discussions.
- **Customers** or **customer firms** are acceptable shorthand.

## Critical Context
- This is a SEPARATE project from Sanctum SOS. They are completely unrelated.
- All project documentation is in the `docs/` folder
- **Neo4j node model:** `Company` is the canonical base node for ALL organizations. COS platform member firms are `[:Company:ServiceFirm]` multi-label nodes — never use `MATCH (f:ServiceFirm)` alone. Always `MATCH (f:Company:ServiceFirm)`. There is no standalone `ServiceFirm` node type.
- All reference data is in the `data/` folder
- Read `docs/ARCHITECTURE.md` for the full technical architecture plan
- Read `docs/PRODUCT-VISION.md` for detailed feature descriptions
- Read `docs/KNOWLEDGE-GRAPH.md` for the graph database design
- Read `docs/BRAND.md` for brand voice, colors, and messaging
- Read `docs/ONBOARDING-PROMPT.md` for the conversational onboarding flow

## MANDATORY: Context Knowledge System

**All Claude agents MUST follow these rules when working on this project:**

1. **Before starting any task:** Read `docs/context/CONTEXT.md` (master index) and the relevant area file(s) for your task.
2. **After completing work:** Update the affected context file(s) with any changes you made (new files, routes, tables, components, etc.).
3. **Schema changes:** Update `docs/context/database.md`
4. **New API endpoints:** Update `docs/context/api-reference.md`
5. **New Inngest functions:** Update `docs/context/inngest-jobs.md`
6. **Design token changes:** Update `docs/context/design-system.md`
7. **Feature status changes:** Update `docs/context/roadmap.md`
8. **New admin pages/APIs:** Update `docs/context/admin.md`

### Context Files (docs/context/)
| File | Covers |
|------|--------|
| `CONTEXT.md` | Master index + rules |
| `architecture.md` | Tech stack, infrastructure, deployment, env vars |
| `database.md` | All Drizzle tables, relationships, migrations |
| `knowledge-graph.md` | Neo4j nodes, edges, super-edges, seeding |
| `auth.md` | Better Auth, roles, permissions, org management |
| `ai-ossy.md` | Chat system, prompts, tools, memory, multi-model |
| `enrichment.md` | Website scraping, PDL, classification, case studies |
| `search-matching.md` | Three-layer cascade, vector search, deep ranker |
| `voice.md` | Deepgram STT, ElevenLabs TTS, voice manager |
| `email.md` | Resend, approval queue, inbound/outbound |
| `billing.md` | Stripe, plans, feature gates, webhooks |
| `partnerships.md` | Partnership lifecycle, intros, referrals |
| `admin.md` | All admin pages, APIs, features |
| `design-system.md` | Tokens, colors, typography, components |
| `api-reference.md` | All 90+ endpoints by domain |
| `inngest-jobs.md` | All background jobs, triggers, cron |
| `data-taxonomy.md` | CSV files, skill hierarchy, firm relationships |
| `multi-dev.md` | Git workflow, branch naming, conflicts |
| `roadmap.md` | Build phases, status, gaps, TODOs |

## MANDATORY: Frontend Design Skill

**All Claude agents MUST use the frontend design skill** (`.claude/skills/frontend-design.md`) when building or modifying any UI component, page, or visual element. This skill ensures:
- Distinctive, production-grade design that avoids generic "AI slop" aesthetics
- Bold aesthetic direction with intentional typography, color, and spatial composition
- Use of the COS design system tokens (`cos-` prefix) while still making creative, polished choices
- Every agent should install this skill in their worktree if not present

The skill is at `.claude/skills/frontend-design.md`. Read it before any frontend work.

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

## Development Automation

The project has automated guardrails to prevent broken deploys and enforce quality:

| Tool | What it does | Runs when |
|------|-------------|-----------|
| **Husky + lint-staged** | ESLint on staged `.ts`/`.tsx` files | Every `git commit` |
| **GitHub Actions CI** | `npm run lint` + `npm run build` | Every push/PR to main |
| **PR template** | Checklist for lint, build, context files, schema | Every PR opened |
| **`npm run verify`** | Lint + build in sequence | Run manually before pushing |
| **Ownership hook** | Warns on cross-area file edits | Every Edit/Write in Claude Code |
| **Pre-push hook** | Blocks force push, warns if behind, checks package-lock | Every `git push` in Claude Code |

**ESLint now matches Vercel strictness.** `react/no-unescaped-entities` is set to `error` locally, so `npm run lint` catches the exact same issues that caused 3 broken deploys on 2026-03-12.

## ⚠️ VERCEL BUILD IS STRICTER THAN LOCAL BUILD

**Vercel's production ESLint catches things that `next build` locally does NOT.** This means your code can compile locally but FAIL on Vercel. Common failures:

1. **Unescaped entities in JSX text** — `react/no-unescaped-entities`:
   - ❌ `you've` → use `you&apos;ve`
   - ❌ `"quoted"` → use `&quot;quoted&quot;`
   - ❌ `it's`, `don't`, `won't` → use `it&apos;s`, `don&apos;t`, `won&apos;t`

2. **After pushing, ALWAYS deploy and verify:**
   ```bash
   vercel --yes --prod
   vercel ls --prod 2>&1 | head -3   # Must show "● Ready", NOT "● Error"
   ```

3. **If your deploy shows `● Error`**, check logs with `vercel inspect <url> --logs` and fix immediately. A failed deploy means production is stuck on the PREVIOUS version and none of your changes are live.

4. **Check `STATUS.md`** at project root before starting work — it tracks which agent owns which files and recent incidents.

## STRICT: Pre-Push Sync Rule (MANDATORY)

**Before EVERY commit or push to remote, you MUST:**

1. `git fetch origin && git pull --rebase origin main` — pull the latest changes first.
2. Read any files that were changed by other devs (`git log --oneline HEAD..origin/main` to see incoming commits).
3. Review the diff for conflicts with your work — especially shared files like API routes, schema, and layout. Never blindly accept "ours" or "theirs".
4. If other devs have modified files you also changed, review their changes before overwriting.
5. Run `next build` after resolving any conflicts to ensure nothing is broken.
6. Only then `git push origin main`.

**This is non-negotiable.** Other developers are actively pushing to main. Skipping this step causes merge conflicts, broken deploys, and lost work.

## Worktree Workflow (DEFAULT for all agents)

Every Claude Code agent MUST run in its own worktree. This gives each agent an isolated copy of the repo — no file conflicts, no stepping on each other.

### Starting a new agent

```bash
# Set your agent area for ownership hooks, then start in a worktree
AGENT_AREA=agent-a claude --worktree agent-a/feat/expert-enrichment
AGENT_AREA=agent-b claude --worktree agent-b/feat/discover-search
AGENT_AREA=agent-c claude --worktree agent-c/fix/case-study-seed
AGENT_AREA=agent-d claude --worktree agent-d/feat/billing-portal
AGENT_AREA=agent-e claude --worktree agent-e/chore/data-scripts
```

### Agent area assignments

| AGENT_AREA | Owns | Key Paths |
|------------|------|-----------|
| `agent-a` | Expert enrichment, PDL, team discovery | `src/app/api/team-import/`, `src/app/api/experts/`, `src/components/experts/` |
| `agent-b` | Discover, search/matching, Ossy chat tools | `src/app/(app)/discover/`, `src/lib/matching/`, `src/lib/ai/ossy-tools.ts`, `src/components/chat/` |
| `agent-c` | Firm pages, services, case studies | `src/app/(app)/firm/`, `src/app/api/firm/` |
| `agent-d` | Billing, settings, partnerships, network | `src/app/(app)/settings/`, `src/app/(app)/partnerships/`, `src/lib/billing/` |
| `agent-e` | Scripts, data, bulk operations | `scripts/`, `data/` |

The ownership hook (`.claude/hooks/check-ownership.sh`) will **warn** if you edit files outside your area. Update the hook when assignments change.

### Worktree lifecycle

1. Agent starts in worktree (isolated branch + directory)
2. Agent works, commits to its own branch
3. Agent opens PR against `main` when ready
4. Build must pass before merge
5. Worktree is cleaned up after merge

### Hooks (automatic)

These run automatically via `.claude/settings.json`:
- **check-ownership.sh** — Warns on Edit/Write if you touch another agent's files
- **pre-push-check.sh** — Warns on `git push` if you haven't pulled latest, blocks `--force`

## Multi-Dev Coordination Rules

These rules apply to **all Claude Code instances** working on this repo:

1. **Use worktrees.** Every agent runs in `claude --worktree`. Never work directly on main in the shared directory.
2. **Pull before every push.** Always `git pull --rebase origin main` before pushing. Read changed files from other devs to avoid conflicts.
3. **One branch per task, one dev per branch.** Never have two devs on the same branch.
4. **Branch naming:** `<agent-id>/<type>/<short-description>` (e.g., `agent-a/feat/ossy-chat`). Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`.
5. **Always branch from latest main.** Pull before you branch.
6. **Respect area ownership.** Each agent owns specific directories/features. The ownership hook warns on cross-area edits. If you need to edit outside your area, update STATUS.md first.
7. **Schema changes are serialized.** Only one agent modifies database schema/migrations at a time. Commit schema changes separately from feature code. Push immediately.
8. **Never edit existing migrations.** Only add new ones.
9. **Coordinate new dependencies.** Don't `npm install` new packages without mentioning it. Always commit `package-lock.json` with `package.json`.
10. **Commit often, commit small.** One concern per commit. Clear messages: `<type>: <what changed>`.
11. **Build + lint must pass before every PR.** Never merge a broken build.
12. **Rebase on main before merging.** Resolve conflicts on your branch, not on main.
13. **Update CLAUDE.md when you establish new patterns.** This is how you communicate decisions to other agents.
14. **Keep STATUS.md current.** Update it before starting and after finishing each task.
15. **Don't make drive-by fixes.** If you spot something outside your task, make a separate branch/PR.
16. **Don't let branches live for days.** Merge early and often to avoid drift.
17. **Always pull before push.** See "Pre-Push Sync Rule" above — this is non-negotiable.
