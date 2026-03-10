# 11. Partnerships & Opportunities

> Last updated: 2026-03-09

## Overview

The partnerships system connects complementary service firms through a multi-stage lifecycle, enables opportunity sharing between trusted partners, tracks referral value, and supports AI-generated three-way introductions via Ossy. All partnership-related APIs require authentication. Admin endpoints require `superadmin` or `admin` role.

---

## Partnership Lifecycle

```
suggested ──> requested ──> accepted ──> (active partnership)
                   │              │
                   └──> declined  └──> inactive (soft delete / deactivation)
```

### Statuses (pgEnum `partnership_status`)
| Status | Meaning |
|---|---|
| `suggested` | Created by matching engine or admin; neither firm has acted |
| `requested` | One firm has explicitly requested the partnership |
| `accepted` | Both parties agreed; partnership is active |
| `declined` | The receiving firm declined (can retry later) |
| `inactive` | Manually deactivated or expired (soft delete via DELETE endpoint) |

### Partnership Types (pgEnum `partnership_type`)
| Type | Description |
|---|---|
| `trusted_partner` | Default. Bilateral referral relationship |
| `collective` | Group partnership model |
| `vendor_network` | Vendor/supplier relationship |

### How Partnerships Are Created
1. **Matching engine suggestions** -- The system creates partnerships with `status: "suggested"` and populates `matchScore` (0-1 float) and `matchExplanation` (LLM-generated text).
2. **User-initiated from Discover** -- User searches on `/discover`, finds a match, clicks "Request Partnership" which calls `POST /api/partnerships` with `status: "requested"`.
3. **Direct API request** -- Any authenticated user can POST to `/api/partnerships` with `{ firmId, targetFirmId, type?, message? }`.

### Accepting/Declining
- `PATCH /api/partnerships/[id]` with `{ action: "accept" | "decline", message? }`
- Only works when current status is `requested` or `suggested`
- Accept sets `acceptedAt` timestamp; decline sets `declinedAt`

### Deactivation
- `DELETE /api/partnerships/[id]` -- Sets status to `inactive` (soft delete), logs `deactivated` event.

---

## Partnership Events Tracking

The `partnershipEvents` table is an append-only audit log for every partnership action.

| Event Type | Trigger |
|---|---|
| `requested` | Partnership request created |
| `accepted` | Partnership accepted |
| `declined` | Partnership declined |
| `deactivated` | Partnership soft-deleted |
| `message` | Message exchanged between partners |
| `referral` | Referral created within partnership |
| `intro_sent` | Three-way intro email sent (metadata includes `messageId` and `recipients`) |

Each event stores: `partnershipId`, `eventType`, `actorId` (user), `metadata` (JSONB), `createdAt`.

---

## Three-Way Introductions (Ossy Intro Emails)

Ossy generates AI-crafted introduction emails connecting two firms. Two paths exist:

### User-Initiated (Draft + Review)
- `POST /api/partnerships/intro` with `{ partnershipId, send?: boolean }`
- `send=false` (default): Returns draft email with subject, HTML body, text body, talking points, and recipient list
- `send=true`: Sends email immediately via `sendEmail()` and logs `intro_sent` partnership event

### Admin-Initiated (Always Queued for Approval)
- `POST /api/admin/partnerships/intro` with `{ partnershipId }`
- Calls `queuePartnershipIntro()` which generates the email and inserts it into `emailApprovalQueue` with `status: "pending"`
- Intro emails from admin flow **never auto-send** -- a human must approve from the email queue

### Email Generation
- Uses `generateIntroEmail()` in `src/lib/email/intro-generator.ts`
- Model: `google/gemini-2.0-flash-001` via OpenRouter
- Generates: subject line, plain text body, 3 talking points
- HTML version built from template with Collective OS branding
- Uses firm context: name, website, description, services, skills, industries, contact name/email
- Incorporates match score and match explanation when available

### Email Content
- Addressed to both contacts by first name
- Written from Ossy's perspective
- Explains each firm (2-3 sentences), why they should connect, and suggests a 15-min intro call
- Includes a "Suggested talking points" section
- Branded with Collective OS header/footer

---

## Core Concepts: Opportunities vs Leads

> **IMPORTANT DISTINCTION** — Opportunities and Leads are two separate concepts with a parent-child relationship. This distinction is critical to understanding the entire business development pipeline.

### Opportunity
An **Opportunity** is a **pain point or challenge** that a potential client is experiencing. It is inferred from context — a conversation, a call, an email, a chat message. It is NOT a concrete work package or something that can be directly sold. It represents the underlying problem.

- A single Opportunity can give rise to **multiple Leads** (multiple solutions to the same problem)
- Opportunities are discovered/extracted by AI from signals in conversations, calls, and emails
- They represent **what the client is struggling with**, not what the service provider offers

**Example:** A potential client mentions in a call: *"We're losing customers after the first 90 days and we don't know why."* This is an Opportunity — a churn problem. It could be solved by a retention strategist, a UX firm, a data analytics firm, or a customer success consultancy — multiple Leads.

### Lead
A **Lead** is a **specific solution** to an Opportunity — a concrete, scoped offering that a service provider can deliver to address the client's pain point. Leads have a significantly higher probability of closing because they map directly to an identified, specific need.

- A Lead is always linked to a parent Opportunity
- A single Opportunity generates one or more Leads (one per potential solution path)
- Leads are what get **shared with partner firms** for potential engagement
- Leads represent **what can be sold** — the translation of pain into solution

**Example (continuing from above):** The churn Opportunity generates three Leads:
1. *"Customer success program design"* → shared with a CS consultancy partner
2. *"Onboarding UX audit and redesign"* → shared with a UX firm partner
3. *"Churn analytics and segmentation"* → shared with a data analytics partner

### Pipeline Flow

```
Context Signal (call / email / chat / manual)
        ↓
AI Extraction → Opportunity (pain point identified)
        ↓
Translation → Lead(s) (specific solutions derived from pain point)
        ↓
Shared with → Partner Firm(s) (only accepted partners)
        ↓
Claimed → Active Engagement → Won / Lost
```

---

## Opportunity System

Opportunities represent **identified pain points or challenges** that a potential client is experiencing. They are inferred from context and serve as the starting point of the business development pipeline. A single opportunity can lead to multiple leads (solutions).

### Opportunity Statuses (pgEnum `opportunity_status`)
| Status | Meaning |
|---|---|
| `open` | Newly created, not yet translated into leads |
| `shared` | Has generated at least one lead that has been shared |
| `claimed` | At least one lead has been claimed by a partner firm |
| `won` | At least one lead converted to a deal |
| `lost` | All leads were lost or no solution found |
| `expired` | The opportunity expired without action |

### Opportunity Sources
`manual` | `call` | `email` | `ossy` -- Indicates how the opportunity was discovered.

### Creating Opportunities
- `POST /api/opportunities` with `{ firmId, title, description?, requiredSkills?, requiredIndustries?, estimatedValue?, timeline?, clientType?, source? }`
- Values for `estimatedValue`: free text like `"10k-25k"`, `"50k-100k"`
- Values for `timeline`: `"immediate"`, `"1-3 months"`, `"3-6 months"`

### Sharing Opportunities
- `POST /api/opportunities/share` with `{ opportunityId, firmIds }`
- **Validation**: Only shares with firms that have an `accepted` partnership with the opportunity's firm
- Creates `opportunityShares` records (skips duplicates)
- Auto-updates opportunity status from `open` to `shared` on first share
- Returns counts: `{ shared, skipped, invalidPartners }`

### Viewing Opportunities
- `GET /api/opportunities?firmId=xxx` -- Returns two lists:
  - `own`: Opportunities created by the firm (with `shareCount` and `claimedCount`)
  - `shared`: Opportunities shared with the firm (with `viewedAt`, `claimedAt`)
- `GET /api/opportunities/[id]` -- Full details with all shares and firm names

### Updating Opportunities
- `PATCH /api/opportunities/[id]` -- Update any field (status, title, description, skills, etc.)

### AI Opportunity Extraction
- `src/lib/ai/opportunity-extractor.ts` scans text (call transcripts, emails, chat messages) for pain point signals
- Detects phrases like: "We need help with...", "Our client is struggling with...", "We don't do [service]...", "We're losing customers because..."
- Returns structured opportunities with confidence scores (threshold: >= 0.5)
- Model: `google/gemini-2.0-flash-001` via OpenRouter

---

## Lead System

> **STATUS: PARTIALLY BUILT** — API routes exist (`src/app/api/leads/route.ts`, `src/app/api/leads/[id]/route.ts`) but the full Lead review workflow and UI are being addressed in a separate feature. See alignment notes below before building anything in this area.

> **⚠️ DEVELOPER ALIGNMENT NOTE:**
> The Lead review workflow is intentionally human-gated — **firm owners must review AI-generated Leads before they are shared with partner firms**. Do NOT build any auto-sharing or auto-dispatch of Leads without explicit product sign-off. The AI generates candidate Leads from Opportunities, but the firm owner is always the final decision-maker on what gets shared and with whom. This review step is being designed as a separate feature — coordinate with the product owner before touching Lead dispatch logic.

Leads are **specific solutions** derived from Opportunities. They are concrete, scoped service offerings that directly address the pain point identified in the parent Opportunity. Leads have a higher probability of closing because they represent a clear match between client need and service provider capability.

### Lead Characteristics
- Always linked to a parent `Opportunity` via `opportunity_id`
- Represents one specific solution path (a single Opportunity can have multiple Leads)
- Scoped to a specific service, skill set, or firm type
- **Firm owner reviews and approves Leads before they are shared** — never auto-dispatched
- Shareable with partner firms who have the matching capability only after firm owner approval
- Trackable through a sales pipeline (draft → open → shared → claimed → won/lost)

### Lead Statuses (planned pgEnum `lead_status`)
| Status | Meaning |
|---|---|
| `draft` | AI-generated, not yet reviewed |
| `open` | Reviewed and ready to be shared |
| `shared` | Shared with one or more partner firms |
| `claimed` | A partner firm has claimed this lead |
| `won` | Converted to an active engagement |
| `lost` | Not converted — client went elsewhere or need dissolved |
| `expired` | No action taken within expiry window |

### Lead Sources (planned)
`ai_generated` | `manual` | `ossy` -- How the lead was created from the opportunity.

### Planned Schema (`leads` table)
| Column | Type | Notes |
|---|---|---|
| `id` | text PK | |
| `opportunity_id` | text FK → opportunities | Parent pain point |
| `firm_id` | text FK → service_firms | Firm that owns this lead |
| `title` | text | Specific solution title |
| `description` | text | How this solution addresses the opportunity |
| `required_skills` | jsonb (string[]) | Skills needed to deliver this solution |
| `required_industries` | jsonb (string[]) | Relevant industry context |
| `estimated_value` | text | Deal size estimate |
| `timeline` | text | Expected engagement timeline |
| `status` | lead_status enum | Pipeline stage |
| `source` | text | ai_generated \| manual \| ossy |
| `confidence` | real | AI confidence score (min 0.5) |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

### Planned Schema (`lead_shares` table)
Tracks which partner firms a lead was shared with — mirrors `opportunity_shares` pattern.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | |
| `lead_id` | text FK → leads | |
| `shared_with_firm_id` | text FK → service_firms | |
| `shared_by` | text FK → users | |
| `viewed_at` | timestamp | |
| `claimed_at` | timestamp | |

### Neo4j Representation (planned)
```cypher
(:Opportunity { id, title, painPoint, source, confidence })
  -[:GENERATED_LEAD]->(:Lead { id, title, solution, estimatedValue })
    -[:MATCHED_TO]->(:ServiceFirm)
    -[:REQUIRES_SKILL]->(:Skill)
    -[:FOR_INDUSTRY]->(:Industry)
```

---

## Referral Tracking

Referrals track business passed between partner firms, optionally linked to a partnership and/or opportunity.

### Referral Statuses
`pending` | `converted` | `lost`

### Creating Referrals
- `POST /api/referrals` with `{ firmId, receivingFirmId, partnershipId?, opportunityId?, estimatedValue? }`

### Listing Referrals
- `GET /api/referrals?firmId=xxx` -- Returns all referrals (given + received) with enriched firm names
- Includes computed `direction` field: `"given"` or `"received"`
- Includes summary stats:
  - `totalGiven`, `totalReceived`
  - `convertedGiven`, `convertedReceived`
  - `estimatedValueGiven`, `estimatedValueReceived`
  - `actualValueConverted` (sum of all converted referrals' actual values)

---

## Admin Partnership Management

### Admin List All Partnerships
- `GET /api/admin/partnerships` -- Raw SQL query returning all partnerships with firm names, limited to 200
- Requires `superadmin` role
- Returns: id, firmAName, firmBName, status, type, matchScore, matchExplanation, createdAt, acceptedAt

### Admin Partnership Stats
- `GET /api/admin/partnerships/stats` -- Aggregated counts:
  - Partnership counts by status (total, suggested, requested, accepted, declined)
  - Total referrals and converted referrals count
  - Total opportunities count
- Requires `superadmin` role

### Admin Send Intro
- `POST /api/admin/partnerships/intro` -- Queues intro email for approval (see Three-Way Introductions above)
- Requires `admin` or `superadmin` role

### Admin UI (`/admin/partnerships`)
- Full-width table of all partnerships with firm names, status badges, type, match score, date
- Pipeline visualization: suggested -> requested -> accepted (with declined count)
- Stat cards: Total Partnerships, Accepted, Referrals (converted/total), Opportunities
- Status filter tabs: all | suggested | requested | accepted | declined
- "Send Intro" button on each `requested` or `accepted` partnership row

---

## User UI (`/partnerships`)

Three-tab layout:
1. **Active** -- Accepted partnerships displayed as cards with partner firm name, type, acceptance date, match score percentage, match explanation, "View Profile" and "Share Opportunity" buttons
2. **Pending** -- Requested/suggested partnerships. Incoming requests show Accept/Decline buttons; outgoing requests show status
3. **Opportunities** -- Placeholder (empty state currently)

Referral stats bar (shown when referrals exist): Active Partners count, Referrals Given, Referrals Received, Revenue Generated (actual converted value).

---

## Key Tables

| Table | Purpose | ID Prefix |
|---|---|---|
| `partnerships` | Firm-to-firm partnership records | `ptn_` |
| `partnershipEvents` | Audit log of all partnership actions | `pev_` |
| `opportunities` | Business leads that can be shared | `opp_` |
| `opportunityShares` | Records of opportunities shared with specific firms | `osh_` |
| `referrals` | Business referrals between firms with value tracking | `ref_` |
| `emailApprovalQueue` | Queued emails (intro, follow-up, etc.) awaiting admin approval | `eq_` |

### Key Relationships
- `partnerships.firmAId` / `firmBId` -> `serviceFirms.id`
- `partnerships.initiatedBy` -> `users.id`
- `partnershipEvents.partnershipId` -> `partnerships.id` (cascade delete)
- `opportunities.firmId` -> `serviceFirms.id`
- `opportunityShares.opportunityId` -> `opportunities.id`
- `opportunityShares.sharedWithFirmId` -> `serviceFirms.id`
- `referrals.partnershipId` -> `partnerships.id` (optional)
- `referrals.opportunityId` -> `opportunities.id` (optional)
- `emailThreads.partnershipId` -> `partnerships.id` (optional, links email conversations)
- `scheduledCalls.partnershipId` -> `partnerships.id` (optional, links calls)

### Firm-Level Partnership Fields (on `serviceFirms` / `partnerPreferences` / `abstractionProfiles`)
- `serviceFirms.partnershipReadinessScore` -- Float, computed readiness metric
- `partnerPreferences.partnershipModels` -- JSONB string array of preferred models
- `abstractionProfiles.partnershipReadiness` -- JSONB with `openToPartnerships`, `preferredPartnerTypes`, `partnershipGoals`

---

## Key Files

### API Routes
| Route | File |
|---|---|
| `GET/POST /api/partnerships` | `src/app/api/partnerships/route.ts` |
| `GET/PATCH/DELETE /api/partnerships/[id]` | `src/app/api/partnerships/[id]/route.ts` |
| `POST /api/partnerships/intro` | `src/app/api/partnerships/intro/route.ts` |
| `GET/POST /api/opportunities` | `src/app/api/opportunities/route.ts` |
| `GET/PATCH /api/opportunities/[id]` | `src/app/api/opportunities/[id]/route.ts` |
| `POST /api/opportunities/share` | `src/app/api/opportunities/share/route.ts` |
| `GET/POST /api/referrals` | `src/app/api/referrals/route.ts` |
| `GET /api/admin/partnerships` | `src/app/api/admin/partnerships/route.ts` |
| `GET /api/admin/partnerships/stats` | `src/app/api/admin/partnerships/stats/route.ts` |
| `POST /api/admin/partnerships/intro` | `src/app/api/admin/partnerships/intro/route.ts` |

### UI Pages
| Page | File |
|---|---|
| User partnerships | `src/app/(app)/partnerships/page.tsx` |
| Discover (search + request) | `src/app/(app)/discover/page.tsx` |
| Admin partnerships | `src/app/(admin)/admin/partnerships/page.tsx` |

### Supporting Libraries
| File | Purpose |
|---|---|
| `src/types/partnerships.ts` | TypeScript interfaces and API input/output types |
| `src/lib/email/intro-generator.ts` | AI-powered intro email generation + HTML template |
| `src/lib/email/send-partnership-intro.ts` | Queue intro email for admin approval |
| `src/lib/ai/opportunity-extractor.ts` | AI extraction of opportunities from text |
| `src/lib/db/schema.ts` | Drizzle table definitions (lines ~412-543) |

---

## Current Status

### Built and Functional
- Full CRUD API for partnerships, opportunities, referrals
- Partnership lifecycle (suggest, request, accept, decline, deactivate) with event tracking
- Opportunity sharing with partner validation (only accepted partners)
- Referral tracking with value metrics and direction (given/received)
- Three-way intro email generation (AI-crafted, both user-initiated and admin-queued)
- Admin dashboard with pipeline visualization, stats, and intro email trigger
- User-facing partnerships page with active/pending tabs and referral stats
- Discover page integration (search -> request partnership)
- AI opportunity extraction from text content

### Skill Matching Strategy (Phase 4 — Cascading L3→L2→L1)

The COS skills taxonomy has three levels of granularity:

| Level | Count | Example | Source |
|-------|-------|---------|--------|
| L1 | 31 categories | "Information Technology", "Sales" | `data/skills-L1.csv` |
| L2 | 246 subcategories | "E-Commerce", "Artificial Intelligence and Machine Learning (AI/ML)" | `data/skills-L2-map.csv` |
| L3 | 18,420 granular skills | "Shopify Plus Migration", "TensorFlow Model Training" | `data/skills-L3-map.csv` |

#### How Skills Are Captured

**During onboarding (current — via Ossy prompt):**
- Partner preferences (`desiredPartnerServices`) are stored at **L2 level**
- Ossy maps natural language to specific L2 categories using a curated reference list in `src/lib/ai/ossy-prompt.ts`
- Example: user says "AI" → mapped to "Artificial Intelligence and Machine Learning (AI/ML)", NOT the broad L1 "Information Technology"
- Example: user says "ecommerce" → mapped to "E-Commerce", NOT the broad L1 "Sales"

**From case studies and projects (future — ground truth):**
- When firms add case studies, project details, or we scrape their portfolio pages, extract **L3 skills**
- L3 skills represent what firms have **actually done** — this is the ground truth principle
- A firm that delivered "Shopify Plus Migration" is demonstrably stronger than one that just lists "E-Commerce"
- L3 extraction should use the AI classification pipeline (Gemini Flash) against the 18,420 L3 skill entries

#### Cascading Search Strategy for Partner Matchmaking

When searching for partner matches, use a **cascading approach** — start specific, broaden only if needed:

```
1. L3 Match (most specific, highest confidence)
   ↓ If insufficient results...
2. L2 Match (category-level, good general match)
   ↓ If still insufficient...
3. L1 Match (broadest, last resort)
```

**L3 first:** Match the user's stated needs against L3 skills extracted from case studies. These are evidence-backed — the firm demonstrably has this capability. Highest match quality.

**L2 fallback:** If L3 matches are sparse (not enough case studies in the system yet, or the user's need is broad), fall back to L2 category matching against partner profiles and stated capabilities.

**L1 last resort:** Only use L1 for very general exploration ("show me tech firms") or when both L3 and L2 produce too few results.

#### Scoring Implications

- **L3 match** = high confidence → boost match score (e.g., +0.3)
- **L2 match** = moderate confidence → standard match score
- **L1 match** = low confidence → lower match score, flag as "broad match"
- Multiple L3 matches across different case studies = even higher confidence (proven pattern, not one-off)

#### Implementation Path

1. **Load L1/L2/L3 CSVs into Neo4j** as a hierarchical skill graph: `(:L1Category)-[:HAS_SUBCATEGORY]->(:L2Skill)-[:HAS_SKILL]->(:L3Skill)`
2. **Build a skill normalizer** that maps free-text input to the closest L3 (or L2/L1) match
3. **Enrich case studies** with L3 skill tags during ingestion (AI classification)
4. **Cascading search query**: Cypher query that tries L3 match first, counts results, falls back to L2 if needed
5. **Search & matching engine** (Phase 4) uses this cascade to rank partner recommendations
6. **Ossy search tools** (`search_partners`, `search_experts`, `search_case_studies`) use the same cascade

#### Key Decision: L2 for Preferences, L3 for Evidence

- **Onboarding preferences** stay at L2 — asking users to pick from 18,420 L3 skills is impractical
- **Case study extraction** targets L3 — the system should be specific about what evidence it found
- **Search queries** start at L3 (evidence) and widen to L2 (preferences) as needed
- This creates a natural quality gradient: firms with more case studies get better matches because they have more L3 evidence

### Not Yet Built / Gaps
- Opportunities tab in user UI is a placeholder (empty state only)
- No dedicated opportunity detail page for users
- No auto-creation of opportunities from calls/emails (extractor exists but no pipeline integration)
- No notification system for partnership requests or opportunity shares
- No claim/view tracking UI for shared opportunities
- Referral status updates (pending -> converted/lost) have no dedicated UI
- `matchScore` and `matchExplanation` depend on matching engine which is in progress (Phase 4)
- No partnership chat/messaging feature (event type exists but no implementation)
