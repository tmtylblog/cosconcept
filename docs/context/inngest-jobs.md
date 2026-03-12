# 15. Background Jobs (Postgres Queue — Inngest Replaced)

> Last updated: 2026-03-11

## Overview

**Inngest has been replaced** with a self-hosted Postgres-backed job queue. All background/async processing now uses `background_jobs` table in Neon via Drizzle.

**Key files:**
- `src/lib/jobs/queue.ts` — `enqueue()`, `claimNextJob()`, `markDone()`, `markFailed()`, `resetStuckJobs()`, `jobQueueStats()`
- `src/lib/jobs/runner.ts` — `runNextJob()`, `drainQueue()`
- `src/lib/jobs/registry.ts` — lazy handler map for all 14 job types
- `src/lib/jobs/handlers/*.ts` — individual job handlers
- `src/app/api/jobs/worker/route.ts` — worker endpoint (POST, maxDuration=300)
- `src/app/api/jobs/cron/route.ts` — cron endpoint (GET, every 2 min via Vercel Cron)
- `vercel.json` — `{ "crons": [{ "path": "/api/jobs/cron", "schedule": "*/2 * * * *" }] }`

**Old Inngest files** (`src/inngest/`) are still present but unused by API routes.

## Environment Variables Required

| Var | Purpose |
|-----|---------|
| `JOBS_SECRET` | Bearer token for `/api/jobs/worker` |
| `CRON_SECRET` | Auto-sent by Vercel Cron to `/api/jobs/cron` |

## How Jobs Are Triggered

1. API route calls `enqueue(type, payload)` — fast DB write
2. API route calls `after(runNextJob().catch(() => {}))` — runs job after response sent
3. Vercel Cron hits `/api/jobs/cron` every 2 minutes as safety net (calls `drainQueue(5)`)
4. Cron also enqueues recurring jobs by UTC time check (weekly-recrawl, weekly-digest, check-stale-partnerships)

## Atomic Job Claiming (CAS)

Neon HTTP driver doesn't support `FOR UPDATE SKIP LOCKED`. Uses compare-and-swap:
1. SELECT one pending job with `runAt <= now()`
2. UPDATE WHERE `status = 'pending' AND id = candidate.id`
3. If 0 rows updated → race lost, recurse once

## Job Types (14 total)

---

## Registered Functions (14 total)

All 14 functions are registered in the serve handler at `/api/inngest`.

### 1. `enrich-deep-crawl` -- Deep Website Crawl

| Property | Value |
|---|---|
| **File** | `src/inngest/functions/deep-crawl.ts` |
| **Event** | `enrich/deep-crawl` |
| **Retries** | 2 |
| **Concurrency** | 5 |
| **Durable** | Yes (6 steps) |
| **Status** | Working |

**Purpose:** Full enrichment pipeline for a firm's website. Entry point for firm onboarding.

**Steps:**
1. `deep-crawl` -- Sitemap discovery + page scraping + AI page classification
2. `pdl-enrich` -- PeopleDataLabs company enrichment (industry, size, employee count)
3. `ai-classify` -- AI classification against COS taxonomy (categories, skills, industries)
4. `graph-write` -- Write firm node + relationships to Neo4j
5. `queue-case-studies` -- Fan-out: sends up to 25 `enrich/case-study-ingest` events
6. `queue-expert-enrichment` -- Fan-out: sends up to 20 `enrich/expert-linkedin` events

**Input:** `{ firmId, organizationId, website, firmName }`
**Output:** Crawl stats, extracted counts, classification summary, graph write result, queued counts.

**Triggered by:**
- `POST /api/enrich/deep-crawl` (admin or auto on signup)
- `weeklyRecrawl` cron function
- Manual admin action

**Triggers downstream:**
- `enrich/case-study-ingest` (up to 25 per firm)
- `enrich/expert-linkedin` (up to 20 per firm)

---

### 2. `enrich-case-study-ingest` -- Case Study Ingestion

| Property | Value |
|---|---|
| **File** | `src/inngest/functions/case-study-ingest.ts` |
| **Event** | `enrich/case-study-ingest` |
| **Retries** | 2 |
| **Concurrency** | 3 |
| **Durable** | Yes (2 steps) |
| **Status** | Working |

**Purpose:** Processes a single case study from URL, PDF text, or raw text. Extracts structured COS analysis via AI, then writes to Neo4j.

**Steps:**
1. `ingest-and-extract` -- Multi-format ingestion + AI extraction (title, challenge, solution, skills, industries, outcomes)
2. `graph-write` -- Write case study node to Neo4j with skill/industry/outcome relationships

**Input:** `{ firmId, caseStudyUrl, sourceType, rawText?, filename? }`
**Output:** Status, title, client, skill/service/metric counts, confidence, graph result.

**Triggered by:**
- `deepCrawl` function (fan-out for discovered case study URLs)
- `POST /api/enrich/case-study` (manual admin/user trigger)

---

### 3. `enrich-firm-case-study-ingest` -- Firm Case Study Ingestion + Analysis

| Property | Value |
|---|---|
| **File** | `src/inngest/functions/firm-case-study-ingest.ts` |
| **Event** | `enrich/firm-case-study-ingest` |
| **Retries** | 2 |
| **Concurrency** | 3 |
| **Durable** | Yes (8 steps) |
| **Status** | Working |

**Purpose:** Full user-facing case study pipeline. Unlike `case-study-ingest`, this manages the `firmCaseStudies` DB table lifecycle (status tracking, visible/hidden layers, abstraction profiles).

**Steps:**
1. `set-ingesting` -- Update `firmCaseStudies.status` to "ingesting"
2. `ingest-and-extract` -- Multi-format content ingestion
3. `mark-not-case-study` -- If validation fails, set status "failed" with user-friendly message
4. `generate-summary` -- AI visible layer (summary + auto-tags)
5. `generate-abstraction` -- AI hidden layer (capability proof, partnership signals, referral profile)
6. `graph-write` -- Write to Neo4j
7. `upsert-abstraction` -- Upsert `abstractionProfiles` row
8. `finalize` -- Update `firmCaseStudies` row with all results, set status "active"

**Input:** `{ caseStudyId, firmId, organizationId, sourceUrl, sourceType, rawText?, filename? }`
**Output:** Case study ID, status, title, summary, tags, evidence strength, graph result.

**Triggered by:**
- `POST /api/firm/case-studies` (user submits case study via firm dashboard)

---

### 4. `enrich-expert-linkedin` -- Expert LinkedIn Enrichment

| Property | Value |
|---|---|
| **File** | `src/inngest/functions/expert-linkedin.ts` |
| **Event** | `enrich/expert-linkedin` |
| **Retries** | 2 |
| **Concurrency** | 5 |
| **Durable** | Yes (4 steps) |
| **Status** | Working |

**Purpose:** Full expert enrichment pipeline. Looks up person via PDL, generates AI specialist profiles, writes to both PostgreSQL and Neo4j.

**Steps:**
1. `pdl-enrich` -- PeopleDataLabs person lookup (work history, skills, education)
2. `generate-specialist-profiles` -- AI analysis producing specialist profiles with niche expertise
3. `pg-write` -- Upsert `expertProfiles` + insert `specialistProfiles` + `specialistProfileExamples` in PostgreSQL
4. `graph-write` -- Write expert node + searchable specialist profiles to Neo4j

**Input:** `{ expertId, firmId, fullName, linkedinUrl?, companyName?, companyWebsite?, importedContactId? }`
**Output:** Expert details, division, specialist profile titles, skill/industry/experience counts, PG + graph results.

**Triggered by:**
- `deepCrawl` function (fan-out for discovered team members)
- `POST /api/enrich/expert` (manual trigger)

---

### 5. `graph-sync-firm` -- Sync Firm to Graph

| Property | Value |
|---|---|
| **File** | `src/inngest/functions/graph-sync.ts` |
| **Event** | `graph/sync-firm` |
| **Retries** | 3 |
| **Concurrency** | None set |
| **Durable** | Yes (1 step) |
| **Status** | Incomplete |

**Purpose:** Standalone graph sync for a firm. Calls `writeFirmToGraph` to upsert the firm's Neo4j node. Intended to be triggered after enrichment data updates, but currently no code sends this event automatically.

**Input:** `{ firmId, organizationId, firmName, website? }`
**Output:** `{ firmId, result }`

**Known gap:** No automated triggers exist. The deep-crawl function writes to the graph directly in its own step rather than dispatching this event. This function exists for manual/future use but is effectively orphaned.

---

### 6. `memory-extract` -- Extract Conversation Memories

| Property | Value |
|---|---|
| **File** | `src/inngest/functions/extract-memories.ts` |
| **Event** | `memory/extract` |
| **Retries** | 1 |
| **Concurrency** | 10 |
| **Durable** | Yes (1 step) |
| **Status** | Working |

**Purpose:** Extracts persistent memories from Ossy chat conversations using AI (Gemini Flash). Stores key facts, preferences, and context into `memoryEntries` table organized by 8 themes.

**Input:** `{ conversationId, userId, organizationId? }`
**Output:** `{ conversationId, memoriesExtracted, themes[] }`

**Implementation:** Delegates to `src/lib/ai/memory-extractor.ts` which fetches conversation messages, runs Gemini structured extraction, stores results, and updates theme summaries.

---

### 7. `cron-weekly-recrawl` -- Weekly Website Recrawl

| Property | Value |
|---|---|
| **File** | `src/inngest/functions/weekly-recrawl.ts` |
| **Event** | Cron: `0 2 * * 0` (Sunday 2:00 AM UTC) |
| **Retries** | None set (default) |
| **Concurrency** | None set |
| **Durable** | Yes (2 steps) |
| **Status** | Working |

**Purpose:** Weekly cron job that queries all firms with websites from `serviceFirms` table, then fans out `enrich/deep-crawl` events for each one. Keeps firm data fresh.

**Steps:**
1. `get-firms` -- Query all firms with non-null website
2. `queue-crawls` -- Send `enrich/deep-crawl` event for each firm

**Input:** None (cron-triggered, empty data)
**Output:** `{ firmsFound, crawlsQueued }`

**Triggers downstream:** `enrich/deep-crawl` (one per firm with a website)

---

### 8. `calls-analyze` -- Post-Call Analysis

| Property | Value |
|---|---|
| **File** | `src/inngest/functions/post-call-analysis.ts` |
| **Event** | `calls/analyze` |
| **Retries** | 1 |
| **Concurrency** | 5 |
| **Durable** | Yes (6 steps) |
| **Status** | Working |

**Purpose:** Full post-call analysis pipeline. Extracts opportunities, runs coaching analysis, creates opportunity records, finds expert/case-study recommendations via Neo4j, stores coaching report, and delivers coaching emails (two-party for partnership calls).

**Steps:**
1. `extract-opportunities` -- AI opportunity extraction from transcript. Step 1 now fetches `firm.enrichmentData.classification.categories` and passes as `firmCategories` context to the extractor so it can determine `resolutionApproach` (network vs internal vs hybrid).
2. `coaching-analysis` -- AI coaching analysis (talk ratio, question quality, topics, action items)
3. `create-opportunities` -- Create `opportunities` DB rows for high-confidence detections (>= 0.6). Uses new schema fields: evidence, signalType, priority, resolutionApproach, requiredCategories, requiredMarkets, clientName, clientSizeBand, sourceId. Status defaults to "new".
4. `neo4j-recommendations` -- Query Neo4j for experts/case studies matching discussed topics
5. `store-coaching-report` -- Insert `coachingReports` row, link transcript
6. `deliver-coaching-emails` -- Send coaching report email to firm owner; for partnership calls, also sends to partner firm if they're a platform member

**Input:** `{ callId, firmId, userId?, transcript, callType, participants?, duration?, partnershipId?, scheduledCallId?, transcriptId? }`
**Output:** Report ID, analysis summary, opportunity counts, recommendation counts.

**Triggered by:**
- `POST /api/webhook/recall/transcript` (Recall.ai webhook when meeting ends)
- `POST /api/calls` (manual transcript submission)

---

### 9. `process-inbound-email` -- Process Inbound Email

| Property | Value |
|---|---|
| **File** | `src/inngest/functions/process-inbound-email.ts` |
| **Event** | `email/process-inbound` |
| **Retries** | None set (default) |
| **Concurrency** | None set |
| **Durable** | Yes (7 steps) |
| **Status** | Working |

**Purpose:** AI-powered inbound email processing pipeline. Classifies intent, extracts entities, creates opportunities from email, extracts memories, generates Ossy reply drafts, and routes to approval queue.

**Steps:**
1. `classify-email` -- AI intent classification (question, opportunity, follow_up, context, intro_response, unrelated)
2. `update-message-classification` -- Update `emailMessages` + `emailThreads` with classification
3. `create-opportunity-from-email` -- If intent is "opportunity", create `opportunities` row
4. `extract-email-context` -- Extract key facts into `memoryEntries` (theme: email_intelligence)
5. `queue-follow-up` -- If follow-up needed, dispatches `email/schedule-follow-up` event
6. `generate-ossy-reply` -- AI draft reply using Claude Sonnet via OpenRouter (intent-specific prompts)
7. `queue-response` -- Insert into `emailApprovalQueue`; auto-sends if confidence >= 0.92 for follow_up/question intents

**Auto-send threshold:** 0.92 confidence, only for `follow_up` and `question` intents. Test mode downgrades all auto-approved to pending.

**Input:** `{ messageId, threadId, firmId, from, subject, bodyText }`
**Output:** Message ID, intent, confidence, summary, response queue info.

**Triggered by:**
- `POST /api/webhooks/email` (Resend webhook -- older route)
- `POST /api/webhook/email/inbound` (Resend inbound webhook -- newer route with ICS parsing)

**Triggers downstream:**
- `email/schedule-follow-up` (if follow-up needed)
- `email/send-now` (if auto-approved)

---

### 10. `schedule-follow-up` -- Schedule Follow-Up Reminder

| Property | Value |
|---|---|
| **File** | `src/inngest/functions/follow-up-reminders.ts` |
| **Event** | `email/schedule-follow-up` |
| **Retries** | None set (default) |
| **Concurrency** | None set |
| **Durable** | Yes (4 steps, includes `step.sleep`) |
| **Status** | Working |

**Purpose:** Delayed follow-up reminder for email threads. Waits 3 days, checks if thread was resolved, then sends reminder email if still active.

**Steps:**
1. `wait-for-response` -- `step.sleep("3d")` -- durable 3-day wait
2. `check-thread-activity` -- Query thread status
3. `get-firm-owner` -- Look up firm owner's email
4. `queue-follow-up-email` -- Build and send follow-up email directly (auto-send, not queued for approval)

**Input:** `{ threadId, firmId, reason?, action?, suggestedDate? }`
**Output:** `{ sent, to, thread }` or `{ skipped, reason }`

**Triggered by:** `processInboundEmail` function (when AI detects follow-up is needed)

---

### 11. `check-stale-partnerships` -- Check Stale Partnerships

| Property | Value |
|---|---|
| **File** | `src/inngest/functions/follow-up-reminders.ts` |
| **Event** | Cron: `0 9 * * *` (daily at 9:00 AM UTC) |
| **Retries** | None set (default) |
| **Concurrency** | None set |
| **Durable** | Yes (2+ steps, dynamic per partnership) |
| **Status** | Working |

**Purpose:** Daily cron that finds partnerships needing attention. Sends nudge emails for stale requests (>3 days) and identifies idle accepted partnerships (>14 days, currently logged but no nudge sent for idle).

**Steps:**
1. `find-stale-requests` -- Query partnerships with status "requested" older than 3 days
2. `find-idle-partnerships` -- Query accepted partnerships with no activity for 14 days
3. `nudge-stale-{id}` -- One step per stale partnership: look up firm B owner, send nudge email

**Input:** None (cron-triggered)
**Output:** `{ staleRequests, idlePartnerships, nudgesSent }`

---

### 12. `weekly-digest` -- Weekly Partnership Digest

| Property | Value |
|---|---|
| **File** | `src/inngest/functions/weekly-digest.ts` |
| **Event** | Cron: `0 8 * * 1` (Monday 8:00 AM UTC) |
| **Retries** | None set (default) |
| **Concurrency** | None set |
| **Durable** | Yes (1 + N steps, one per firm) |
| **Status** | Working |

**Purpose:** Weekly digest email for each active firm. Gathers partnership stats, referrals given/received, opportunity updates, and estimated revenue. Skips firms with zero activity.

**Steps:**
1. `get-active-firms` -- Query all `serviceFirms`
2. `digest-{firmId}` -- Per-firm: gather stats, build email, send via Resend

**Input:** None (cron-triggered)
**Output:** `{ firmsProcessed, digestsSent }`

---

### 13. `send-approved-email` -- Send Approved Email

| Property | Value |
|---|---|
| **File** | `src/inngest/functions/send-approved-email.ts` |
| **Event** | `email/send-now` |
| **Retries** | 2 |
| **Concurrency** | None set |
| **Durable** | Yes (4 steps) |
| **Status** | Working |

**Purpose:** Sends emails from the approval queue. Handles test mode safeguard (downgrades auto-approved to pending). Stores outbound message record.

**Steps:**
1. `fetch-queue-entry` -- Load `emailApprovalQueue` row
2. `check-test-mode` -- Read `settings.email_test_mode`
3. `send-email` -- Send via Resend (replyTo: ossy@joincollectiveos.com)
4. `mark-sent` -- Update queue status, optionally insert outbound `emailMessages` row

**Input:** `{ queueId }`
**Output:** `{ queueId, messageId, sentTo }` or `{ skipped, reason }`

**Triggered by:**
- `processInboundEmail` (auto-approved high-confidence replies)
- `POST /api/admin/email/queue/[id]/approve` (admin manual approval)

---

### 14. `calls-join-meeting` -- Join Meeting (Recall.ai Bot)

| Property | Value |
|---|---|
| **File** | `src/inngest/functions/join-meeting.ts` |
| **Event** | `calls/join-meeting` |
| **Retries** | 2 |
| **Concurrency** | None set |
| **Durable** | Yes (3 steps) |
| **Status** | Working |

**Purpose:** Sends a Recall.ai bot named "Ossy" into a meeting to record and transcribe. Scheduled 2 minutes before meeting time.

**Steps:**
1. `fetch-scheduled-call` -- Load `scheduledCalls` row
2. `create-recall-bot` -- Call Recall.ai API to create bot
3. `update-scheduled-call` -- Store bot ID, set status "recording"

**Input:** `{ scheduledCallId }`
**Output:** `{ scheduledCallId, botId, botStatus, meetingLink }`

**Triggered by:** `POST /api/webhook/email/inbound` (when ICS calendar invite is detected, scheduled with `ts` parameter for 2 minutes before meeting)

---

## Cron Schedule Summary

| Function | Schedule | Description |
|---|---|---|
| `cron-weekly-recrawl` | `0 2 * * 0` (Sun 2 AM UTC) | Re-crawl all firm websites |
| `check-stale-partnerships` | `0 9 * * *` (Daily 9 AM UTC) | Nudge stale partnership requests |
| `weekly-digest` | `0 8 * * 1` (Mon 8 AM UTC) | Partnership activity digest emails |

---

## Event Flow / Dependency Graph

```
Cron (weekly-recrawl)
  |
  +---> enrich/deep-crawl (per firm)
           |
           +---> enrich/case-study-ingest (up to 25)
           +---> enrich/expert-linkedin (up to 20)

Inbound Email Webhook
  |
  +---> email/process-inbound
           |
           +---> email/schedule-follow-up (if needed)
           |       |
           |       +--- [sleeps 3 days] ---> sends reminder email
           |
           +---> email/send-now (if auto-approved)

  +---> calls/join-meeting (if ICS invite detected, delayed until meeting time)

Recall.ai Transcript Webhook
  |
  +---> calls/analyze

Admin Approve Email
  |
  +---> email/send-now

Manual API Triggers
  |
  +---> enrich/deep-crawl
  +---> enrich/case-study-ingest
  +---> enrich/expert-linkedin
  +---> enrich/firm-case-study-ingest
  +---> calls/analyze
  +---> memory/extract
  +---> graph/sync-firm
```

---

## Defined but Not Implemented

| Event Name | Type Defined | Handler Exists | Notes |
|---|---|---|---|
| `enrich/firm-abstraction` | Yes (`FirmAbstractionEvent`) | **No** | Event type defined in `client.ts` but no `createFunction` handler. Intended for rebuilding abstraction profiles for a firm. Currently, abstraction logic is embedded inside `firm-case-study-ingest` step 7. |

---

## Retry & Error Handling Patterns

- **Retries:** Range from 0 (default) to 3. Enrichment functions use 2 retries; graph-sync uses 3; call/memory functions use 1-2.
- **Concurrency limits:** Set on compute-heavy functions to avoid API rate limits: deep-crawl (5), case study ingest (3), expert enrichment (5), post-call analysis (5), memory extraction (10).
- **Error strategy:** Functions generally throw on fatal errors (triggers Inngest retry). Non-fatal cases (e.g., PDL person not found, thread already resolved) return early with a status object rather than throwing.
- **Test mode:** The email pipeline has a `settings.email_test_mode` flag that downgrades auto-approved emails to "pending" requiring manual approval.
- **Idempotency:** Most functions are not strictly idempotent. Running `firm-case-study-ingest` twice on the same case study will overwrite the previous results. `expert-linkedin` handles upsert (insert vs update) based on existing record check.

---

## External Service Dependencies

| Service | Used By | Purpose |
|---|---|---|
| PeopleDataLabs (PDL) | deep-crawl, expert-linkedin | Company + person enrichment |
| Gemini Flash (via OpenRouter) | deep-crawl (classifier), expert-linkedin (specialist gen), memory-extract | AI classification + extraction |
| Claude Sonnet (via OpenRouter) | process-inbound-email | Email reply generation |
| Neo4j Aura | deep-crawl, case-study-ingest, firm-case-study-ingest, expert-linkedin, graph-sync, post-call-analysis | Knowledge graph writes + recommendation queries |
| Resend | follow-up-reminders, weekly-digest, send-approved-email, post-call-analysis | Email delivery |
| Recall.ai | join-meeting | Meeting bot creation |
