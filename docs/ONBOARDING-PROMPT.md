# COS CONCEPT — Onboarding Prompt & Conversational Flow (v2)

## Overview
When a new firm joins Collective OS, Ossy conducts a conversational interview to understand their partnership preferences. The goal is to collect **5 high-signal data points** that power the matching engine — without overwhelming the user.

**Principle:** Progressive disclosure. Get the 5 things we can't infer first. Enrich everything else over time.

**Target:** Under 90 seconds of input, 2-3 minute total experience.

---

## Pre-Population (Phase 1: Confirm, Don't Re-Ask)

Before question 1, the enrichment pipeline already knows:
- Services offered (from website scraping)
- Industry focus (from classification)
- Geography / location (from PDL company data)
- Company size (from PDL)
- Skills (from classification)
- Firm category (from classification)

Ossy **confirms** this in 1-2 exchanges. It does NOT ask the user to re-state what the system already knows. Phase 1 should feel like: "I've done my homework."

---

## The 5 Interview Questions (Phase 2)

These are the 5 questions Ossy asks during onboarding. Each one creates data that pre-population cannot infer and that directly powers the matching engine.

### Q1. Partnership Philosophy
**Field:** `partnershipPhilosophy` (string: "breadth" | "depth" | "opportunities")

> "How do you see partnerships helping your business grow? Are you looking to **extend the breadth of services** you can offer clients, **deepen the capabilities** you already have, or **open doors to new opportunities** and client referrals?"

**Why it matters:** This is an algorithm selector, not just a stored preference. It determines which matching strategy runs:
- **breadth** → cross-category matching (find firms in different categories)
- **depth** → same-category-different-skills matching (find specialists in your domain)
- **opportunities** → client-overlap matching (find firms serving similar clients who refer work)

**Graph impact:** Stored in `rawOnboardingData`. Used as a query parameter at match time.

### Q2. Capability Gaps (up to 3)
**Field:** `capabilityGaps` (array of strings, max 3)

> "What are the biggest gaps in your offering right now? **What's the #1 thing clients ask you for that you can't deliver in-house?** You can mention up to 3."

**Why it matters:** This is the demand signal — what partner capabilities they actually need. It's the supply side of matching.

**Graph impact:** Creates `PREFERS` edges from their Company node to Skill or FirmCategory nodes.

**UX note:** Do NOT show a count of matching firms if there are fewer than 20 in the network. Showing a small number makes the network feel small.

### Q3. Partner Types
**Field:** `preferredPartnerTypes` (array of strings from 30 COS firm categories)

> Based on Q2 answer, Ossy **suggests** types: "Based on what you just told me, I'd suggest looking at [suggested types]. **Does that sound right, or would you add anything?**"

**Why it matters:** This should feel intelligent — Ossy connects their gap to the right partner types instead of asking them to pick from a list.

**Graph impact:** Creates `PREFERS` edges from their Company node to FirmCategory nodes.

### Q4. Deal-Breaker
**Field:** `dealBreaker` (string, free-text)

> "One last filter to make sure I don't waste your time — **is there anything that's an absolute deal-breaker in a partner?**"

**Why it matters:** Eliminates bad matches fast. A single negative filter is worth more than 5 positive ones.

**Graph impact:** Creates an `AVOIDS` edge in the knowledge graph.

### Q5. Geography Preference
**Field:** `geographyPreference` (string: "Global" | specific region)

> "Last one — **do you need partners in your local market, or are you open to working with firms anywhere?**"

**Why it matters:** Geography filters are high-impact but often obvious. If the firm is clearly remote-first, Ossy can skip this and default to "Global."

**Graph impact:** Filters `OPERATES_IN` edges during structured search.

---

## What We Dropped (Moved to Progressive Enrichment)

These dimensions from the original 8-dimension framework are now collected organically by Ossy during later conversations, not during onboarding:

| Dimension | Why dropped | When collected instead |
|-----------|-------------|----------------------|
| Hourly rates | Low signal for matching | When they discuss a specific project |
| Project size | Low signal for matching | When they discuss a specific project |
| Partner size preference | Pre-population covers company size | When Ossy shows matches and they react |
| Industry experience required | Pre-population covers industries | When they search for partners in a specific industry |
| Client size preference | Low signal for matching | When they discuss their client base |
| Partnership role | Too abstract without context | When they engage with a specific match |

---

## Conversational Flow Design

### Opening
Ossy frames the conversation around value, not data collection:
> "I can see your firm data on the left — let's focus on finding you the right partners."

### Interview Style
- **One question at a time** — never stack questions
- **Frame positively** — COS is an opportunity to help them grow, not a form to fill out
- **Question 3 should feel intelligent** — Ossy suggests partner types based on Q2 answer
- **Skip Q5 if obvious** — remote-first firm = default to "Global"
- **Bold the question** — always the last thing in the message
- **Keep responses short** — 2 sentences of acknowledgment + the bolded question

### The Ecosystem Discovery Feeling
Each question should feel like it's unlocking the graph, not collecting data:
> "You work with mid-market e-commerce brands — let me narrow down the network for you..."

The user should feel like they're watching a massive ecosystem get filtered down to their perfect partners.

### Closing
> "Great — I've got a clear picture of what you need. Let me start finding partners that complement your firm."

---

## Backward Compatibility

Users who completed the original 9-question flow (v1) are still considered "onboarded." The system checks:
1. All 5 v2 fields are filled, **OR**
2. All 9 v1 legacy fields are filled

Both sets of data are stored in `partnerPreferences.rawOnboardingData` JSONB.

---

## Data Output

The onboarding produces:
1. **Partnership philosophy** stored in `rawOnboardingData` (algorithm selector)
2. **PREFERS edges** in Neo4j (capability gaps → Skill/FirmCategory nodes)
3. **PREFERS edges** in Neo4j (partner types → FirmCategory nodes)
4. **AVOIDS edges** in Neo4j (deal-breaker → filter nodes)
5. **Geography filter** stored in `rawOnboardingData` (used at query time)
6. **Match readiness** flag set — triggers initial match generation

---

## Admin Analytics

Onboarding events are tracked per-question in the `onboarding_events` table with `stage: "interview_answer"` and `event: "{fieldName}"`. The admin dashboard shows:
- Per-question completion rates (for both v1 and v2 fields)
- Drop-off analysis (which question do users abandon at?)
- Funnel: domain submitted → enrichment → interview started → onboarding complete
