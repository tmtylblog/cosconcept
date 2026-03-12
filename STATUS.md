# STATUS — Multi-Agent Coordination

> **Updated:** 2026-03-12 ~11:45pm ET
> **Production:** https://cos-concept.vercel.app — LIVE and HEALTHY ✅
> **Last successful deploy:** commit `f5cc17b` (fix: trim Stripe env vars)

## ⚠️ CRITICAL: READ BEFORE PUSHING

### Vercel Build is STRICTER than local `next build`

The production build on Vercel has **stricter ESLint** than your local build. Code that passes locally may FAIL on Vercel. The #1 cause of broken deploys:

**Unescaped characters in JSX text:**
- ❌ `you've` → fails `react/no-unescaped-entities`
- ✅ `you&apos;ve`
- ❌ `"quoted"` → fails
- ✅ `&quot;quoted&quot;`

### Push Protocol (MANDATORY)

```bash
# 1. Pull latest (someone else may have pushed)
git fetch origin && git pull --rebase origin main

# 2. Build MUST pass
npx next build
# Look for "✓ Compiled successfully" — if you see "Failed to compile" DO NOT PUSH

# 3. Only then push
git push origin main

# 4. If push is rejected (someone else pushed while you built), go back to step 1
```

### Deploy Protocol

After pushing, deploy with:
```bash
vercel --yes --prod
```

Then verify with:
```bash
vercel ls --prod 2>&1 | head -5
```
The top entry must show `● Ready`, NOT `● Error`.

---

## Active Agents & Area Ownership

| Agent | Area | Key Files | Status |
|-------|------|-----------|--------|
| **Agent A** | PDL team discovery, expert enrichment, admin expert roster | `team-import/`, `experts/enrich-all/`, admin `[orgId]/page.tsx`, `expert-card.tsx` | ✅ Done — deployed |
| **Agent B** | Discover feature, search/matching, chat tools | `discover/`, `matching/`, `ossy-tools.ts`, `chat-panel.tsx` | ✅ Done — deployed |
| **Agent C** | Services, case studies, offerings | `firm/services/`, `firm/case-studies/`, `firm/offering/`, `firm/experience/` | ✅ Done — deployed |
| **Agent D** | Billing, settings, network | `settings/`, `billing/`, `network/`, `partnerships/` | ✅ Done — deployed |
| **Data Agent** | Bulk enrichment, embeddings, firm connections | `scripts/_bulk_enrich_legacy.mjs`, `scripts/_backfill_all_embeddings.mjs`, `scripts/_populate_firm_services.mjs`, `scripts/_discover_case_studies.mjs` | ✅ Done — 1,152 firms enriched + embedded; discovery running in bg |

### Shared Files — COORDINATE BEFORE EDITING

These files are touched by multiple agents. If you need to edit one, check STATUS.md first:

- `src/lib/db/schema.ts` — ONE AGENT AT A TIME. Push immediately after schema changes.
- `src/app/(app)/layout.tsx` — shared layout, careful with nav changes
- `src/lib/ai/ossy-prompt.ts` — system prompt, coordinate with chat agent
- `src/lib/ai/ossy-tools.ts` — tool definitions, coordinate with chat agent
- `src/components/chat-panel.tsx` — shared chat UI
- `package.json` / `package-lock.json` — coordinate new deps

---

## Recent Incident Log

| Time | Issue | Cause | Fix |
|------|-------|-------|-----|
| 2026-03-12 ~10pm | 3 consecutive Vercel deploys failed (`● Error`) | `network/page.tsx` had unescaped `'` in `you've` — passes local build but fails Vercel ESLint | Changed to `you&apos;ve`, committed `62d0173` |

---

## What Each Agent Has Shipped Recently

### Agent A (PDL / Expert Enrichment)
- PDL team discovery across 1,045 firms — 3,460 people found, classified into expert/potential/not_expert
- Admin page: grouped expert roster by tier (Experts → Potential → Not Expert) with enrich buttons
- User-facing: tier badges on ExpertCard, sorted by tier, not_expert filtered out
- `team-import/status` API detects batch-discovered data, returns "discovered" phase
- `enrich-all` endpoint for batch enriching expert-tier people
- 6-month PDL skip logic to save credits

### Agent B (Discover / Search)
- Discover page: Ossy-driven, fit tiers (Strong/Good/Worth Exploring), no match %
- `/discover/[firmId]`: trust-first firm profile page with dynamic sections
- Fixed: `USE_PG_SEARCH = true` hardcoded — Neo4j routing eliminated
- Fixed: `firmId` optional in `ossy-tools.ts` — tools work from discover without a firm
- Fixed: `hasToolAccess = !!firmId || firmSection === "discover"` — discover unlocks tools
- Fixed: Jina embedding dimensions 1536 → 1024
- `discover_search` tool wired to panel result display

### Agent C (Firm pages)
- Coming soon pages for Network, Partnerships
- Chat UX fixes
- Services/case study auto-seeding on first page load with multi-layer cache fallback

### Agent D (Billing)
- Self-healing org activation on billing page
- Stripe env var whitespace fix

### Data Agent (Enrichment & Firm Connections)
- Bulk enriched all 1,152 firms: Jina scrape + Gemini classify + abstraction profile + 1024-dim embedding
- `firm_services`: 7,301 rows, 1,105 firms (96%) — from `enrichment_data.extracted.services`
- `firm_case_studies`: 773+ rows, 150+ firms — website crawl via `_discover_case_studies.mjs` (still running ~2h bg process)
- `expert_profiles`: 5,899 rows, 910 firms — PDL team discovery
- Scripts: `_bulk_enrich_legacy.mjs`, `_backfill_all_embeddings.mjs`, `_populate_firm_services.mjs`, `_discover_case_studies.mjs`, `_populate_expert_profiles.mjs`
