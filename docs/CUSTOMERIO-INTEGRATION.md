# Customer.io Integration Plan

> Status: **Phase 1 live** — notification preference management via App API
> Connected account: production (e241efc9a7822ecf8857)
> Full plan: multi-phase rollout documented below

---

## ⚠️ Critical Safety Rule

**This is a live production Customer.io account with real subscribers.**

We have **two separate API surfaces** — they must never be confused:

| API | Base URL | What it does | Safe to use? |
|-----|----------|-------------|--------------|
| **App API** | `api.customer.io/v1` | Data management — read/write customer attributes, segments, subscription prefs | ✅ Yes — data only, no message triggers |
| **Track API** | `track.customer.io/api/v1` | Event tracking — fires campaign workflows | ❌ Never — triggers live emails to real users |
| **Pipelines API** | `cdp.customer.io/v1` | Same risk as Track API | ❌ Never without explicit sign-off |

**All code in this repo must only call `api.customer.io`.** The tracking keys are stored in `.env.local` as comments only and must never appear in any server-side code path.

---

## Credentials (env vars)

```bash
CUSTOMERIO_APP_API_KEY=         # App API — safe for data reads/writes
CUSTOMERIO_WEBHOOK_SIGNING_KEY= # For verifying inbound webhooks from Customer.io
# Stored as reference only — DO NOT USE IN CODE:
# CUSTOMERIO_TRACKING_SITE_ID=
# CUSTOMERIO_TRACKING_API_KEY=
```

---

## Phase 1 — Notification Preferences (Live)

**What's built:**
- `src/lib/customerio.ts` — App API client with safety-first design
- `GET /api/settings/notifications` — reads user's preferences from Customer.io by email
- `PATCH /api/settings/notifications` — updates specific preference attributes
- `/settings/notifications` — real toggles wired to live Customer.io data

**How preferences are stored:**
We use customer attributes (not subscription topics) for simplicity and safety:

| Toggle | Customer.io attribute |
|--------|----------------------|
| New match alerts | `pref_new_matches` |
| Partnership updates | `pref_partnership_updates` |
| Weekly digest | `pref_weekly_digest` |
| Product updates | `pref_product_updates` |

These are plain boolean attributes. Campaigns in Customer.io should filter on these attributes rather than using subscription topics (for now).

**Behaviour when user doesn't exist in Customer.io yet:**
- Preferences are shown as all-on (defaults)
- Updates are skipped silently (`no_cio_record` response)
- This prevents accidentally creating new customer records that could trigger onboarding workflows

---

## Phase 1b — Communications History in Admin (Live)

**What's built:**
- `GET /api/admin/customers/[orgId]/communications` — fetches Customer.io message history for all org members
- New "Communications" tab on the admin customer detail page
- Shows subject, recipient, status (queued/sent/delivered/opened/failed), and sent time
- Status derived from `metrics` timestamps in the message object

**How it works:**
1. Looks up each org member's `cio_id` via `GET /v1/customers?email=...`
2. Calls `GET /v1/customers/{cio_id}/messages` for each CIO customer found (parallel)
3. Merges all messages, sorted newest-first, capped at 200 total

---

## Phase 1c — Email Template Designs (Ready to import)

Five COS-branded email templates have been designed in `docs/email-templates/`. These follow COS
design principles: dark midnight header, electric blue CTAs, clean white body, Liquid variables.

**Templates:**
| File | Customer.io name | Status |
|------|-----------------|--------|
| `welcome.html` | `[COS CONCEPT] Welcome to Collective OS` | Ready to paste |
| `new-match.html` | `[COS CONCEPT] New Match Alert` | Ready to paste |
| `partnership-request.html` | `[COS CONCEPT] Partnership Request` | Ready to paste |
| `partnership-accepted.html` | `[COS CONCEPT] Partnership Accepted` | Ready to paste |
| `weekly-digest.html` | `[COS CONCEPT] Weekly Digest` | Ready to paste |

**API limitation note:** Customer.io's App API does not expose template creation endpoints
(`POST /v1/transactional` returns 404). Templates must be created manually in the Customer.io UI:
> Journeys → Content → Transactional Messages → New → paste HTML → set queue_drafts = true

**DO NOT connect a trigger** to any `[COS CONCEPT]` template until the account owner has reviewed it
and explicitly approved the send criteria.

---

## Phase 2 — Subscription Topics (Planned)

Customer.io has a native **Subscription Topics** system that is more structured than raw attributes. When ready:

1. Configure topics in Customer.io workspace settings:
   - `match_alerts` — new match notifications
   - `partnership_updates` — partnership activity
   - `weekly_digest` — weekly roundup
   - `product_updates` — feature announcements

2. Update `customerio.ts` to use subscription preferences endpoint:
   - `GET /v1/customers/{id}/subscription_preferences?id_type=email`
   - `PUT /v1/customers/{id}/subscription_preferences` (partial update supported as of 2023-04)

3. Update notification page to show topic names from API rather than hardcoded list

4. Update all campaign sends to filter by topic subscription rather than attribute

---

## Phase 3 — Segment Management (Planned)

Use the App API to manage which Customer.io segments users belong to. This is how we control which campaigns they receive — by adding/removing them from segments based on plan, activity, and feature flags.

**Planned segments:**
- `free_plan` / `pro_plan` / `enterprise_plan`
- `active_last_7d` / `inactive_30d` / `inactive_60d`
- `has_partners` / `no_partners_yet`
- `scan_network_connected` (Gmail or Outlook connected)
- `onboarding_complete` / `onboarding_incomplete`

**API:**
- `GET /v1/segments` — list segments
- `POST /v1/segments/{id}/membership` — add customers to segment
- `DELETE /v1/segments/{id}/membership` — remove from segment

**Trigger points** (where COS code would update segment membership):
- User plan changes (webhook handler already exists) → update plan segment
- User last seen (session activity hook) → update activity segment
- Scan My Network connects → add to `scan_network_connected`
- First partnership created → move to `has_partners`

---

## Phase 4 — Transactional Email Integration (Planned)

Currently: transactional emails (partner intros, opportunity alerts, invites) go via Resend.

When ready to migrate to Customer.io for unified email management:

1. Map each email type to a Customer.io transactional message template
2. Build a `sendTransactional(email, templateId, data)` helper that:
   - Calls `POST /v1/send/email` on the App API (transactional sends — safe, not campaign-based)
   - Respects the user's notification preferences (checks attributes before sending)
3. Migrate existing Resend calls one-by-one with explicit sign-off on each

**Note:** This phase requires careful coordination — Customer.io transactional sends via the App API do NOT trigger campaigns, but they do send real emails to real people. Every template needs review before activating.

---

## Phase 5 — Inbound Webhooks (Planned)

Customer.io can send webhooks to us when certain events happen:
- Email opened / clicked
- Email bounced / unsubscribed
- Customer unsubscribed from a topic

**Webhook endpoint:** `POST /api/webhooks/customerio`

**Verification:** `CUSTOMERIO_WEBHOOK_SIGNING_KEY` — HMAC-SHA256 signature on the raw body

**Use cases:**
- Sync unsubscribes back to our notification preferences in real time
- Track email engagement for "activity" segment placement
- Alert when key users unsubscribe (flag in admin panel)

---

## Phase 6 — Full Customer Lifecycle (Future)

Longer-term vision:

- **Welcome sequence** — triggered when org is created (safe: uses onboarding campaign with delays)
- **Activation nudges** — "You haven't scanned your network yet" after day 3
- **Upgrade triggers** — when user hits their plan limit, Customer.io sends upgrade email
- **Churn prevention** — 30-day inactive users get a re-engagement sequence
- **Partnership milestones** — "Congrats on your first partnership!" triggered from webhook

All of these require the Track API (or Pipelines API) to be activated. **This must only happen after:**
1. All existing campaign workflows have been audited and paused/confirmed
2. A staging/test Customer.io workspace is available for testing
3. Explicit sign-off on each event type before enabling

---

## Current File Structure

```
src/
├── lib/
│   └── customerio.ts                        # App API client (Phase 1 live)
│                                            # - getCioCustomerByEmail(email)
│                                            # - getNotificationPreferences(email)
│                                            # - updateNotificationPreferences(email, prefs)
│                                            # - getCioMessages(cioId)
├── app/
│   ├── (app)/settings/notifications/
│   │   └── page.tsx                         # Notification preference toggles
│   ├── (admin)/admin/customers/[orgId]/
│   │   └── page.tsx                         # "Communications" tab added
│   └── api/
│       ├── settings/notifications/
│       │   └── route.ts                     # GET + PATCH preferences
│       ├── admin/customers/[orgId]/
│       │   └── communications/
│       │       └── route.ts                 # GET message history for org members
│       └── webhooks/
│           └── customerio/                  # Phase 5 — not yet built
│               └── route.ts
docs/
└── email-templates/
    ├── README.md                            # Instructions + design system
    ├── welcome.html                         # [COS CONCEPT] Welcome to Collective OS
    ├── new-match.html                       # [COS CONCEPT] New Match Alert
    ├── partnership-request.html             # [COS CONCEPT] Partnership Request
    ├── partnership-accepted.html            # [COS CONCEPT] Partnership Accepted
    └── weekly-digest.html                   # [COS CONCEPT] Weekly Digest
```

---

## Notes for Future Devs

- **Do not add `CUSTOMERIO_TRACKING_SITE_ID` or `CUSTOMERIO_TRACKING_API_KEY` to any code file.** These are in `.env.local` as comments only.
- All Customer.io API calls must go through `src/lib/customerio.ts` — never call `track.customer.io` directly from a route.
- When adding a new API call, document here which phase it belongs to and confirm it uses the App API.
- Before Phase 4 (transactional) or Phase 6 (lifecycle), get explicit confirmation from the account owner that existing campaigns have been audited.
