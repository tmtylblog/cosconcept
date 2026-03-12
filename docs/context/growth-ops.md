# 19. Growth Operations

> Last updated: 2026-03-12

Growth Ops is the admin-only outbound engine built into COS CONCEPT. It connects Unipile (LinkedIn automation), Instantly (email outreach), and HubSpot (CRM pipeline) into a single admin UI with attribution reporting.

---

## Overview

**Access:** Superadmin only (`role === "superadmin"`)
**Entry point:** `/admin/growth-ops`
**API base:** `/api/admin/growth-ops/`
**Library:** `src/lib/growth-ops/`

---

## External Services

### Unipile (LinkedIn Automation)

| Var | Value |
|-----|-------|
| `UNIPILE_API_KEY` | `AgrnfHug.c5Zc5IXyAbbJCpOYjfb75G7GMfYFm1IhqWv8OBGnEW8=` |
| `UNIPILE_BASE_URL` | `https://api21.unipile.com:15140` |

**Client:** `src/lib/growth-ops/UnipileClient.ts`

Methods:
- `generateHostedAuthLink(callbackUrl)` — creates Unipile hosted auth link for connecting a LinkedIn account (30-min expiry)
- `generateReconnectLink(accountId, callbackUrl)` — reconnect flow for CREDENTIALS-state accounts
- `listAccounts()` — all connected LinkedIn accounts
- `listChats(accountId, cursor?)` — paginated inbox for one account
- `getChatMessages(chatId)` — messages in a thread
- `sendMessage(chatId, text)` — reply in a thread
- `resolveLinkedInUser(linkedinUrl, accountId)` — resolve a LinkedIn URL to a Unipile `provider_id`
- `sendInvite(providerId, accountId, message?)` — send a connection request

**Webhook:** `POST /api/growth-ops/unipile-webhook` (public — no auth, Unipile sends here)
- Handles: `account.connected`, `account.reconnected`, `account.error`, `account.disconnected`
- Upserts/updates `growth_ops_linkedin_accounts` table
- Always returns HTTP 200

`NEXT_PUBLIC_APP_URL` must be set for the callback URL in hosted auth links (set to `https://cos-concept.vercel.app`).

---

### Instantly (Email Outreach)

| Var | Value |
|-----|-------|
| `INSTANTLY_API_KEY` | `YjdkYTQ5OGQtMThiMS00N2Q4LTk3N2EtMzY4MjRhMGMxYWJlOm5FUmp6cGdCZUJNbQ==` |

**Client:** `src/lib/growth-ops/InstantlyClient.ts`
**Base URL:** `https://api.instantly.ai/api/v2`

Methods:
- `listCampaigns()` — all campaigns
- `getCampaign(id)` — single campaign details
- `getCampaignAnalytics(id)` — opens, clicks, replies, bounces
- `listCampaignLeads(id, cursor?)` — leads in a campaign
- `listEmailAccounts()` — connected sender accounts

---

### HubSpot (CRM)

| Var | Value |
|-----|-------|
| `HUBSPOT_ACCESS_TOKEN` | **Pending — Freddie to provide** |

**Client:** `src/lib/growth-ops/HubSpotClient.ts`
**Base URL:** `https://api.hubapi.com`

Methods:
- `listPipelines()` — all deal pipelines + stages
- `getAllDeals(pipelineId)` — paginated full deal fetch for a pipeline
- `updateDealStage(dealId, stageId)` — move deal to new stage (bidirectional sync from Kanban drag)

---

## Database Tables (Migration 0004)

### `growth_ops_linkedin_accounts`
Connected LinkedIn accounts managed via Unipile.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| unipile_account_id | text NOT NULL UNIQUE | Unipile's internal account ID |
| display_name | text (default '') | LinkedIn display name |
| linkedin_username | text | |
| status | text (default 'CONNECTING') | CONNECTING \| OK \| CREDENTIALS \| ERROR |
| created_at | timestamp | |
| updated_at | timestamp | |

### `growth_ops_target_lists`
Named lists of LinkedIn connection targets.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| name | text NOT NULL | |
| description | text | |
| created_at | timestamp | |
| updated_at | timestamp | |

### `growth_ops_invite_targets`
Individual connection targets, belonging to a list.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| list_id | text FK → target_lists (cascade) | |
| first_name | text (default '') | |
| linkedin_url | text NOT NULL | |
| unipile_provider_id | text | Cached after first resolution |
| status | text (default 'pending') | pending \| invited \| failed \| skipped |
| invited_at | timestamp | |
| created_at | timestamp | |

### `growth_ops_invite_campaigns`
A campaign links one LinkedIn account to one target list.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| name | text NOT NULL | |
| target_list_id | text FK → target_lists (restrict) | |
| linkedin_account_id | text FK → linkedin_accounts (restrict) | |
| status | text (default 'draft') | draft \| active \| paused \| completed |
| daily_min | integer (default 15) | Min invites/day |
| daily_max | integer (default 19) | Max invites/day |
| invite_message | text | Optional connection note |
| created_at | timestamp | |
| updated_at | timestamp | |

### `growth_ops_invite_queue`
Pre-scheduled invite queue entries. Built when a campaign is activated.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| campaign_id | text FK → invite_campaigns (cascade) | |
| target_id | text FK → invite_targets (cascade) | |
| linkedin_account_id | text FK → linkedin_accounts (cascade) | |
| scheduled_at | timestamp NOT NULL | Pre-assigned by scheduler |
| sent_at | timestamp | |
| status | text (default 'queued') | queued \| sent \| failed \| skipped |
| error_message | text | |
| created_at | timestamp | |

### `growth_ops_hubspot_cache`
Snapshot of HubSpot deals for fast Kanban rendering.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| deal_id | text NOT NULL UNIQUE | HubSpot deal ID |
| pipeline_id | text NOT NULL | |
| pipeline_label | text (default '') | |
| stage_id | text NOT NULL | |
| stage_label | text (default '') | |
| stage_order | integer (default 0) | For Kanban column ordering |
| deal_data | jsonb (default {}) | Full deal object snapshot |
| synced_at | timestamp | |

---

## Invite Scheduler

**Library:** `src/lib/growth-ops/invite-scheduler.ts` → `buildInviteSchedule(targetIds, linkedinAccountId, campaignId, dailyMin, dailyMax)`

**Algorithm:**
- Poisson sampling (Knuth algorithm) for natural daily variance
- Window: 8AM–6PM UTC (10-hour spread)
- Minimum 5-minute gap between invites
- Returns array of queue items with pre-assigned UUIDs and `scheduledAt` timestamps
- Skips Sundays (UTC day 0)

**Job handler:** `src/lib/jobs/handlers/linkedin-invite-scheduler.ts`
- Fetches due `growthOpsInviteQueue` items (`status = "queued"`, `scheduledAt <= now`)
- Skips Sundays
- Resolves + caches Unipile `provider_id` for each target
- Sends invite via `UnipileClient.sendInvite()`
- Updates queue entry to `sent`/`failed`
- Updates target status to `invited`/`failed`

**Cron trigger:** Top of every hour Mon–Sat (in `/api/jobs/cron`):
```typescript
if (dayOfWeek !== 0 && nowMinute <= 2) {
  await enqueue("linkedin-invite-scheduler", {});
}
```

---

## API Routes

All routes under `/api/admin/growth-ops/` require `role === "superadmin"`.

### External API Proxies

| Method | Path | Action param | Description |
|--------|------|-------------|-------------|
| GET | `/api/admin/growth-ops/unipile` | `listAccounts` | List Unipile accounts |
| GET | `/api/admin/growth-ops/unipile` | `listChats?accountId=` | List chats for account |
| GET | `/api/admin/growth-ops/unipile` | `getChatMessages?chatId=` | Get messages in thread |
| POST | `/api/admin/growth-ops/unipile` | `generateAuthLink` | Get Unipile hosted auth URL |
| POST | `/api/admin/growth-ops/unipile` | `generateReconnectLink` | Get reconnect URL |
| POST | `/api/admin/growth-ops/unipile` | `sendMessage` | Send inbox reply |
| POST | `/api/admin/growth-ops/unipile` | `resolveUser` | Resolve LinkedIn URL → provider_id |
| POST | `/api/admin/growth-ops/unipile` | `sendInvite` | Send connection invite |
| GET | `/api/admin/growth-ops/instantly` | `listCampaigns` | All email campaigns |
| GET | `/api/admin/growth-ops/instantly` | `getCampaign?id=` | Single campaign |
| GET | `/api/admin/growth-ops/instantly` | `listAccounts` | Email sender accounts |
| POST | `/api/admin/growth-ops/instantly` | `getAnalytics` | Campaign analytics |
| POST | `/api/admin/growth-ops/instantly` | `listLeads` | Campaign leads |
| GET | `/api/admin/growth-ops/hubspot` | `listPipelines` | All pipelines + stages |
| GET | `/api/admin/growth-ops/hubspot` | `getAllDeals?pipelineId=` | All deals in pipeline |
| POST | `/api/admin/growth-ops/hubspot` | `updateDealStage` | Move deal to stage |

### DB CRUD Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/growth-ops/linkedin-accounts` | List all LinkedIn accounts |
| PATCH | `/api/admin/growth-ops/linkedin-accounts` | Update account (status, display_name) |
| DELETE | `/api/admin/growth-ops/linkedin-accounts` | Remove account record |
| GET | `/api/admin/growth-ops/target-lists` | List all target lists |
| POST | `/api/admin/growth-ops/target-lists` | Create target list |
| DELETE | `/api/admin/growth-ops/target-lists` | Delete target list |
| GET | `/api/admin/growth-ops/target-lists/[listId]/targets` | Targets in a list |
| POST | `/api/admin/growth-ops/target-lists/[listId]/targets` | Add targets (bulk CSV import) |
| GET | `/api/admin/growth-ops/invite-campaigns` | List all campaigns |
| POST | `/api/admin/growth-ops/invite-campaigns` | Create campaign + build invite queue |
| PATCH | `/api/admin/growth-ops/invite-campaigns/[campaignId]` | Update campaign status |

---

## Admin Pages

| Page | Path | Description |
|------|------|-------------|
| Growth Ops Overview | `/admin/growth-ops` | Landing with 4 section cards |
| LinkedIn Inbox | `/admin/growth-ops/linkedin` | Unified inbox (Unibox) — chat list + thread view + reply composer |
| LinkedIn Accounts | `/admin/growth-ops/linkedin/accounts` | Account manager — connect/reconnect via Unipile hosted auth |
| LinkedIn Campaigns | `/admin/growth-ops/linkedin/campaigns` | Campaign table + create modal + start/pause controls |
| LinkedIn Targets | `/admin/growth-ops/linkedin/targets` | Target lists with accordion expansion + CSV import |
| Instantly | `/admin/growth-ops/instantly` | Email campaign analytics — stat cards + per-campaign rates |
| HubSpot | `/admin/growth-ops/hubspot` | Drag-and-drop Kanban board with optimistic UI |
| Attribution | `/admin/growth-ops/attribution` | On-demand cross-channel attribution report |

---

## Environment Variables Summary

| Var | Status | Notes |
|-----|--------|-------|
| `UNIPILE_API_KEY` | ✅ Set in Vercel production | |
| `UNIPILE_BASE_URL` | ✅ Set in Vercel production | `https://api21.unipile.com:15140` |
| `INSTANTLY_API_KEY` | ✅ Set in Vercel production | |
| `NEXT_PUBLIC_APP_URL` | ✅ Set in Vercel production | `https://cos-concept.vercel.app` |
| `HUBSPOT_ACCESS_TOKEN` | ⏳ Pending | Freddie to provide HubSpot private app token |
