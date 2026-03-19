# 9. Email System

> Last updated: 2026-03-19

Ossy sends and receives email at `ossy@joincollectiveos.com` via **Resend**. All outbound emails pass through an approval queue system. Inbound emails are processed by AI for intent classification, entity extraction, and automated response drafting.

---

## Architecture Overview

```
Inbound:
  External sender → ossy@joincollectiveos.com
    → Resend MX inbound webhook → POST /api/webhook/email/inbound
    → Store emailMessage + create/update emailThread
    → Inngest: email/process-inbound
      → Classify intent (AI)
      → Extract entities + store to memoryEntries
      → Create opportunity if detected
      → Generate Ossy reply draft
      → Queue in emailApprovalQueue (pending or auto_approved)

Outbound:
  emailApprovalQueue entry (pending)
    → Admin approves via /admin/email or user approves via /email/queue
    → Inngest: email/send-now → sendEmail() via Resend API
    → Store outbound emailMessage
```

### Key Files

| Area | File |
|------|------|
| Email client (Resend wrapper) | `src/lib/email/email-client.ts` |
| Intent classifier | `src/lib/ai/email-intent-classifier.ts` |
| Intro email generator (AI) | `src/lib/email/intro-generator.ts` |
| Partnership intro queuer | `src/lib/email/send-partnership-intro.ts` |
| Email validation (corporate check) | `src/lib/email-validation.ts` |
| **Templates** | |
| Coaching report | `src/lib/email/templates/coaching-report.ts` |
| Follow-up reminder | `src/lib/email/templates/follow-up-reminder.ts` |
| Weekly digest | `src/lib/email/templates/weekly-digest.ts` |
| Intro email (static) | `src/lib/email/templates/intro-email.ts` |
| **Inngest Functions** | |
| Process inbound email | `src/inngest/functions/process-inbound-email.ts` |
| Send approved email | `src/inngest/functions/send-approved-email.ts` |
| Follow-up reminders | `src/inngest/functions/follow-up-reminders.ts` |
| Weekly digest | `src/inngest/functions/weekly-digest.ts` |
| **API Routes** | |
| Inbound webhook (primary) | `src/app/api/webhook/email/inbound/route.ts` |
| Inbound webhook (legacy) | `src/app/api/webhooks/email/route.ts` |
| User approval queue | `src/app/api/email/queue/route.ts` |
| Admin queue list | `src/app/api/admin/email/queue/route.ts` |
| Admin approve | `src/app/api/admin/email/queue/[id]/approve/route.ts` |
| Admin reject | `src/app/api/admin/email/queue/[id]/reject/route.ts` |
| Admin edit draft | `src/app/api/admin/email/queue/[id]/route.ts` |
| Admin trigger intro | `src/app/api/admin/partnerships/intro/route.ts` |
| **UI Pages** | |
| Admin email queue | `src/app/(admin)/admin/email/page.tsx` |
| Admin email settings | `src/app/(admin)/admin/email-settings/page.tsx` |
| User email queue | `src/app/(app)/email/queue/page.tsx` |

---

## Email Client (`sendEmail`)

- **Provider:** Resend (REST API at `https://api.resend.com/emails`)
- **From:** `Ossy from Collective OS <ossy@joincollectiveos.com>`
- **Supports:** `to`, `cc`, `bcc`, `subject`, `html`, `text`, `replyTo`, `tags`
- **Fallback:** If `RESEND_API_KEY` is not set, logs to console instead of sending.

### Dev Safeguard (`RESEND_DEV_OVERRIDE`)

Environment-level override that **cannot be bypassed by any code path**:

1. Set `RESEND_DEV_OVERRIDE=your@email.com` in Vercel env vars.
2. When set, ALL outbound emails redirect to that address.
3. `cc` and `bcc` are cleared.
4. Subject is prefixed with `[DEV -> original@email.com]`.
5. A yellow `DEV MODE` banner is prepended to the HTML body.

This is checked **first**, before any other safeguard.

### Test Mode (DB-level)

Applied only when `RESEND_DEV_OVERRIDE` is not set:

1. Controlled by `settings` table: `email_test_mode` = `"true"` / `"false"`.
2. When active, all recipients are replaced with the `email_test_whitelist` (comma-separated emails in `settings`).

---

## Partnership Email Auto-Send Toggles

Two platform settings control whether partnership emails send immediately or queue for review:

| Setting key | Controls | Default |
|-------------|----------|---------|
| `partnership_intro_auto_send` | Intro emails triggered from `/admin/partnerships` | `false` (queued) |
| `partnership_followup_auto_send` | Follow-up emails after transcript opportunity analysis | `false` (queued) |

### Intro email behaviour

When `partnership_intro_auto_send = "true"`:
- `queuePartnershipIntro()` generates the email via AI (Gemini Flash)
- Sends immediately via Resend to **test addresses**: `masa+{firmslug}@joincollectiveos.com` for both firms
- Queue entry is inserted with `status = "sent"` (visible in `/admin/email` as Sent tab)
- "Send Intro" button label changes to "Send Now" (⚡) to signal live mode

When `partnership_intro_auto_send = "false"`:
- Email is generated and inserted into `emailApprovalQueue` with `status = "pending"`
- Button label shows "Queue Intro" (✉️)
- Admin reviews and approves via `/admin/email`

The toggle UI lives on `/admin/partnerships` in the **Email Settings** panel. Changes are persisted immediately to the `settings` table via `POST /api/admin/settings`.
3. Subject is prefixed with `[TEST -> original@email.com]`.
4. A yellow `TEST MODE` banner is prepended to the HTML body.
5. If whitelist is empty, email is silently suppressed (returns success with `suppressed_` ID).
6. Auto-approved emails are downgraded to `pending` in test mode.

### Safeguard Hierarchy

```
RESEND_DEV_OVERRIDE (env) → checked first, overrides everything
  ↓ (not set)
email_test_mode (DB) → checked second, redirects to whitelist
  ↓ (not active)
Normal send → email goes to actual recipients
```

---

## Approval Queue System

**All outbound emails require approval** before sending. The queue has two access points:

### Admin Queue (`/admin/email`)

Three-tab interface:
- **Pending** — Emails awaiting approval (includes `auto_approved` items). Admins can preview, edit draft text, approve, or reject.
- **Sent** — History of outbound `emailMessages`.
- **Received** — History of inbound `emailMessages`.

Side drawer allows editing the plain-text draft before approving. Admin actions call:
- `POST /api/admin/email/queue/[id]/approve` — Sets status to `approved`, fires `email/send-now` Inngest event.
- `POST /api/admin/email/queue/[id]/reject` — Sets status to `rejected`.
- `PATCH /api/admin/email/queue/[id]` — Edit `bodyHtml`, `bodyText`, or `subject` before approval.

### User Queue (`/email/queue`)

Firm-scoped view for regular users. Lists their firm's pending emails. Users can approve or reject via `POST /api/email/queue` with `{ emailId, action }`. This route sends directly via `sendEmail()` (not via Inngest).

### Auto-Approval

Replies to inbound emails can be auto-approved when **all** conditions are met:
- `email_test_mode` is OFF
- Classification confidence >= 0.92 (`AUTO_SEND_THRESHOLD`)
- Intent is `follow_up` or `question` (`AUTO_SEND_INTENTS`)

When auto-approved, the entry is inserted with `status: "auto_approved"` and an `email/send-now` Inngest event is fired immediately. In test mode, auto-approved items are downgraded to `pending` by the `send-approved-email` function.

### Queue Statuses

`pending` -> `approved` -> `sent` (via admin/user approval)
`pending` -> `rejected` (admin/user rejection)
`auto_approved` -> `sent` (automatic, when not in test mode)
`auto_approved` -> `pending` (downgraded when test mode is active)

---

## Inbound Email Processing

### Webhook Endpoints

Two webhook endpoints exist:

1. **Primary: `POST /api/webhook/email/inbound`** — HMAC-SHA256 signature verification via `RESEND_WEBHOOK_SECRET`. Handles calendar invite detection (ICS parsing), creates `scheduledCalls` entries, and schedules `calls/join-meeting` Inngest events.

2. **Legacy: `POST /api/webhooks/email`** — Bearer token auth via `EMAIL_WEBHOOK_SECRET`. Simpler threading by subject match. No calendar detection.

Both endpoints:
- Parse sender, recipients, subject, body
- Resolve `firmId` by matching sender domain against `serviceFirms.website`
- Create or update `emailThreads` (threading by `inReplyTo` header or subject match)
- Store `emailMessages` with `direction: "inbound"`
- Fire `email/process-inbound` Inngest event

### Calendar Invite Detection (Primary Webhook)

Detects calendar invites by:
- Subject starting with `"Invitation:"`
- Attachments with `content_type: "text/calendar"`

Parses ICS content to extract: title, start time, meeting link (Google Meet / Zoom / Teams), attendees.
Creates a `scheduledCalls` row and schedules an Inngest `calls/join-meeting` event 2 minutes before start time.

### Intent Classification

The `email/process-inbound` Inngest function runs a multi-step pipeline:

**Step 1: Classify** — AI classifies the email into one of six intents:
- `opportunity` — Client need, project, or business opportunity
- `follow_up` — Requires follow-up action
- `context` — Useful context, no action needed
- `question` — Direct question for Ossy
- `intro_response` — Reply to a three-way intro Ossy sent
- `unrelated` — Spam or irrelevant

Uses `google/gemini-2.0-flash-001` via OpenRouter for classification. Returns structured data including entities (firm names, person names, skills, industries, values), opportunity signals, and follow-up needs.

**Step 2: Update** — Stores classification on `emailMessages` (`extractedIntent`, `extractedEntities`, `confidence`, `processedAt`) and updates thread `intent`.

**Step 3: Create opportunity** — If intent is `opportunity`, creates an `opportunities` row linked to the firm, sets thread's `opportunityId`.

**Step 4: Extract context** — For non-unrelated emails from known firms, extracts key facts and stores them as `memoryEntries` with theme `"email_intelligence"`.

**Step 5: Queue follow-up** — If classifier detects follow-up is needed, fires `email/schedule-follow-up` event.

**Step 6: Generate reply** — For intents other than `unrelated` and `intro_response`, generates a reply draft using `anthropic/claude-sonnet-4-5` via OpenRouter. Draft is crafted based on intent type (question, context, opportunity, follow_up). Replies are under 150 words in Ossy's voice.

**Step 7: Queue response** — Inserts into `emailApprovalQueue` with status based on auto-approval eligibility.

---

## Three-Way Partnership Introductions

When an admin triggers an intro for a partnership:

1. **`POST /api/admin/partnerships/intro`** — Admin-only. Takes `partnershipId`.
2. **`queuePartnershipIntro()`** — Fetches both firms and their owner contacts. Calls `generateIntroEmail()`.
3. **`generateIntroEmail()`** — Uses `google/gemini-2.0-flash-001` to generate a personalized intro email with subject, body, and 3 talking points. Builds an HTML template with firm profiles and talking points section.
4. Result is inserted into `emailApprovalQueue` with `emailType: "intro"` and `status: "pending"`. **Intro emails never auto-send.**
5. Admin reviews and approves via the email queue UI.
6. On send, `sendIntroEmail()` sends to both firm contacts and logs a `partnership_event` with type `"intro_sent"`.

### Template Variants

Two intro email template implementations exist:
- **AI-generated** (`intro-generator.ts`) — Dynamic, personalized content generated per partnership.
- **Static template** (`templates/intro-email.ts`) — Fixed HTML template with firm strengths and suggested next step. Available but not currently wired into the main flow.

---

## Follow-Up Reminders

### Thread-Based Follow-Up (`email/schedule-follow-up`)

1. Triggered by `process-inbound-email` when classifier detects follow-up is needed.
2. Waits 3 days (`step.sleep("wait-for-response", "3d")`).
3. Checks if thread is still `active` (not `resolved` or `archived`).
4. If still active, sends a follow-up email directly via `sendEmail()` (bypasses approval queue).
5. Uses `follow-up-reminder` template.

### Stale Partnership Check (Cron)

`checkStalePartnerships` runs daily at 9 AM:
- Finds partnerships in `"requested"` state for >3 days.
- Finds `"accepted"` partnerships with no activity for >14 days.
- Sends nudge emails to the receiving firm's owner for stale requests.
- Sends directly via `sendEmail()` (bypasses approval queue).

---

## Weekly Digest

`weeklyDigest` runs every Monday at 8 AM via Inngest cron:
- Iterates all `serviceFirms`.
- For each firm with activity, gathers: active partners count, referrals given/received this week, recent opportunities.
- Skips firms with zero activity.
- Sends digest email via `sendEmail()` (bypasses approval queue).
- Uses `weekly-digest` template with stats grid, partner matches, follow-ups, and opportunity updates.

---

## Coaching Report Email

Sent after post-call analysis (`post-call-analysis` Inngest function). Contains:
- Overall coaching score with color-coded badge
- Talk time ratio analysis
- Value proposition clarity score
- Question quality feedback
- Action items
- Recommended experts and case studies from the platform
- Uses COS design tokens (cos-electric, cos-signal, cos-ember, cos-warm)

For partnership calls, separate reports are sent to each firm. For client calls, sent only to the platform member.

---

## Database Tables

### `email_threads`

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | Prefix: `eth_` or `thr_` |
| `firm_id` | text FK -> serviceFirms | Required |
| `subject` | text | Normalized (Re:/Fwd: stripped) |
| `participants` | jsonb (string[]) | All email addresses |
| `partnership_id` | text FK -> partnerships | Nullable |
| `opportunity_id` | text FK -> opportunities | Set when opportunity detected |
| `status` | text | `active` / `archived` / `resolved` |
| `intent` | text | Set by classifier |
| `last_message_at` | timestamp | Updated on each message |
| `created_at` / `updated_at` | timestamp | Auto |

### `email_messages`

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | Prefix: `emg_` or `emsg_` |
| `thread_id` | text FK -> emailThreads | Cascade delete |
| `external_message_id` | text | Resend provider ID |
| `direction` | text | `inbound` / `outbound` |
| `from_email` | text | Required |
| `from_name` | text | Nullable |
| `to_emails` | jsonb (string[]) | Required |
| `cc_emails` | jsonb (string[]) | Nullable |
| `subject` | text | Required |
| `body_html` / `body_text` | text | Nullable |
| `extracted_intent` | text | AI-classified intent |
| `extracted_entities` | jsonb | `{ firmNames, personNames, skills, industries, values }` |
| `confidence` | real | 0-1 classification confidence |
| `processed_at` | timestamp | When AI processing completed |
| `created_at` | timestamp | Auto |

### `email_approval_queue`

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | Prefix: `eq_` |
| `firm_id` | text FK -> serviceFirms | Cascade delete |
| `user_id` | text FK -> users | Cascade delete |
| `email_type` | text | `intro` / `follow_up` / `opportunity_share` / `digest` / `reply` |
| `to_emails` | jsonb (string[]) | Required |
| `cc_emails` | jsonb (string[]) | Nullable |
| `subject` | text | Required |
| `body_html` | text | Required |
| `body_text` | text | Nullable |
| `context` | jsonb | `{ partnershipId?, opportunityId?, reason? }` |
| `status` | text | `pending` / `approved` / `auto_approved` / `rejected` / `sent` |
| `reviewed_by` | text FK -> users | Admin/user who reviewed |
| `reviewed_at` | timestamp | When reviewed |
| `sent_at` | timestamp | When actually sent |
| `external_message_id` | text | Resend ID after sending |
| `created_at` | timestamp | Auto |

### `settings` (email-relevant keys)

| Key | Value | Purpose |
|-----|-------|---------|
| `email_test_mode` | `"true"` / `"false"` | Toggle test mode |
| `email_test_whitelist` | Comma-separated emails | Test mode recipients |

---

## Inngest Events

| Event Name | Trigger | Function |
|------------|---------|----------|
| `email/process-inbound` | Inbound webhook receives email | `processInboundEmail` |
| `email/schedule-follow-up` | Classifier detects follow-up needed | `scheduleFollowUp` |
| `email/send-now` | Admin approves or auto-approval | `sendApprovedEmail` |
| (cron) `0 9 * * *` | Daily at 9 AM | `checkStalePartnerships` |
| (cron) `0 8 * * 1` | Monday 8 AM | `weeklyDigest` |

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `RESEND_API_KEY` | Resend API key for sending |
| `RESEND_DEV_OVERRIDE` | Dev safeguard: redirect all emails to this address |
| `RESEND_WEBHOOK_SECRET` | HMAC secret for inbound webhook signature verification |
| `EMAIL_WEBHOOK_SECRET` | Bearer token for legacy inbound webhook |
| `OPENROUTER_API_KEY` | AI models for classification and reply generation |

---

## Current Status

### Built and Functional
- Email client with dual safeguards (dev override + test mode)
- Inbound webhook with thread management and calendar detection
- AI intent classification (6 intent types)
- AI reply generation (Ossy voice)
- Approval queue with admin and user UIs
- Partnership intro generation and queuing
- Follow-up reminders (thread-based 3-day + stale partnership daily cron)
- Weekly digest email
- Coaching report email template
- Email settings admin page (test mode toggle + whitelist)

### Planned / Not Yet Implemented
- `newMatches` and `pendingFollowUps` arrays in weekly digest are empty placeholders (need matching engine integration)
- Idle accepted partnerships (>14 days) are detected by cron but no nudge email is sent for them yet
- Email preferences management page (`/settings/email`) is referenced in templates but does not exist
- No unsubscribe mechanism
- No email delivery tracking / bounce handling
- User-facing email queue (`/email/queue`) uses a separate API route that sends directly via `sendEmail()` instead of through Inngest, creating two parallel approval paths
- The `opportunities` table insert in `process-inbound-email` references an `estimatedValue` string field but no currency parsing
- Thread association with unknown senders (no firm match) is fragile -- `firmId: "unknown"` may cause FK constraint failures
