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

## Opportunity System

Opportunities represent business leads that can be shared with trusted partners.

### Opportunity Statuses (pgEnum `opportunity_status`)
| Status | Meaning |
|---|---|
| `open` | Newly created, not yet shared |
| `shared` | Has been shared with at least one partner firm |
| `claimed` | A partner firm has claimed the opportunity |
| `won` | The opportunity converted to a deal |
| `lost` | The opportunity was lost |
| `expired` | The opportunity expired without action |

### Opportunity Sources
`manual` | `call` | `email` | `ossy` -- Indicates how the opportunity was created.

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
- `src/lib/ai/opportunity-extractor.ts` scans text (call transcripts, emails, chat messages) for opportunity signals
- Detects phrases like: "We need help with...", "Our client needs...", "We don't do [service]..."
- Returns structured opportunities with confidence scores (threshold: >= 0.5)
- Model: `google/gemini-2.0-flash-001` via OpenRouter

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

### Not Yet Built / Gaps
- Opportunities tab in user UI is a placeholder (empty state only)
- No dedicated opportunity detail page for users
- No auto-creation of opportunities from calls/emails (extractor exists but no pipeline integration)
- No notification system for partnership requests or opportunity shares
- No claim/view tracking UI for shared opportunities
- Referral status updates (pending -> converted/lost) have no dedicated UI
- `matchScore` and `matchExplanation` depend on matching engine which is in progress (Phase 4)
- No partnership chat/messaging feature (event type exists but no implementation)
