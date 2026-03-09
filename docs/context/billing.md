# 10. Billing & Subscriptions

> Last updated: 2026-03-09

## Overview

Stripe-backed subscription billing with three tiers (Free, Pro, Enterprise). Every organization gets a free subscription row on creation. Upgrades flow through Stripe Checkout; plan changes sync back via webhooks. Feature access is enforced server-side via a gate module that checks both boolean features and metered usage quotas.

## Stripe Integration

### Client Setup

- **File:** `src/lib/stripe.ts`
- Singleton `getStripe()` returns a `Stripe` instance using `STRIPE_SECRET_KEY`.
- API version: `2026-02-25.clover`.
- `STRIPE_PRICES` maps plan + interval to env-var price IDs:
  - `STRIPE_PRO_MONTHLY_PRICE_ID`, `STRIPE_PRO_YEARLY_PRICE_ID`
  - `STRIPE_ENTERPRISE_MONTHLY_PRICE_ID`, `STRIPE_ENTERPRISE_YEARLY_PRICE_ID`

### Required Environment Variables

| Variable | Purpose |
|---|---|
| `STRIPE_SECRET_KEY` | Server-side Stripe SDK key |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature verification |
| `STRIPE_PRO_MONTHLY_PRICE_ID` | Pro monthly price ID |
| `STRIPE_PRO_YEARLY_PRICE_ID` | Pro yearly price ID |
| `STRIPE_ENTERPRISE_MONTHLY_PRICE_ID` | Enterprise monthly price ID |
| `STRIPE_ENTERPRISE_YEARLY_PRICE_ID` | Enterprise yearly price ID |

## Subscription Plans

**File:** `src/lib/billing/plan-limits.ts`

| Feature | Free ($0/mo) | Pro ($199/mo) | Enterprise (custom) |
|---|---|---|---|
| Tagline | Explore the Network | Harness the Network | Custom Solutions |
| Seats (`members`) | 1 | 3 | Unlimited |
| Potential matches/week | 5 | 12 | Unlimited |
| AI Perfect Matches/month | 1 (trial) | 2 | Unlimited |
| Opportunity responses/month | 0 | 3 | Unlimited |
| Unlimited messaging | No | Yes | Yes |
| Search the network | No | Yes | Yes |
| Enhanced profile | No | Yes | Yes |
| Call intelligence | No | Yes | Yes |
| Email agent | No | No | Yes |
| Data export | No | Yes | Yes |

Type: `PlanId = "free" | "pro" | "enterprise"`

Yearly pricing is TBD (set to `null`). Enterprise has custom pricing (contact us).

## Feature Gate System

**File:** `src/lib/billing/gate.ts`

Two guard functions that throw `FeatureGateError` if access is denied:

### `requireFeature(organizationId, feature)` -- Boolean Features

Checks on/off features: `canSearchNetwork`, `enhancedProfile`, `unlimitedMessaging`, `canAccessCallIntelligence`, `canAccessEmailAgent`, `canExportData`.

Throws with `code: "feature_gated:<feature>"` and `requiredPlan` (defaults to `"pro"`, except `canAccessEmailAgent` which requires `"enterprise"`).

### `requireUsage(organizationId, feature)` -- Metered Features

Checks remaining quota for: `potentialMatches` (weekly), `aiPerfectMatches` (monthly), `opportunityResponses` (monthly).

Throws with `code: "usage_limit:<feature>"` when the org has reached or exceeded its limit. `requiredPlan` suggests the next tier up.

### `FeatureGateError`

```ts
class FeatureGateError extends Error {
  code: string;        // e.g. "feature_gated:canSearchNetwork"
  requiredPlan: string; // "pro" or "enterprise"
}
```

### Client-Side Hook: `usePlan()`

**File:** `src/hooks/use-plan.ts`

React hook that fetches `/api/billing/usage` for the active organization. Returns:
- `plan` -- current `PlanId`
- `limits` -- full `PlanLimits` object for the plan
- `usage` -- `{ matchesThisWeek, aiPerfectMatches, opportunityResponses }`
- `remaining` -- computed remaining quota for each metered feature
- `isLoading`, `error`
- `canUse(feature)` -- checks if a boolean feature is true or a numeric limit is > 0
- `refresh()` -- re-fetches usage data

## Usage Checking

**File:** `src/lib/billing/usage-checker.ts`

Queries the `ai_usage_log` table to count usage:

| Function | Counts | Period | Feature filter |
|---|---|---|---|
| `getMatchesThisWeek(orgId)` | Matching events | Current week (Mon-Sun UTC) | `feature = "matching"` |
| `getAiPerfectMatchesThisMonth(orgId)` | AI perfect match events | Current calendar month (UTC) | `feature = "ai_perfect_match"` |
| `getOpportunityResponsesThisMonth(orgId)` | Opportunity responses | Current calendar month (UTC) | `feature = "opportunity_response"` |
| `getOrgPlan(orgId)` | Looks up plan from `subscriptions` table | -- | -- |
| `getOrgUsage(orgId)` | Full snapshot: plan + limits + usage + remaining | -- | -- |

Week starts on Monday (UTC). Month starts on the 1st (UTC).

## Auto-Creation of Free Subscriptions

**File:** `src/lib/billing/create-free-subscription.ts`

Called from Better Auth's `organization.afterCreate` hook in `src/lib/auth.ts`.

When a new organization is created:
1. Inserts a `subscriptions` row with `plan: "free"`, `status: "active"`.
2. Sets `stripeCustomerId` to `"pending_<orgId>"` (no real Stripe customer yet).
3. Uses `onConflictDoNothing` to be idempotent.

A real Stripe customer is created lazily on first checkout attempt (in the checkout route).

## API Routes

### `POST /api/stripe/checkout`
**File:** `src/app/api/stripe/checkout/route.ts`

Creates a Stripe Checkout Session for plan upgrades. Requires auth session.

- Body: `{ organizationId, plan: "pro" | "enterprise", interval: "monthly" | "yearly" }`
- Looks up or creates a Stripe customer for the org.
- Returns `{ url }` -- redirect URL to Stripe Checkout.
- Success/cancel URLs point to `/settings/billing`.
- Metadata on session: `{ organizationId, plan }` (used by webhook to link back).

### `POST /api/stripe/portal`
**File:** `src/app/api/stripe/portal/route.ts`

Creates a Stripe Customer Portal session for managing existing billing. Requires auth session.

- Body: `{ organizationId }`
- Returns `{ url }` -- redirect URL to Stripe billing portal.
- Returns 404 if no `stripeCustomerId` exists for the org.

### `GET /api/billing/usage?organizationId=xxx`
**File:** `src/app/api/billing/usage/route.ts`

Returns the full usage snapshot for an org (plan, limits, usage counts, remaining).

## Webhook Handling

**File:** `src/app/api/webhooks/stripe/route.ts`
**Endpoint:** `POST /api/webhooks/stripe`

Verifies Stripe signature, logs every event to `subscription_events`, then processes:

| Event | Action |
|---|---|
| `checkout.session.completed` | Upserts `subscriptions` row -- sets `stripeCustomerId`, `stripeSubscriptionId`, `stripePriceId`, `plan`, `status`, period dates. Uses `onConflictDoUpdate` on `organizationId`. |
| `customer.subscription.updated` | Calls `syncSubscription()` -- determines plan from price ID via env vars, updates `subscriptions` row matched by `stripeSubscriptionId`. |
| `customer.subscription.deleted` | Reverts to `plan: "free"`, `status: "canceled"`, clears Stripe IDs. |
| `invoice.payment_failed` | Sets `status: "past_due"`. |
| `invoice.paid` | Sets `status: "active"`. |

After processing, marks the `subscription_events` row with `processedAt` timestamp.

Duplicate events are caught by the `stripeEventId` unique constraint -- silently returns `{ received: true }`.

## Billing UI

**File:** `src/app/(app)/settings/billing/page.tsx`

Client component showing:
- Current plan name and usage meters (matches/week, AI matches/month, opportunity responses/month).
- "Manage Billing" button (Stripe Portal) for paid plans.
- 3-column plan comparison grid (Free / Pro / Enterprise) with feature lists.
- Upgrade buttons that POST to `/api/stripe/checkout`.
- Enterprise card links to `joincollectiveos.com/contact`.

## Key Database Tables

### `subscriptions`
One row per org (unique on `organization_id`). Cascades on org delete.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | UUID |
| `organization_id` | text, unique, FK | References `organizations.id` |
| `stripe_customer_id` | text, not null | `"pending_<orgId>"` for free orgs |
| `stripe_subscription_id` | text, unique | null for free orgs |
| `stripe_price_id` | text | null for free orgs |
| `plan` | enum(`free`, `pro`, `enterprise`) | Default `free` |
| `status` | enum(`trialing`, `active`, `past_due`, `canceled`, `unpaid`, `incomplete`) | Default `active` |
| `current_period_start` | timestamp | null for free |
| `current_period_end` | timestamp | null for free |
| `cancel_at_period_end` | boolean | Default false |
| `trial_start` / `trial_end` | timestamp | Not currently used |
| `created_at` / `updated_at` | timestamp | Auto-set |

### `subscription_events`
Audit log of all Stripe webhook events.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | UUID |
| `stripe_event_id` | text, unique | Dedup key |
| `event_type` | text | e.g. `checkout.session.completed` |
| `organization_id` | text, FK | Optional, set null on org delete |
| `data` | jsonb | Raw Stripe event data object |
| `processed_at` | timestamp | Set after successful processing |
| `created_at` | timestamp | Auto-set |

### `ai_usage_log`
Tracks all AI feature usage. Used by billing usage-checker for metering.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | UUID |
| `organization_id` | text, FK | Set null on org delete |
| `user_id` | text, FK | Set null on user delete |
| `model` | text | AI model used |
| `feature` | text | `matching`, `ai_perfect_match`, `opportunity_response`, `enrichment`, `chat`, `voice`, `classification` |
| `input_tokens` / `output_tokens` | integer | Token counts |
| `cost_usd` | real | Computed cost |
| `entity_type` / `entity_id` | text | What was processed |
| `duration_ms` | integer | Processing time |
| `created_at` | timestamp | Auto-set |

## Key Files

| File | Purpose |
|---|---|
| `src/lib/stripe.ts` | Stripe client singleton + price ID mapping |
| `src/lib/billing/plan-limits.ts` | Plan definitions, limits, prices, display names |
| `src/lib/billing/gate.ts` | `requireFeature()` and `requireUsage()` guards |
| `src/lib/billing/usage-checker.ts` | Usage counting queries + `getOrgPlan()` + `getOrgUsage()` |
| `src/lib/billing/create-free-subscription.ts` | Auto-create free sub on org creation |
| `src/hooks/use-plan.ts` | Client-side `usePlan()` hook |
| `src/app/api/stripe/checkout/route.ts` | Stripe Checkout session creation |
| `src/app/api/stripe/portal/route.ts` | Stripe Customer Portal session creation |
| `src/app/api/billing/usage/route.ts` | Usage data API endpoint |
| `src/app/api/webhooks/stripe/route.ts` | Stripe webhook handler |
| `src/app/(app)/settings/billing/page.tsx` | Billing settings UI |
| `src/lib/auth.ts` | Calls `createFreeSubscription` in org `afterCreate` hook |
| `src/lib/db/schema.ts` | `subscriptions`, `subscriptionEvents`, `aiUsageLog` table definitions |

## Subscription Lifecycle

```
Org Created
    |
    v
createFreeSubscription() -- inserts plan="free", status="active", stripeCustomerId="pending_<orgId>"
    |
    v
User clicks "Upgrade" on billing page
    |
    v
POST /api/stripe/checkout -- creates/reuses Stripe customer, returns Checkout URL
    |
    v
User completes Stripe Checkout
    |
    v
Webhook: checkout.session.completed -- upserts subscriptions row with real Stripe IDs + plan
    |
    v
Active paid subscription
    |
    +-- Webhook: customer.subscription.updated -- syncs plan/status/period changes
    +-- Webhook: invoice.paid -- sets status="active"
    +-- Webhook: invoice.payment_failed -- sets status="past_due"
    +-- Webhook: customer.subscription.deleted -- reverts to plan="free", status="canceled"
```

## Usage in Application Code

### Server-Side Gating (API routes, server actions)
```ts
import { requireFeature, requireUsage } from "@/lib/billing/gate";

// Boolean feature check
await requireFeature(orgId, "canSearchNetwork"); // throws FeatureGateError if not allowed

// Metered usage check
await requireUsage(orgId, "potentialMatches"); // throws if weekly limit reached
```

### Client-Side Plan Info (React components)
```ts
import { usePlan } from "@/hooks/use-plan";

const { plan, limits, usage, remaining, canUse, isLoading } = usePlan();

if (canUse("canSearchNetwork")) { /* show search UI */ }
```
