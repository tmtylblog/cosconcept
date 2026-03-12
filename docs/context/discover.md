# Discover Page

> Last updated: 2026-03-12 (evening — merge conflict resolved, profile page built, search wired)

## Overview

The Discover page (`/discover`) is the ecosystem exploration surface of COS. It lets platform members find partner firms, individual experts, and case studies across the full network — driven entirely through conversation with Ossy.

**Route:** `src/app/(app)/discover/page.tsx`
**Access:** Authenticated users only. `@joincollectiveos.com` emails are auto-redirected to `/admin` — see [Testing as Admin](#testing-as-admin).

---

## Design Principles

### Search vs Matchmaking
Discovery and Matchmaking are two distinct features. This page is **Search/Discovery only** — it surfaces the ecosystem. Matchmaking (bidirectional fit scoring, partnership recommendations, proactive suggestions) is a separate phase and is explicitly **out of scope** for this page.

### Ossy is a Consultant, Not a Search Box
There is no traditional search bar on this page. Ossy is the sole entry point to discovery. Ossy is designed to:
- **Listen to problems and challenges**, not just execute keyword queries
- **Challenge weak or overly broad queries** — if a user asks something vague, Ossy responds with clarifying questions to help them arrive at more relevant, specific results
- **Design solutions** — she understands the case studies, experts, and partner firms in the network and helps users think through what they actually need

Ossy does not behave like a search engine. She behaves like a knowledgeable consultant who happens to have access to the full network.

---

## Page States

### Idle State (no results yet)
Shown before the user has asked Ossy anything.

**Message framing:** Ossy explains that she understands the case studies, experts, and partner firms in the network and is standing by. She asks the user to tell her about a need they have or a problem they're trying to solve, and she'll do her best to help.

Do **not** frame this as "search for something." Frame it as "tell me about a challenge."

Includes pre-written conversation starters that inject text into Ossy chat (via `window.dispatchEvent(new CustomEvent("cos:inject-chat", ...))`) — these should be problem/challenge-framed, not query-framed.

### Searching State
Skeleton cards shown while Ossy is processing.

### Results State
Grid of result cards (see below). Header shows result count and a summary of what Ossy found.

A "Clear" button resets back to idle state.

---

## Result Cards

Each card represents one entity (firm, expert, or case study). Cards are surfaced by Ossy — the page renders whatever Ossy returns.

### Fit Tiers
Results are grouped into three tiers (not a percentage score):

| Tier | When to use |
|------|------------|
| **Strong Fit** | High relevance across multiple dimensions |
| **Good Fit** | Solid relevance, some gaps |
| **Worth Exploring** | Peripheral relevance, may be interesting |

The tier label appears as a badge on the card. No numeric match percentage is shown.

### Card Content
- Firm name (or expert name / case study title)
- Entity type indicator (Firm / Expert / Case Study)
- Fit tier badge
- A few contextually relevant content snippets — e.g., if the user asked about Shopify, surface Shopify-related skills or a relevant case study title from that firm
- Categories / headline info (firm type, location if available)

### Card Action
One action only: **View Profile** → navigates to `/discover/[firmId]` (or equivalent for experts/case studies).

No "Request Partnership" button on cards — matchmaking is out of scope for this phase.

---

## Profile Page — `/discover/[firmId]`

A full-page firm showcase. The purpose is to make the viewer want to meet this firm — think dating profile on a matchmaking service, not a directory listing.

### Design Philosophy
- **Trust-first content hierarchy** — lead with what establishes credibility: clients served, case studies, notable experts
- **Dynamic** — sections with no data are hidden entirely. The page adapts to what the firm has.
- **Contextual** — sections and content within sections reorder based on what the user asked Ossy. If they asked about Shopify expertise, case studies with Shopify skills float to the top. If they asked about APAC presence, markets and APAC-relevant case studies lead.

The search context from Ossy must be passed to this page (via URL params or navigation state) so the layout can personalize itself.

### Content Sections (in default order — reorders contextually)
1. **Firm overview** — name, website, location, size, firm type, founded year, logo
2. **What they do** — categories, services (with descriptions)
3. **Case studies** — the most trust-building section. Show title, client name, skills demonstrated, industry. Link to source. Prioritize case studies most relevant to the search context.
4. **Notable experts** — team members with public profiles. Name, title, headline, top skills.
5. **Skills & expertise** — L2 skills, industries served, markets
6. **Clients** — notable client names if available
7. **Partnership signals** — open to partnerships, preferred partner types, partnership goals *(shown only if data exists)*

### CTAs
- **Ask Ossy about them** — opens/focuses Ossy chat panel with the firm pre-loaded as context
- **Request Partnership** — *deferred, not in scope for this phase*

### API
`GET /api/discover/[firmId]` — reads from Postgres. Auth required.

Returns: firm base data, classification (categories/skills/industries/markets), services, case studies (active, non-hidden), experts (public only), abstraction profile (narrative, typical client profile, partnership readiness).

---

## Data Flow

```
User → describes a problem or need to Ossy in chat panel
  → Ossy asks clarifying questions if query is weak/broad
  → Ossy runs search_partners / search_experts / search_case_studies tool
  → Tool calls POST /api/search (three-layer cascade)
  → Results + fit tiers pushed to useDiscoverResults context
  → /discover page renders result cards

User → clicks "View Profile" on a card
  → navigates to /discover/[firmId]
  → search context passed via URL/state
  → profile page fetches firm data from GET /api/discover/[firmId]
  → sections ordered by relevance to search context
  → user clicks "Ask Ossy about them"
  → Ossy chat opens with firm pre-loaded as context
```

---

## Entity Types

| Type | Icon color | Standalone card? | Profile page |
|------|-----------|-----------------|--------------|
| `firm` | `cos-electric` | Yes | `/discover/[firmId]` |
| `expert` | `cos-warm` | Yes | TBD (not yet built) |
| `case_study` | `cos-signal` | Yes | TBD (links to source URL) |

---

## Technical State

### Merge Conflict — File Won't Compile
`src/app/(app)/discover/page.tsx` has an **unresolved git merge conflict** between two versions. Must be resolved before the page works. The correct version to keep is **Option A (Ossy-driven)** — the upstream version. The stashed version (self-contained search bar) should be discarded.

### Components

| File | Purpose | Status |
|------|---------|--------|
| `src/app/(app)/discover/page.tsx` | Main page — Ossy-driven result display | ✅ Working |
| `src/hooks/use-discover-results.tsx` | React context — Ossy pushes results here | ✅ Working |
| `src/components/discover/discover-drawer.tsx` | Side drawer component | Available (unused) |
| `src/app/(app)/discover/[firmId]/page.tsx` | Firm profile page — trust-first, dynamic | ✅ Built |

### API Endpoints

| Endpoint | File | Purpose | Auth |
|----------|------|---------|------|
| `POST /api/search` | `src/app/api/search/route.ts` | Three-layer search cascade | None (needs adding) |
| `GET /api/discover/entity` | `src/app/api/discover/entity/route.ts` | Neo4j entity detail | None |
| `GET /api/discover/[firmId]` | `src/app/api/discover/[firmId]/route.ts` | Postgres firm profile | Required |

### Known Issues

| Issue | File | Status | Notes |
|-------|------|--------|-------|
| ~~Unresolved merge conflict~~ | `src/app/(app)/discover/page.tsx` | ✅ RESOLVED | Conflict resolved; Ossy-driven architecture kept |
| ~~No `/discover/[firmId]` page~~ | `src/app/(app)/discover/[firmId]/page.tsx` | ✅ BUILT | Trust-first profile page with sections + Ask Ossy CTA |
| ~~Fit tier logic not yet implemented~~ | `src/app/(app)/discover/page.tsx` | ✅ DONE | Strong Fit / Good Fit / Worth Exploring tiers |
| No auth on `POST /api/search` | `src/app/api/search/route.ts` | ⚠️ Open | Needs auth check before production hardening |
| Firm entity query missing `Company` label | `src/app/api/discover/entity/route.ts:50` | ⚠️ Open | Should be `MATCH (f:Company:ServiceFirm ...)` |
| Search context not passed to profile page | — | ⚠️ Partial | URL `?context=` param exists but ordering logic not fully wired |
| Expert profile pages | — | ⚠️ Not built | `/discover/[expertId]` page not yet built |

---

## Testing as Admin

`@joincollectiveos.com` users are auto-redirected to `/admin` by `src/app/(app)/layout.tsx:104-109`.

**Options to test `/discover`:**
1. **Impersonation (recommended):** From `/admin` → find a customer → "Impersonate" → navigate to `/discover`. Orange banner appears. Stop impersonating to return.
2. **Comment out redirect:** Temporarily comment out lines 104-109 in `src/app/(app)/layout.tsx`.
3. **Use a non-COS email:** Log in with a Gmail or other non-`@joincollectiveos.com` test account.

---

## What's In Scope (This Phase)

- Resolve merge conflict → restore Ossy-driven result display
- Idle state with correct Ossy-as-consultant messaging and challenge-framed conversation starters
- Result cards with fit tiers (Strong Fit / Good Fit / Worth Exploring), no match %
- Fit tier bucketing logic (map raw scores to three tiers)
- Build `/discover/[firmId]` profile page — trust-first, dynamic, contextual
- Pass search context from Ossy results to profile page for section ordering

## What's Out of Scope (This Phase)

- Standalone search bar on the discover page
- Request Partnership flow
- Matchmaking / bidirectional fit scoring UI
- Expert profile pages
- Case study detail pages
