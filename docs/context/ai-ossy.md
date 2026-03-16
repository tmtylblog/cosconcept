# 5. AI & Ossy

> Last updated: 2026-03-16

Ossy is the AI growth consultant inside Collective OS. This document covers the multi-model strategy, system prompt architecture, tools, memory system, chat API, onboarding flows, cost tracking, and guest chat.

---

## Multi-Model Strategy

All AI calls route through OpenRouter. Model selection is task-based:

| Model (OpenRouter ID) | Use Case | Notes |
|---|---|---|
| `anthropic/claude-sonnet-4` | Primary chat (Ossy conversations) | Authenticated + guest chat. maxOutputTokens: 2048 (auth), 512 (guest) |
| `google/gemini-2.0-flash-001` | Memory extraction, greeting generation, coaching analysis, email classification, opportunity extraction, email context extraction | Cheap/fast for structured extraction via `generateObject` |

Additional models defined in gateway pricing but not yet active in code:
- `anthropic/claude-haiku-4-5`, `openai/gpt-4o-mini`, `google/gemini-pro-1.5`, `text-embedding-3-small`

**Key file:** `src/lib/ai/gateway.ts`

---

## Ossy System Prompt Structure

**Key file:** `src/lib/ai/ossy-prompt.ts`

The system prompt is assembled dynamically by `getOssyPrompt(context)`. It layers:

1. **Base prompt** (`OSSY_SYSTEM_PROMPT`) -- personality, voice principles, domain knowledge, onboarding protocol, tool usage rules, formatting guidelines
2. **Current Context** block -- user name, firm name (if available)
3. **Active Mode** block -- one of:
   - `GUEST PREVIEW` -- unauthenticated user, encourages sign-in after 3-4 exchanges
   - `ONBOARDING` -- new authenticated user, walks through firm profile + 8 partner preference questions
   - `POST-ONBOARDING (Returning User)` -- has memory context, full tool access, consultative style
   - `GENERAL (Authenticated)` -- has tools but no memory yet (mid-onboarding or pre-extraction)
4. **Website Research Data** block -- enrichment results from firm website scrape, OR enrichment failure instructions
5. **Memory Context** block -- retrieved memories injected as "What You Remember About This User"

### Personality

- Knowledgeable but not arrogant
- Warm but professional
- Proactive but not pushy
- Concise but thorough
- Adaptive to user tone
- No emojis unless user uses them first
- 2-3 short paragraphs max per response
- Specific over generic ("3 firms with Shopify Plus experience in APAC" not "some great matches")

### Onboarding Protocol (5 Questions — v2)

Redesigned from 9 questions to 5 high-signal questions (commit `579dad7`, 2026-03-11). Asked one at a time, conversationally. Each confirmed answer triggers `update_profile` tool call, which:
1. Writes to PG `partnerPreferences.rawOnboardingData` JSONB
2. Queues Neo4j sync via Inngest `preferences/sync-graph` event (per-field sync)
3. On last question, queues full `preferences/sync-graph` Inngest job as a safety net

**The 5 v2 questions:**
1. `partnershipPhilosophy` — How they approach partnerships (→ ServiceFirm property in Neo4j)
2. `capabilityGaps` — What skills/capabilities they lack and need in partners (→ PREFERS edges to Skill/Category)
3. `preferredPartnerTypes` — What types of firms they want to work with (→ PREFERS edges to Category)
4. `dealBreaker` — Hard no's / red flags (→ ServiceFirm property, free text)
5. `geographyPreference` — Where they want partners (→ ServiceFirm property + optional PREFERS edge to Market)

**Key files for v2 onboarding:**
- `src/lib/profile/update-profile-field.ts` — PG write + Inngest `preferences/sync-graph` queue
- `src/lib/enrichment/preference-writer.ts` — All Neo4j PREFERS edge creation logic
- `src/lib/ai/ossy-tools.ts` — Tool definitions + onboarding completion detection + safety-net sync
- `src/lib/ai/ossy-prompt.ts` — System prompt with v2 interview instructions

**Legacy v1 questions (9-question flow, still supported for backward compat):**
1. `desiredPartnerServices` -- mapped to COS skill categories
2. `requiredPartnerIndustries` -- standard industry verticals
3. `idealPartnerClientSize` -- PDL company size bands
4. `preferredPartnerLocations` -- geography or remote
5. `preferredPartnerTypes` -- mapped to 30 COS firm categories
6. `preferredPartnerSize` -- PDL company size bands
7. `idealProjectSize` -- free text
8. `typicalHourlyRates` -- free text

Onboarding has two phases: (1) Confirm enrichment data (2-3 exchanges), then (2) Partner preference interview.

**Pivot Rule:** If user asks to search/find something during onboarding, Ossy drops questions and uses tools immediately.

---

## Available Tools

**Key file:** `src/lib/ai/ossy-tools.ts`

### `update_profile`

The only tool currently implemented. Created per-request via `createOssyTools(organizationId, firmId)`.

**Purpose:** Persists confirmed data points from conversation to database.

**When called:** Only AFTER user confirms information. Never while exploring or uncertain.

**Field routing:**

| Field Category | Fields | Storage Location |
|---|---|---|
| Firm profile (enrichment confirmation) | `firmCategory`, `services`, `clients`, `skills`, `markets`, `languages`, `industries` | `serviceFirms.enrichmentData.confirmed` (JSONB merge) |
| Partner preferences (dedicated columns) | `preferredPartnerTypes`, `preferredPartnerSize`, `requiredPartnerIndustries`, `preferredPartnerLocations`, `partnershipModels`, `dealBreakers`, `growthGoals` | `partnerPreferences` table (column mapped via `PARTNER_COLUMN_MAP`) |
| Partner criteria (raw JSONB) | `desiredPartnerServices`, `idealPartnerClientSize`, `idealProjectSize`, `typicalHourlyRates` | `partnerPreferences.rawOnboardingData` (JSONB) |

**Side effects:**
- Logs `interview_answer` onboarding event for funnel tracking (with question number)
- Logs `onboarding_complete` when last question (question 8) is answered
- Tool result is pushed back to client -- `ChatPanel` watches for `tool-update_profile` parts and calls `updateProfileField` to update the dashboard in real-time

### `search_partners`

Calls `executeSearch()` from `src/lib/matching/search.ts`. Returns ranked `FirmResult[]` with match scores, explanations, and bidirectional fit. Passes the user's `firmId` as `searcherFirmId` for bidirectional matching. `maxSteps: 3` allows multi-tool calls.

### `search_experts`

Calls `searchExperts()` from `src/lib/matching/expert-search.ts`. Queries `expert_profiles` table with ILIKE text search + JSONB overlap filtering on skills/industries. Returns `ExpertResult[]` with name, headline, skills, specialist profiles.

### `search_case_studies`

Calls `searchCaseStudies()` from `src/lib/matching/case-study-search.ts`. Queries `firm_case_studies` table with tag filtering (skills, industries). Returns `CaseStudyResult[]` with title, summary, tags, firm info.

### `lookup_firm`

Calls `lookupFirmDetail()` from `src/lib/matching/firm-lookup.ts`. Looks up a firm by name, domain, or ID. Searches `serviceFirms` + Neo4j. Returns `FirmDetail` with enrichment data, case studies, experts, categories, skills.

### `get_my_profile`

Calls `lookupFirmDetail()` from `src/lib/matching/firm-lookup.ts` using the user's own `firmId`. Returns the same `FirmDetail` object so Ossy can reference the user's firm data in conversation.

### `research_client`

Researches any external company (client, prospect, brand). Cache-first with Inngest fallback:

- **Cache hit:** Loads from `company_research` table, runs fit assessment inline (fast — scoring + 1 AI call for talking points), finds gap-filling partners, returns full results immediately.
- **Cache miss:** Queues `research/company` Inngest job (PDL + Jina + classify + intelligence + persist + Neo4j), returns `{ queued: true }` with instruction for Ossy to tell the user research is running (~1 min). User asks again later and gets cache hit.

**Key functions:** `checkCompanyResearchTable()`, `checkEnrichmentCache()` from `client-research.ts` for inline cache checks. `assessClientFit()` from `fit-assessment.ts` for inline scoring on cache hit.

### `analyze_client_overlap`

Analyzes which of the user's clients would benefit from a specific partner's capabilities. Generates concrete collaboration ideas for partner meetings. Uses `lookupFirmDetail()` + `analyzeClientOverlap()`.

### `discover_search`

General-purpose search across the Collective OS knowledge graph. Searches firms, experts, and case studies via `executeSearch()`. Returns up to 8 candidates with match scores, categories, skills, and a `resultAnalysis` summary for Ossy to ask sharpening follow-ups.

---

## Memory System

### Extraction

**Key file:** `src/lib/ai/memory-extractor.ts`

- **Trigger:** Queued via Inngest `memory/extract` event after each chat response when `messages.length >= 4`
- **Model:** Gemini 2.0 Flash via `generateObject`
- **Input:** Conversation transcript (truncated to 12,000 chars)
- **Output:** Array of `{ theme, content, confidence }` objects
- **Threshold:** Only memories with `confidence >= 0.6` are stored
- **Storage:** Inserted into `memoryEntries` table, then `memoryThemes` summary updated

### 8 Memory Themes

| Theme | Description |
|---|---|
| `firm_capabilities` | What the firm does, services, strengths, specialties |
| `partner_preferences` | What partners they want/don't want, deal-breakers |
| `client_profile` | Ideal clients, industries, deal sizes |
| `personal_style` | Communication preferences, detail level |
| `opportunities` | Business opportunities, pipeline items, needs |
| `feedback` | Feedback on matches, suggestions, platform |
| `action_items` | Commitments, follow-ups, pending tasks |
| `relationships` | Context about specific partners, prospects, contacts |

### Retrieval

**Key file:** `src/lib/ai/memory-retriever.ts`

- **Trigger:** Every authenticated chat request, before generating response
- **Strategy:** Fetch last 20 entries across all themes, ordered by recency
- **Output:** Formatted context block grouped by theme with human-readable labels
- **Injection:** Appended to system prompt as `## What You Remember About This User`
- **Style rule:** Ossy should not announce "I remember" -- just demonstrate awareness naturally
- **Future:** Vector similarity search planned (pgvector column exists in schema but not active)

### Memory API

**Key file:** `src/app/api/memory/route.ts`

| Method | Purpose |
|---|---|
| `GET /api/memory` | Get overview stats (all themes with entry counts) |
| `GET /api/memory?theme=X` | Get entries for a specific theme |
| `DELETE /api/memory` `{ entryId }` | Delete a specific memory entry |
| `DELETE /api/memory` `{ theme }` | Delete all entries for a theme |
| `DELETE /api/memory` `{ all: true }` | Delete ALL memories for the user |

### Memory Stats (Settings Page)

`getMemoryStats(userId)` returns per-theme entry counts and last-updated timestamps. `getMemoryEntriesByTheme(userId, theme)` returns full entries for drill-down.

---

## Chat API

### Main Chat Route

**Key file:** `src/app/api/chat/route.ts`

`POST /api/chat` -- Authenticated streaming chat.

**Flow:**
1. Authenticate via Better Auth session
2. Feature gate check (plan-based messaging limits -- stub for free plan)
3. Resolve `firmId` from `serviceFirms` table via `organizationId`
4. Retrieve memory context for the user
5. Determine mode: onboarding (no memory + early messages), post-onboarding (has memory), general (has firm but no memory)
6. Build system prompt via `getOssyPrompt()`
7. Resolve or create conversation in DB (find most recent or create new)
8. Persist user message to `messages` table
9. Stream response via `streamText()` with Claude Sonnet 4
10. On finish: persist assistant message, log AI usage, log tool calls, queue memory extraction via Inngest

**Request body:**
```ts
{
  messages: UIMessage[];
  organizationId?: string;
  websiteContext?: string;
  conversationId?: string;
}
```

**Response:** Streaming `UIMessageStreamResponse` with `X-Conversation-Id` header.

**Tool access:** Available to any authenticated user with a firm profile (`firmId` exists). NOT gated behind onboarding completion. `maxSteps: 3` for multi-tool calls.

### Greeting Route

**Key file:** `src/app/api/chat/greeting/route.ts`

`GET /api/chat/greeting?organizationId=X` -- Generates personalized returning-user greeting.

**Flow:**
1. Load memory context (last 15 entries)
2. Load last conversation's last 3 messages
3. If no memories AND no conversations, return `{ isReturning: false }`
4. Generate greeting via Gemini Flash (`generateText`)
5. Return `{ isReturning: true, greeting: "..." }`

Used by `ChatPanel` on mount to replace default welcome message for returning users.

### Guest Chat Route

**Key file:** `src/app/api/chat/guest/route.ts`

`POST /api/chat/guest` -- Unauthenticated streaming chat. No billing, no persistence, no tools.

**Limits:**
- Hard cap: 6 user messages per request (returns 429 after)
- maxOutputTokens: 512 (vs 2048 for authenticated)
- No conversation persistence
- No memory extraction
- No tool access

**System prompt mode:** `isGuest: true` + `isOnboarding: true` -- warm engagement that naturally transitions to encouraging sign-in.

### Chat Migration Route (Stub)

**Key file:** `src/app/api/chat/migrate/route.ts`

`POST /api/chat/migrate` -- Intended to persist guest conversation to authenticated user's account after sign-in. Currently a stub (logs but does not persist).

---

## Onboarding vs General Chat Modes

| Aspect | Onboarding | General (Post-Onboarding) |
|---|---|---|
| Trigger | No memory + messages <= 2 | Has memory context |
| System prompt mode | `ONBOARDING` | `POST-ONBOARDING (Returning User)` |
| Conversation mode (DB) | `"onboarding"` | `"general"` |
| Primary focus | Confirm enrichment data, collect 5 partner preferences | Search, explore, advise, refine |
| Tool usage | `update_profile` only | All 6 tools (update_profile + 5 search tools) |
| Greeting | Default welcome message | AI-generated personalized greeting via Gemini Flash |

Mode detection in `route.ts`:
```ts
const hasCompletedOnboarding = !!memoryBlock;  // memories exist = returning user
const isOnboarding = !memoryBlock && messages.length <= 2;
```

---

## AI Cost Tracking

**Key file:** `src/lib/ai/gateway.ts`
**Schema table:** `aiUsageLog`

Every AI call logs to `ai_usage_log` with:
- `organizationId`, `userId` -- who
- `model` -- which model (OpenRouter ID or shorthand)
- `feature` -- `chat`, `chat_tool`, `memory`, `enrichment`, `matching`, `voice`, `classification`, `case_study`, `expert`, `abstraction`
- `inputTokens`, `outputTokens`, `costUsd` -- cost
- `entityType`, `entityId` -- what entity this relates to
- `durationMs` -- latency

**Cost calculation:** `estimateCost(model, inputTokens, outputTokens)` uses per-1K-token rates from `MODEL_COSTS` lookup.

**Convenience functions:**
- `logUsage()` -- auto-calculates cost and logs
- `logAIUsage()` -- logs with pre-calculated cost
- `withUsageTracking()` -- wraps an AI call to auto-time and log

**Tool call logging:** Each tool invocation logs separately with `model: "tool:<toolName>"` and `feature: "chat_tool"`.

### Pricing Table (per 1K tokens)

| Model | Input | Output |
|---|---|---|
| `anthropic/claude-sonnet-4` | $0.003 | $0.015 |
| `google/gemini-2.0-flash-001` | $0.0001 | $0.0004 |
| `google/gemini-pro-1.5` | $0.00125 | $0.005 |
| `anthropic/claude-haiku-4-5` | $0.0008 | $0.004 |
| `openai/gpt-4o-mini` | $0.00015 | $0.0006 |
| `text-embedding-3-small` | $0.00002 | $0 |

---

## Guest Chat Flow

1. User lands on site (unauthenticated)
2. `ChatPanel` renders with `isGuest={true}`, uses `/api/chat/guest` endpoint
3. Default welcome message shown (hardcoded in `ChatPanel`)
4. Guest chats with Ossy (Sonnet 4, no tools, no persistence)
5. Ossy naturally encourages sign-in after 3-4 exchanges (guided by `GUEST PREVIEW` prompt)
6. After 5 user messages, `ChatPanel` shows inline login UI (Google OAuth + email/password)
7. Server hard-limits at 6 user messages (429 response)
8. On sign-in, user redirected to `/dashboard`
9. Guest messages migration: `POST /api/chat/migrate` exists but is a stub

**Inline login component** (`InlineChatLogin`): Renders Google OAuth button + expandable email form directly in chat flow. Requires corporate email (blocks personal email domains). Redirects to `/dashboard` on success.

---

## Additional AI Modules

### Coaching Analyzer

**Key file:** `src/lib/ai/coaching-analyzer.ts`

Analyzes call transcripts for coaching insights: talking time ratio, value proposition clarity, question quality, topics covered, next steps, action items, overall score 0-100, partner recommendations. Uses Gemini Flash.

### Email Intent Classifier

**Key file:** `src/lib/ai/email-intent-classifier.ts`

Classifies inbound emails to `ossy@joincollectiveos.com` by intent: `opportunity`, `follow_up`, `context`, `question`, `intro_response`, `unrelated`. Extracts entities (firms, people, skills, industries, values) and opportunity signals. Uses Gemini Flash.

Also has `extractEmailContext()` for pulling themes and key facts from emails for memory storage.

### Opportunity Extractor

**Key file:** `src/lib/ai/opportunity-extractor.ts`

Scans text (call transcripts, emails, chat messages) for business opportunity signals ("we need help with...", "looking for a partner who...", "our client needs..."). Extracts structured opportunities with required skills, industries, estimated value, timeline, client type, and confidence score. Uses Gemini Flash. Threshold: confidence >= 0.5.

---

## Client Component: ChatPanel

**Key file:** `src/components/chat-panel.tsx`

The main chat UI component. Key behaviors:

- **Endpoint selection:** `/api/chat/guest` (guest) or `/api/chat` (authenticated)
- **Greeting:** On mount, fetches `GET /api/chat/greeting` for returning users; falls back to default welcome
- **URL detection:** Watches user messages for URLs via regex, triggers firm enrichment automatically
- **Enrichment status:** Shows indicator in header (Researching... / Analyzed / Not found)
- **Tool result handling:** Watches for `tool-update_profile` parts with `state: "output-available"`, pushes confirmed field values to `ProfileProvider` for real-time dashboard updates
- **Guest message limit:** Tracks count client-side, shows inline login UI at 5 messages
- **Transport:** Uses `DefaultChatTransport` from AI SDK, sends `organizationId`, `websiteContext`, `conversationId` in body

### Chat Sub-Components

Located in `src/components/chat/`:
- `tool-result-renderer.tsx` -- renders tool invocation results in chat
- `case-study-card.tsx` -- case study search result card
- `expert-result-card.tsx` -- expert search result card
- `firm-result-card.tsx` -- firm search result card

---

## Database Schema (Chat & AI Tables)

### `conversations`
| Column | Type | Notes |
|---|---|---|
| `id` | text PK | `conv_` prefix |
| `userId` | text FK -> users | cascade delete |
| `organizationId` | text FK -> organizations | cascade delete |
| `title` | text | First message text (truncated to 100 chars) |
| `mode` | text | `"general"` or `"onboarding"` |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | |

### `messages`
| Column | Type | Notes |
|---|---|---|
| `id` | text PK | `msg_` prefix |
| `conversationId` | text FK -> conversations | cascade delete |
| `role` | text | `"user"` or `"assistant"` |
| `content` | text | Plain text content |
| `createdAt` | timestamp | |

### `aiUsageLog` (table: `ai_usage_log`)
| Column | Type | Notes |
|---|---|---|
| `id` | text PK | `ai_` prefix |
| `organizationId` | text FK -> organizations | set null on delete |
| `userId` | text FK -> users | set null on delete |
| `model` | text | OpenRouter model ID or `tool:<name>` |
| `feature` | text | `chat`, `chat_tool`, `memory`, `enrichment`, etc. |
| `inputTokens` | integer | |
| `outputTokens` | integer | |
| `costUsd` | real | Auto-calculated from model pricing |
| `entityType` | text | e.g. `"conversation"` |
| `entityId` | text | |
| `durationMs` | integer | |
| `createdAt` | timestamp | |

### `memoryEntries` (table: `memory_entries`)
| Column | Type | Notes |
|---|---|---|
| `id` | text PK | `mem_` prefix |
| `userId` | text FK -> users | cascade delete |
| `organizationId` | text FK -> organizations | cascade delete |
| `theme` | text | One of 8 theme identifiers |
| `content` | text | The memory statement |
| `confidence` | real | 0-1, default 0.8 |
| `sourceConversationId` | text FK -> conversations | set null on delete |
| `sourceMessageId` | text | |
| `expiresAt` | timestamp | Optional TTL |
| `createdAt` | timestamp | |

Note: `embedding: vector(1536)` column is planned but not yet active (pgvector not enabled).

### `memoryThemes` (table: `memory_themes`)
| Column | Type | Notes |
|---|---|---|
| `id` | text PK | `{userId}:{theme}` composite |
| `userId` | text FK -> users | cascade delete |
| `organizationId` | text FK -> organizations | cascade delete |
| `theme` | text | Theme identifier |
| `summary` | text | AI-generated summary (not yet populated) |
| `entryCount` | integer | Count of entries for this theme |
| `lastUpdatedAt` | timestamp | |
| `createdAt` | timestamp | |

---

## Key Files Reference

| File | Responsibility |
|---|---|
| `src/lib/ai/gateway.ts` | AI cost tracking, usage logging, model pricing |
| `src/lib/ai/ossy-prompt.ts` | System prompt assembly, personality, mode switching |
| `src/lib/ai/ossy-tools.ts` | All 9 tool definitions: `update_profile`, `search_partners`, `search_experts`, `search_case_studies`, `lookup_firm`, `get_my_profile`, `research_client`, `analyze_client_overlap`, `discover_search` |
| `src/lib/matching/firm-lookup.ts` | `lookupFirmDetail()` for `lookup_firm` and `get_my_profile` tools |
| `src/lib/matching/expert-search.ts` | `searchExperts()` for `search_experts` tool |
| `src/lib/matching/case-study-search.ts` | `searchCaseStudies()` for `search_case_studies` tool |
| `src/lib/ai/memory-extractor.ts` | Post-conversation memory extraction (Gemini Flash) |
| `src/lib/ai/memory-retriever.ts` | Pre-response memory retrieval + memory management API |
| `src/lib/ai/coaching-analyzer.ts` | Call transcript coaching analysis |
| `src/lib/ai/email-intent-classifier.ts` | Inbound email classification + entity extraction |
| `src/lib/ai/opportunity-extractor.ts` | Business opportunity signal detection |
| `src/app/api/chat/route.ts` | Main authenticated chat endpoint (streaming) |
| `src/app/api/chat/guest/route.ts` | Guest chat endpoint (no auth, limited) |
| `src/app/api/chat/greeting/route.ts` | Personalized returning-user greeting |
| `src/app/api/chat/migrate/route.ts` | Guest-to-auth conversation migration (stub) |
| `src/app/api/memory/route.ts` | Memory CRUD API for settings page |
| `src/components/chat-panel.tsx` | Main chat UI (guest + auth, enrichment, tool results) |
| `src/components/chat/tool-result-renderer.tsx` | Renders tool invocations in chat bubbles |
| `src/components/chat/firm-result-card.tsx` | Firm search result card component |
| `src/components/chat/expert-result-card.tsx` | Expert search result card component |
| `src/components/chat/case-study-card.tsx` | Case study search result card component |

---

## Known Gaps / TODOs

- ~~**Search tools not implemented:**~~ All 5 search tools are now implemented in `ossy-tools.ts`: `search_partners`, `search_experts`, `search_case_studies`, `lookup_firm`, `get_my_profile`
- **Guest migration stub:** `POST /api/chat/migrate` logs but does not persist messages
- **pgvector not live:** `memoryEntries.embedding` column planned but not active; retrieval is recency-based only
- **Theme summaries not generated:** `memoryThemes.summary` column exists but `updateThemeSummary` only updates entry count, not the AI summary
- **Free plan messaging limits:** Feature gate check exists but enforcement is a stub
- **Voice input:** Mic button rendered in ChatPanel but not functional
