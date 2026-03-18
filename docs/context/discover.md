# Discover Page

> Last updated: 2026-03-18 (search intent classification, adaptive result allocation, case study detail blocks)

## Overview

The Discover page (`/discover`) is the ecosystem exploration surface of COS. It lets platform members find partner firms, individual experts, and case studies across the full network — driven entirely through conversation with Ossy.

**Route:** `src/app/(app)/discover/page.tsx`
**Access:** Authenticated users only.

---

## Architecture: 3-Column Layout with Inline Content Feed

```
┌──────────┬─────────────────────────────┬──────────────────────┐
│  NavBar  │     Center Content Feed     │  Ossy Chat Panel     │
│  (left)  │  - Idle state / starters    │  (dark bg, w-96)     │
│          │  - Result cards             │  - useChat lives here│
│          │  - Firm detail (inline)     │  - Event flush here  │
│          │  - Expert detail (inline)   │  - Contextual cmntry │
│          │  NO chat input here         │                      │
└──────────┴─────────────────────────────┴──────────────────────┘
```

### Key Design Decisions

1. **Center panel is content-only** — no `useChat`, no chat input, no message bubbles. It renders search results, firm detail blocks, and expert detail blocks.
2. **Right panel (ChatPanel) owns the conversation** — Ossy's chat, `useChat` hook, event listener/flush, and all AI interaction lives in the existing `ChatPanel` aside.
3. **Communication via context + events** — search results flow from ChatPanel → `DiscoverResultsProvider` context → center panel. User clicks in center emit `cos:page-event` custom events → ChatPanel's polling flush sends them to Ossy.
4. **No modals, no drawers** — firm/expert details expand inline in the center feed. Users dismiss them with X buttons.

### Why This Architecture (Not Unified Stream)

We tried a unified single-stream approach (chat + content interleaved in one column, no right aside). It failed because:
- The chat and content compete for attention in one column
- Ossy's conversational flow gets lost between large content blocks
- The user wants to read Ossy's commentary while simultaneously scanning results — requires two panels
- The ChatPanel's proven event handling (two-effect listener+flush pattern) breaks when duplicated in a separate component

---

## Design Principles

### Ossy is a Consultant, Not a Search Box
There is no traditional search bar. Ossy is the sole entry point to discovery. Ossy:
- **Listens to problems and challenges**, not keyword queries
- **Challenges weak or overly broad queries** with clarifying questions
- **Analyzes results** — summarizes patterns, splits, gaps in the data
- **Asks sharpening follow-ups** — not "want me to narrow?" but "I noticed half are full-service and half are boutiques — which fits your model?"
- **Maintains full conversation continuity** — references earlier searches, firms viewed, stated preferences
- **Compares refinements** — when narrowing, says who stayed, who's new, who dropped off
- **Provides contextual commentary** when user views a firm/expert profile — with real data, connecting to search intent
- **Suggests next steps** — "Want me to search for case studies?" or "Their lead expert might be worth an intro"

### Critical Ossy Behaviors (Enforced in System Prompt)
1. MUST always include text after calling `discover_search` — never let tool result be the entire response
2. On refinement searches, compare to previous results
3. Maintain full conversation continuity across all interactions
4. When user views a profile, connect observations to their stated goals
5. Never describe what user just clicked — tell them what they can't see (how it fits, what to watch for, what to do next)

---

## Page States

### Idle State (no results yet)
- "Discover Your Network" heading + description
- "Start a conversation with Ossy" CTA → dispatches `cos:inject-chat` event
- Pre-written conversation starters (challenge-framed, not query-framed)

### Searching State
- Skeleton loader cards (3 pulsing placeholders)
- Shown while `discover.searching === true`
- **Important:** Results are NOT rendered during searching (prevents "No matches found" flash)

### Results State
- Result cards from `useDiscoverResults().results`
- Header shows count + query text
- Each card has X dismiss button (lower-right) to remove from list

### Detail Blocks
- Firm/expert detail blocks from `useDiscoverStream().items`
- Rendered below results when user clicks "View Profile"
- X close button (upper-right) removes from feed
- Clicking same entity twice is prevented (dedup via `shownEntitiesRef`)

---

## Search Intent Classification

The query parser extracts a `searchIntent` field from every user query, classifying it as one of three intents:

| Intent | Description | Example Query |
|--------|-------------|---------------|
| `"partner"` | Looking for a firm to partner with | "Find me a Salesforce consultancy in APAC" |
| `"expertise"` | Looking for specific expertise/specialists | "Who has deep ML ops experience?" |
| `"evidence"` | Looking for proof of work / case studies | "Show me examples of fintech migrations" |

### Intent-Adaptive Result Allocation

`universalStructuredFilter` adjusts result allocation (firm/expert/case-study mix) based on intent:

| Intent | Firms | Experts | Case Studies |
|--------|-------|---------|-------------|
| `partner` | 50% | 30% | 20% |
| `expertise` | 20% | 55% | 25% |
| `evidence` | 20% | 25% | 55% |

### Intent-Specific Scoring Boosts

- **`expertise` intent:** Specialist boost doubles to +30% (vs default +15%)
- **`evidence` intent:** Case study contributor boost +15% applied

### searchIntent Propagation

`searchIntent` is propagated through the full stack:
- Query parser types → search pipeline → `universalStructuredFilter`
- Chat panel → layout → `DiscoverResultsProvider` context
- Available to result card components for adaptive rendering

---

## Result Cards

### Fit Tiers
| Tier | Score Range | Badge Color |
|------|-----------|-------------|
| **Strong Fit** | ≥75% | Green |
| **Good Fit** | ≥50% | Electric blue |
| **Worth Exploring** | <50% | Slate |

### Card Content
- Entity icon (Building2/User/BookOpen by type)
- Display name + categories/firm name
- Match score % + fit tier badge
- Explanation text (from search engine, line-clamped to 2 lines)
- Skill pills (up to 4) + industry pills (up to 2)
- "View Profile" button
- X dismiss button (lower-right)

### Adaptive Result Card Variants

Result cards render differently based on entity type:

| Variant | Component | When Used |
|---------|-----------|-----------|
| Default result card | `result-cards-block.tsx` | Firm results (all intents) |
| `ExpertResultCard` | `result-cards-block.tsx` | Expert results — shows specialist title, firm affiliation |
| `CaseStudyResultCard` | `result-cards-block.tsx` | Case study results — shows contributing firm, outcome summary |

### Card Actions
- **Click anywhere on card** → opens inline detail block below
- **X button** → removes card from results list
- Cards use `animate-slide-up` with staggered 60ms delays

---

## Firm Detail Block (Inline)

Tabbed profile rendered in the center feed. Component: `src/components/discover/stream-blocks/firm-detail-block.tsx`

### Tabs
| Tab | Content |
|-----|---------|
| Overview | Description, quick facts (website, LinkedIn, size), key experts (clickable), recent case studies, skills preview |
| Case Studies | Full list of case studies with skill/industry tags |
| Experts | Full expert list (clickable → opens expert detail) |
| Details | Categories, skills, industries, markets (full tag clouds) |

### Behavior
- Loading state: skeleton with pulse animation
- X close button in upper-right header
- Max height 500px with internal scroll
- Clicking an expert opens an expert detail block below

---

## Expert Detail Block (Inline)

Expert profile rendered in the center feed. Component: `src/components/discover/stream-blocks/expert-detail-block.tsx`

### Content
- "Relevant to your search" section — matching skills/industries highlighted in signal green
- Firm affiliation with link
- LinkedIn link + languages
- Specialist profiles (title, description, skills)
- Full skills/industries/markets tag clouds
- Case studies with skill/industry tags

### Behavior
- X close button in upper-right header
- Max height 450px with internal scroll

---

## Case Study Detail Block (Inline)

Case study profile rendered in the center feed. Component: `src/components/discover/stream-blocks/case-study-detail-block.tsx`

### Content
- Case study title + contributing firm name with link
- Client name + industry
- Challenge / approach / outcome sections
- Skills and industry tag clouds
- Contributing experts (if available)

### Data Type
`CaseStudyDetailData` — typed interface for case study detail payloads.

### Behavior
- X close button in upper-right header
- Max height 450px with internal scroll
- Pushed via `pushCaseStudyDetail()` in `use-discover-stream.tsx`

---

## Ossy Contextual Commentary (Page Events)

When a user clicks a firm/expert in the center panel, the system:

1. **Fetches entity data** from `/api/discover/entity`
2. **After data loads**, builds a data summary (categories, skills, industries, case studies, experts, description)
3. **Emits `cos:page-event`** with `dataSummary` field containing actual profile data
4. **ChatPanel's polling flush** (2s interval on discover) picks up the event
5. **Sends `[PAGE_EVENT]` as user message** to Ossy (hidden from chat UI)
6. **Ossy responds** with consultative commentary connecting the profile to the user's search goals

### Event Types
```typescript
| { type: "discover_firm_viewed"; entityId: string; displayName: string; dataSummary: string }
| { type: "discover_expert_viewed"; entityId: string; displayName: string; dataSummary: string }
```

### Throttling (Discover-Specific)
- **2s cooldown** between discover events (vs 30s for general page events)
- **No "one per section" limit** — every firm/expert click triggers commentary
- **No session dedup** — discover events always fire
- **2s polling interval** (vs 3s for general pages)
- **[PAGE_EVENT] messages hidden** from chat UI (filtered in ChatPanel render)

---

## Data Flow

```
User → types in ChatPanel (right aside)
  → Ossy calls discover_search tool
  → ChatPanel intercepts tool result via onSearchResults callback
  → callback calls discover.setResults() via DiscoverResultsProvider context
  → Center content feed re-renders with result cards

User → clicks result card in center
  → handleViewProfile dispatches by entityType (firm/expert/case_study)
  → pushFirmDetail(), pushExpertDetail(), or pushCaseStudyDetail() in DiscoverStreamProvider
  → Detail block appears (skeleton → loaded)
  → After data loads, cos:page-event emitted with data summary
  → ChatPanel flush sends [PAGE_EVENT] to Ossy
  → Ossy responds with contextual commentary in right chat

User → clicks X on result card
  → Card removed from discover.results via setResults()

User → clicks X on detail block
  → Block removed from stream.items via removeItem()

User → clicks conversation starter
  → cos:inject-chat event dispatched
  → ChatPanel picks it up and sends as user message
```

---

## Components

| File | Purpose | Status |
|------|---------|--------|
| `src/app/(app)/discover/page.tsx` | Page wrapper — renders DiscoverStream | ✅ Working |
| `src/components/discover/discover-stream.tsx` | Center content feed — results + detail blocks (NO chat) | ✅ Working |
| `src/components/discover/stream-blocks/result-cards-block.tsx` | Search result cards with dismiss | ✅ Working |
| `src/components/discover/stream-blocks/firm-detail-block.tsx` | Tabbed inline firm profile | ✅ Working |
| `src/components/discover/stream-blocks/expert-detail-block.tsx` | Inline expert profile | ✅ Working |
| `src/components/discover/stream-blocks/case-study-detail-block.tsx` | Inline case study profile | ✅ Working |
| `src/hooks/use-discover-stream.tsx` | Stream state — detail blocks (firm/expert/case study), dedup, data fetch, event emit. Exposes `pushCaseStudyDetail()`. | ✅ Working |
| `src/hooks/use-discover-results.tsx` | Search results context (shared between layout + page) | ✅ Working |
| `src/app/(app)/discover/[firmId]/page.tsx` | Full-page firm profile (separate route) | ✅ Built |
| `src/components/discover/discover-drawer.tsx` | Legacy side drawer (deprecated — replaced by inline blocks) | Deprecated |
| `src/components/discover/discover-results.tsx` | Legacy results grid (deprecated — replaced by stream blocks) | Deprecated |
| `src/components/discover/discover-filters.tsx` | Filter sidebar (future: collapsible bar) | Available |

### API Endpoints

| Endpoint | File | Purpose |
|----------|------|---------|
| `POST /api/search` | `src/app/api/search/route.ts` | Three-layer search cascade |
| `GET /api/discover/entity` | `src/app/api/discover/entity/route.ts` | Neo4j entity detail (firm/expert/case_study) |
| `GET /api/discover/[firmId]` | `src/app/api/discover/[firmId]/route.ts` | Postgres firm profile |

---

## Ossy System Prompt — Discover Mode

When `firmSection === "discover"`, the system prompt adds ~2000 tokens of discover-specific instructions. Key sections:

### Consultant Mindset
- Interpret follow-ups in context (not as new searches)
- Challenge vague requests
- Probe before searching
- Synthesize, don't just retrieve
- Know when NOT to search

### Critical Rules (Post-Search)
1. Always include text after calling discover_search
2. Compare refinement searches to previous results (who stayed, who's new)
3. Maintain full conversation continuity
4. Never let a tool result be the entire response
5. Reference `_sharpeningHints` from tool result for analysis

### Contextual Commentary Rules
- Reference user's original search intent
- Call out specific strengths from actual data
- Flag gaps honestly
- Suggest next steps
- Never describe what user clicked — tell them what they can't see

### Tool Result Enhancements
- `discover_search` returns `_sharpeningHints[]` with specific observations (category splits, evidence gaps, industry variety, skill clusters)
- `discover_search` returns `_instruction` with explicit good/bad response examples
- `search_experts` / `search_case_studies` return `_instruction` on empty results to ensure conversational response

---

## Patterns for Derivative Systems (Partnerships)

When building the Partnerships page with similar discover-like behavior, replicate these patterns:

### Architecture
1. **Separate content from conversation** — content in center, Ossy chat in right aside
2. **Use context providers** at layout level for cross-component state sharing
3. **Emit page events** with actual data (not just entity names) for Ossy commentary
4. **Two-effect event pattern** in ChatPanel: (1) listener that queues, (2) polling interval that flushes when ready
5. **Hide system messages** — filter `[PAGE_EVENT]` from chat UI render

### Ossy Behavior
1. **Consultant tone** — always connect observations to user's stated goals
2. **Sharpening follow-ups** — observe data patterns, suggest strategic directions
3. **Conversation continuity** — reference everything discussed in the session
4. **Conversational empty states** — never show raw "no results" UI in chat; always suggest alternatives
5. **Contextual commentary** — real data analysis, not narration of user actions

### UI Components
1. **Result cards** — dismissible, clickable, staggered animation
2. **Detail blocks** — inline expandable, closable, tabbed for complex data
3. **Dedup** — prevent duplicate detail blocks via ref tracking
4. **Auto-scroll** — scroll to new detail blocks on click; track `updateCounter` for data load completion
5. **Skeleton states** — show during search and during detail data load

---

## Known Issues

| Issue | Status | Notes |
|-------|--------|-------|
| No auth on `POST /api/search` | ⚠️ Open | Needs auth check |
| Expert profile pages (`/discover/[expertId]`) | ⚠️ Not built | Only inline detail blocks exist |
| Collapsible filter bar | 🔮 Planned | Thin bar along left edge, expands on click |
| Search context not fully passed to `[firmId]` page | ⚠️ Partial | URL `?context=` exists but ordering not wired |
