# Discover Feature — Build Notes & Handoff

> **Status:** In Progress
> **Last updated:** 2026-03-12
> **Session:** Initial build — merge conflict resolved, core pages built
> **Next dev picks up:** See "What's Still Needed" section

---

## 1. Product Vision (What & Why)

### What Discover Is

Discover is the **ecosystem exploration surface** of COS. It lets platform members find partner firms, individual experts, and case studies across the entire network — not through a search bar, but through a conversation with Ossy.

This is **not a search feature in the traditional sense.** There is no search input on the Discover page. Ossy is the sole entry point.

### What Discover Is Not (Yet)

**Matchmaking is explicitly out of scope for this phase.** Matchmaking (bidirectional fit scoring, proactive partner suggestions, "we think you should meet X" notifications) will be a separate feature built later. Do not conflate the two. Focus right now is on helping users explore and understand who is in the network.

### Ossy's Role

Ossy is a **consultant, not a search engine.** She:
- Listens to challenges and problems, not just keyword queries
- Challenges weak or overly broad queries with follow-up questions
- Helps users think through what they actually need before surfacing results
- Understands the network deeply — case studies, experts, firms — and surfaces the most relevant matches

The idle state on the Discover page reinforces this: it does not say "search for something", it says "tell me about a challenge."

---

## 2. Design Decisions (From Product Owner Interview)

These decisions were explicitly confirmed. Do not change them without going back to the product owner.

| Decision | What was decided | Why |
|----------|-----------------|-----|
| Search entry point | Ossy only — no search bar on the page | Discovery through conversation, not keyword search |
| Fit display | Three tiers: Strong Fit / Good Fit / Worth Exploring | No numeric % score — tiers feel more qualitative and human |
| Profile page layout | Single scrollable page, not tabs | More like a "dating profile" — you see everything as you scroll |
| Profile page section order | Contextual — reorders based on what the user asked Ossy | Most relevant content surfaces first |
| Profile CTAs | "Ask Ossy about this firm" only | Request Partnership is deferred to matchmaking phase |
| Entity types in results | Firms, experts, and case studies all appear as result cards | All three are valid discovery targets |
| Profile page "View Profile" | Always navigates to the firm's profile page | Even for expert/case study cards — expert profile pages TBD |
| Ossy behavior toward weak queries | Must challenge them, not execute them | Prevents low-quality matches; Ossy acts as quality gate |

---

## 3. Data Flow

### How Results Get to the Discover Page

```
User types in Ossy chat panel (right sidebar)
  ↓
Ossy decides whether to ask clarifying questions or run a search
  ↓
Ossy calls discover_search tool (src/lib/ai/ossy-tools.ts)
  ↓
Tool calls executeSearch() → three-layer cascade (Neo4j → pgvector → Gemini)
  ↓
Tool returns candidates[] in DiscoverCandidate shape
  ↓
ChatPanel intercepts tool result (toolName === "discover_search")
  ↓
ChatPanel calls onSearchResults(candidates, query)
  ↓
onSearchResults calls discover.setResults() → DiscoverResultsProvider context
  ↓
/discover page reads context via useDiscoverResults()
  ↓
ResultCard components render with fit tier badges
```

### How Context Gets to the Profile Page

```
User clicks "View Profile" on a ResultCard
  ↓
Link navigates to /discover/[firmId]?context=<url-encoded-explanation>
  (context = Ossy's match explanation for this result)
  ↓
Profile page reads context via useSearchParams()
  ↓
computeSectionOrder(context, profile) scores each section
  ↓
Sections render in scored order — most relevant to the user's query first
```

---

## 4. File Map

### Core Files

| File | Purpose | Status |
|------|---------|--------|
| `src/app/(app)/discover/page.tsx` | Main Discover page — Ossy-driven results display | ✅ Built |
| `src/app/(app)/discover/[firmId]/page.tsx` | Firm profile page — trust-first, contextual | ✅ Built |
| `src/hooks/use-discover-results.tsx` | React context — Ossy pushes results here | ✅ Updated |
| `src/lib/ai/ossy-tools.ts` | `discover_search` tool — runs search, shapes candidates | ✅ Updated |
| `src/components/chat-panel.tsx` | Intercepts tool results, calls onSearchResults | ✅ Fixed |

### Supporting Files (Read-Only for This Feature)

| File | Role |
|------|------|
| `src/app/api/search/route.ts` | Search API — called by discover_search tool |
| `src/app/api/discover/[firmId]/route.ts` | Postgres firm profile API — called by profile page |
| `src/app/api/discover/entity/route.ts` | Neo4j entity detail — built but unused in current flow |
| `src/lib/matching/search.ts` | executeSearch() orchestrator (merge conflict — see below) |
| `src/lib/matching/types.ts` | MatchCandidate type — what the search returns |
| `src/app/(app)/layout.tsx` | Wires onSearchResults → discover context, line 891/921 |

---

## 5. Key Types

### `DiscoverCandidate` (`src/hooks/use-discover-results.tsx`)

This is the shape of data that flows from Ossy → context → Discover page.

```typescript
interface DiscoverCandidate {
  entityType: "firm" | "expert" | "case_study";
  entityId: string;       // Neo4j firm ID, expert legacyId, or case study legacyId
  firmId: string;         // Always the firm's ID — used for /discover/[firmId] link
  displayName: string;    // Firm name, expert name, or case study title
  firmName: string;       // Firm name (useful for expert/case study cards)
  matchScore: number;     // 0–100 — used for fit tier bucketing
  explanation: string;    // Ossy's reason for surfacing this result
  categories: string[];   // Up to 3 firm categories
  skills: string[];       // Up to 5 skills
  industries: string[];   // Up to 3 industries
  website?: string;
  caseStudyCount?: number;
}
```

### Fit Tier Bucketing (`src/app/(app)/discover/page.tsx`)

```typescript
function getFitTier(score: number): "strong" | "good" | "exploring" {
  if (score >= 75) return "strong";   // "Strong Fit"   — green badge
  if (score >= 50) return "good";     // "Good Fit"     — electric blue badge
  return "exploring";                  // "Worth Exploring" — grey badge
}
```

---

## 6. Component Breakdown

### `/discover` Page — `page.tsx`

Three states:
1. **Idle** — `<IdleState />`: Ossy-as-consultant messaging, 4 problem-framed starter buttons that inject text into Ossy chat via `cos:inject-chat` custom event
2. **Searching** — `<SkeletonCard />` × 3: pulse animation while Ossy processes
3. **Results** — `<ResultCard />` list: staggered fade-in animation

`ResultCard` renders:
- Entity icon (Building2=firm/electric, User=expert/warm, BookOpen=case_study/signal)
- Display name + subtitle (categories for firms, firm name for experts/case studies)
- Fit tier badge (Strong Fit / Good Fit / Worth Exploring)
- Ossy's explanation text
- Up to 4 skill tags (grey) + 2 industry tags (warm)
- "View Profile" button → `/discover/[firmId]?context=<explanation>`

### `/discover/[firmId]` Profile Page

Single scrollable page. Sections render dynamically based on available data and contextual scoring.

**Always shown:**
- Hero: logo (via logo.dev fallback), name, location, size, founded year, website, categories, narrative/description
- "Ask Ossy about this firm" button → injects pre-written message into Ossy chat

**Context banner:** If `?context=` param present, shows a blue banner: "Showing results relevant to: [query]"

**Dynamic sections** (hidden if no data, ordered by context relevance):

| Section ID | What it shows | Default priority |
|------------|--------------|-----------------|
| `case_studies` | Case study cards with title, client, skills/industry pills, link to source | 1st (if data exists) |
| `experts` | Expert grid cards with photo/avatar, title, location, top skills | 2nd |
| `clients` | Notable client name pills | 3rd |
| `services` | Service list with descriptions and sub-service pills | 4th |
| `skills` | Capability pills (only if no services section) | 5th |
| `industries` | Industry pills | 6th |
| `markets` | Market pills | 7th |
| `partnership` | Typical client profile + partnership goals + preferred partner types | 8th |

**Contextual boosting** (`computeSectionOrder()` function):

| Keywords in context | Sections boosted |
|--------------------|-----------------|
| `case stud`, `work`, `portfolio`, `project`, `result` | case_studies +50 |
| `expert`, `team`, `people`, `who`, `specialist`, `staff` | experts +50 |
| `client`, `customer` | clients +40 |
| `service`, `offer`, `capabilit` | services +40, skills +20 |
| `skill`, `expertise`, `speciali` | skills +30 |
| `industry`, `vertical`, `sector`, `healthcare`, `fintech`, `saas` | industries +30 |
| `market`, `region`, `country`, `apac`, `emea`, `latam`, `europe`, `asia` | markets +30 |
| `partner`, `referral`, `collaborate` | partnership +30 |

---

## 7. Wiring — How ChatPanel Connects to Discover

The connection lives in two places:

**`src/app/(app)/layout.tsx` (lines 891, 921):**
```typescript
// onSearchResults is only passed when on the /discover route
onSearchResults={pathname === "/discover" ? handleSearchResults : undefined}
```

**`src/components/chat-panel.tsx` (line ~651):**
```typescript
// Intercepts discover_search tool results and pushes to context
if (toolName === "discover_search" && onSearchResults) {
  const output = ... // tool result
  if (output?.candidates) {
    onSearchResults(output.candidates, args?.query ?? "");
  }
}
```

**`src/lib/ai/ossy-tools.ts` (discover_search tool output shape):**
```typescript
candidates: result.candidates.slice(0, 8).map((c) => ({
  entityType: c.entityType,
  entityId: c.entityId,
  firmId: c.firmId,
  displayName: c.displayName,
  firmName: c.firmName ?? c.preview.firmName ?? c.preview.subtitle ?? c.displayName,
  matchScore: Math.round(c.totalScore * 100),
  explanation: c.matchExplanation ?? "",
  categories: c.preview.categories.slice(0, 3),
  skills: c.preview.topSkills.slice(0, 5),
  industries: c.preview.industries.slice(0, 3),
  website: c.preview.website ?? undefined,
  caseStudyCount: c.preview.caseStudyCount ?? undefined,
}))
```

**Critical:** The `DiscoverCandidate` type in `use-discover-results.tsx`, the `DiscoverResult` interface in `chat-panel.tsx`, and the tool output shape in `ossy-tools.ts` must all stay in sync. If you change one, change all three.

---

## 8. What's Still Needed

### High Priority (Required for Feature to Feel Complete)

| Task | File(s) | Notes |
|------|---------|-------|
| Ossy prompt update | `src/lib/ai/ossy-prompt.ts` | Ossy must be instructed to challenge weak/broad queries before running discover_search. Currently she may run the tool too eagerly. |
| Fix `discover_search` tool description | `src/lib/ai/ossy-tools.ts` | Tool description still says "Use when user wants to find..." — should emphasize problem-first approach |
| Resolve remaining merge conflicts | `src/lib/matching/search.ts`, `src/lib/db/schema.ts`, `src/lib/enrichment/graph-writer.ts` | These are `UU` files in git — app won't build cleanly until resolved |
| Add auth check to `POST /api/search` | `src/app/api/search/route.ts` | Currently no authentication — anyone can call it |
| Fix Neo4j node label in entity API | `src/app/api/discover/entity/route.ts` line 50 | Uses `MATCH (f:ServiceFirm ...)` — must be `MATCH (f:Company:ServiceFirm ...)` |

### Medium Priority (Polish & Edge Cases)

| Task | Notes |
|------|-------|
| Expert/case study profile pages | Currently "View Profile" on expert and case study cards links to the firm's profile page. Expert-specific profile pages are TBD. |
| Empty network state | If the graph has no data, discover_search returns 0 results. Ossy should handle this gracefully in her response. |
| Logo fallback quality | Using `img.logo.dev` with `pk_anonymous` token — no rate limit protection. Consider adding proper API key or fallback strategy. |
| Search context truncation | Long Ossy explanations passed as `?context=` param can be very long. Consider truncating to 200 chars or using a hash lookup. |
| Mobile Ossy button on Discover | On mobile, the chat panel is a full-screen overlay. The "Start a conversation with Ossy" arrow hint on the idle state should point to the floating Ossy button, not the right sidebar. |

### Out of Scope (Do Not Build in This Phase)

- Request Partnership flow (matchmaking phase)
- Bidirectional fit scoring UI
- Proactive match suggestions
- Expert-specific profile pages
- Case study detail pages
- Search history or saved searches
- Filter controls on the Discover page

---

## 9. Testing as Admin

`@joincollectiveos.com` accounts are auto-redirected to `/admin` by `src/app/(app)/layout.tsx:104-109`.

**To test Discover:**
1. **Impersonation (recommended):** `/admin` → find a customer firm → Impersonate → navigate to `/discover`
2. **Comment out redirect:** Lines 104–109 in `layout.tsx`
3. **Test account:** Log in with a non-COS email (Gmail etc.)

**To verify the data flow end to end:**
1. Open `/discover`
2. Type into Ossy chat: `"We're a marketing agency trying to break into healthcare — who should we be talking to?"`
3. Ossy should ask at least one clarifying question before running the search
4. Once Ossy runs the search, cards should appear in the main panel with fit tier badges
5. Click "View Profile" on any card
6. Confirm sections are in an order that makes sense for the query

---

## 10. Known Issues at Handoff

| Issue | Severity | File | Detail |
|-------|----------|------|--------|
| `src/lib/matching/search.ts` merge conflict | High | `search.ts` | executeSearch() can't be called until resolved |
| `src/lib/db/schema.ts` merge conflict | High | `schema.ts` | DB schema won't compile |
| `src/lib/enrichment/graph-writer.ts` merge conflict | High | `graph-writer.ts` | Graph writes broken |
| No auth on search API | Medium | `api/search/route.ts` | Public endpoint |
| Wrong Neo4j label in entity API | Medium | `api/discover/entity/route.ts:50` | `ServiceFirm` should be `Company:ServiceFirm` |
| Ossy not prompted to challenge queries | Medium | `ossy-prompt.ts` | Prompt update needed |
| `useCallback` imported but unused | Low | `discover/page.tsx` | Lint warning — safe to remove |

---

## 11. Related Docs

- `docs/context/discover.md` — Living context file (update this as you make changes)
- `docs/context/search-matching.md` — Full search pipeline details (layers, costs, types)
- `docs/context/ai-ossy.md` — Ossy prompt, tools, memory system
- `docs/context/CONTEXT.md` — Master index of all context files
