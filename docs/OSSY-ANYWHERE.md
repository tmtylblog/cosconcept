# Ossy Anywhere — Feature Plan

> Status: **Planned — not yet built**
> Scope: Connect Ossy to external messaging channels so users can interact with her from wherever they work, with the native COS app as the destination for deeper engagement.

---

## Vision

Ossy lives natively inside COS at `cos-concept.vercel.app`. Ossy Anywhere extends her reach to the tools users already have open — Slack, WhatsApp, Roam, and Microsoft Teams — so they never have to switch context just to ask a quick question, approve an intro, or check a match.

**The golden rule:** External channels are for lightweight interaction. The native app is for everything deeper. Ossy always knows which environment she's in and behaves accordingly — including knowing when to stop and send the user a link instead.

---

## Supported Platforms

| Platform | Auth model | Individual-level | Complexity |
|----------|-----------|------------------|------------|
| **Slack** | OAuth 2.0 | Yes — user-by-user install | Medium |
| **WhatsApp** | Phone verification + Meta Business API | Yes — phone-linked | Hard |
| **Roam (ro.am)** | Personal OAuth | Yes — personal access model | Medium |
| **Microsoft Teams** | OAuth (Azure AD) | Mostly — varies by org IT policy | Medium-Hard |

All four share the same underlying message router, conversation context store, and system prompt architecture. The differences are purely in formatting, tone, and platform-specific API calls.

---

## Platform Behavior Guide

This is the knowledge layer that governs how Ossy communicates on each channel. It gets injected as a system prompt prefix whenever Ossy responds outside the native app.

### Shared rules (all channels)

1. **Never render the full native UI in text.** Summarise, then deep-link.
2. **Keep it scannable.** Users are in another app, often on mobile. No walls of text.
3. **Always offer a path back.** If the user's question needs more than a quick answer, end with a relevant deep link.
4. **Maintain full context.** Conversation history is shared across all channels — if the user discussed something on web, Ossy remembers it here.
5. **Respect the session window.** On WhatsApp, proactive messages are template-only after 24h of inactivity. On other platforms, Ossy can push anytime.
6. **Never pretend to do things she can't do in-channel.** If a capability requires the app UI, say so and link directly.

---

### Slack

**Tone:** Professional, warm, direct. Matches how people already communicate at work.

**Format:**
- Full Markdown supported (`*bold*`, `_italic_`, `` `code` ``, bullet lists)
- Use Slack Block Kit for action messages (buttons, sections, dividers)
- Max ~300 words per message — if longer is genuinely needed, summarise + link
- Bullets over paragraphs wherever possible

**What Ossy can do in Slack:**
- Answer questions about the platform, partnerships, firms
- Give a match summary (brief — name, fit score, one-line reason)
- Confirm an intro request (yes/no action buttons via Block Kit)
- Report partnership status ("Still active, last touchpoint 12 days ago")
- Deliver proactive notifications (new match, partner accepted intro, weekly digest)

**What she redirects to the app for:**
- Full firm profiles → `/firm/[id]`
- Running a new search → `/matches`
- Editing profile or preferences → `/settings`
- Viewing the full opportunity board → `/opportunities`
- Analytics / dashboard → `/dashboard`

**Example response style:**
```
*New match:* Chameleon Collective
Fit score: 92 · Category: Creative Transformation
They work with mid-market brands on rebranding + campaign work — strong overlap with your BD strategy.

→ <https://cos-concept.vercel.app/firm/chameleon-collective|View full profile>
```

**Proactive push format (Block Kit):**
```json
{
  "blocks": [
    { "type": "section", "text": { "type": "mrkdwn", "text": "*You have a new match* — Chameleon Collective (92% fit)" } },
    { "type": "actions", "elements": [
      { "type": "button", "text": { "type": "plain_text", "text": "View in COS" }, "url": "https://cos-concept.vercel.app/firm/..." },
      { "type": "button", "text": { "type": "plain_text", "text": "Tell me more" }, "action_id": "match_detail" }
    ]}
  ]
}
```

---

### WhatsApp

**Tone:** Casual, warm, concise. This is someone's personal phone. Treat it accordingly.

**Format:**
- WhatsApp-native formatting only: `*bold*`, `_italic_`, `~strikethrough~`
- No markdown tables, no bullet lists with dashes (use line breaks instead)
- Max ~150 words per message — WhatsApp is mobile-first
- Emojis are natural here, use sparingly (1-2 per message max)
- Plain URLs only — no hyperlinked text (WhatsApp doesn't support it)
- Split long responses into 2 short messages rather than 1 long one

**What Ossy can do on WhatsApp:**
- Quick Q&A in natural language
- Match summaries (name + one-line fit reason + link)
- Simple yes/no confirmations ("Reply YES to send the intro")
- Status updates ("Your intro to Gamut Creative is pending their reply")
- Proactive notifications via approved templates

**What she redirects to the app for:**
- Anything requiring reading more than a paragraph
- All search / filtering / browsing
- Profile editing

**24-hour session window:**
- Within 24h of last user message: full freeform conversation
- After 24h silence: only approved Meta templates until user replies again
- Templates needed: `new_match_alert`, `intro_accepted`, `intro_declined`, `weekly_digest`, `re_engage`

**Example response style:**
```
Hey! 🎉 New match — *Chameleon Collective*
They're a strong fit for your brand transformation BD goals.

See the full profile here:
https://cos-concept.vercel.app/firm/chameleon-collective

Want a quick summary here or shall I save it for when you're at your desk?
```

**Example template (new_match_alert):**
```
{{1}} — you have a new match on COS! {{2}} looks like a strong fit.
Tap to view: {{3}}
```
Parameters: `[user_first_name, firm_name, deep_link]`

---

### Roam (ro.am)

**Tone:** Thoughtful, async-forward. Roam users are knowledge workers who appreciate depth and don't mind reading a bit more. Still concise but can be slightly richer than WhatsApp.

**Format:**
- Standard Markdown (Roam supports it)
- Can use numbered lists and headers for structured responses
- Medium length responses OK — Roam is async by nature, users will read at their pace
- Include context/reasoning briefly — this audience values it
- Link back to app with clear label

**What Ossy can do in Roam:**
- Everything in Slack, same capabilities
- Can go slightly deeper on explanations (Roam users expect async depth)
- Deliver async digests and intelligence summaries

**What she redirects for:**
- Same as Slack — any rich UI action goes back to the app

**Note on Events API (Alpha):**
The Roam Events API is in Alpha as of early 2026. Build defensively — wrap webhook handling in try/catch with graceful degradation, and monitor for breaking changes.

**Example response style:**
```
**Chameleon Collective — 92% match**

Why it fits: They specialise in creative transformation for mid-market brands, which maps directly to three of your stated BD priorities. Bidirectional — they've also signalled interest in firms like yours.

Last active: 3 days ago · 47 emails in network scan

[View full profile →](https://cos-concept.vercel.app/firm/chameleon-collective)

Want me to draft an intro message, or would you like to review their case studies first?
```

---

### Microsoft Teams

**Tone:** Professional, structured. Teams users are often in a corporate context — slightly more formal than Slack, clear and efficient.

**Format:**
- Full Markdown supported
- Use Adaptive Cards for action messages (Teams equivalent of Slack Block Kit)
- Responses can be a little longer than Slack — desktop-first audience
- Avoid emojis in body text (fine in notifications)
- Clear section headers for multi-part responses

**What Ossy can do in Teams:**
- Same capabilities as Slack
- Adaptive Cards with action buttons for intros, match confirmations

**What she redirects for:**
- Same as Slack

**Admin caveat (document in UI):**
In many corporate Teams environments, installing external apps requires IT admin approval. If a user can't connect, surface the message: *"Ask your IT admin to approve 'Ossy by COS' in the Microsoft Teams Admin Center, or have them enable app sideloading."*

**Example Adaptive Card (new match):**
```json
{
  "type": "AdaptiveCard",
  "body": [
    { "type": "TextBlock", "text": "New Match: Chameleon Collective", "weight": "Bolder", "size": "Medium" },
    { "type": "TextBlock", "text": "92% fit · Creative Transformation · Strong overlap with your BD strategy", "wrap": true }
  ],
  "actions": [
    { "type": "Action.OpenUrl", "title": "View in COS", "url": "https://cos-concept.vercel.app/firm/..." },
    { "type": "Action.Submit", "title": "Tell me more", "data": { "action": "match_detail", "firmId": "..." } }
  ]
}
```

---

## Architecture

### Database

#### `channel_connections` table

```typescript
export const channelConnections = pgTable("channel_connections", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").notNull(),
  platform: text("platform").notNull(), // "slack" | "whatsapp" | "roam" | "teams"

  // OAuth tokens
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at"),

  // Platform-specific identity
  platformUserId: text("platform_user_id"),   // Slack/Roam/Teams user ID
  platformChannelId: text("platform_channel_id"), // DM channel to send messages to
  platformTeamId: text("platform_team_id"),   // Slack workspace / Teams tenant

  // WhatsApp-specific
  phone: text("phone"),                        // E.164 format
  phoneVerified: boolean("phone_verified").default(false),
  whatsappOptIn: boolean("whatsapp_opt_in").default(false),

  // State
  status: text("status").default("active"),    // "active" | "disconnected" | "error"
  lastMessageAt: timestamp("last_message_at"),
  connectedAt: timestamp("connected_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  userPlatformIdx: uniqueIndex("channel_conn_user_platform_idx").on(t.userId, t.platform),
}));
```

#### `channel_messages` table (for cross-channel conversation history)

```typescript
export const channelMessages = pgTable("channel_messages", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(), // source channel
  role: text("role").notNull(),         // "user" | "assistant"
  content: text("content").notNull(),
  platformMessageId: text("platform_message_id"), // for deduplication
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

---

### API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/channels/connect/[platform]` | GET | OAuth initiation |
| `/api/channels/callback/[platform]` | GET | OAuth token exchange |
| `/api/channels/webhook/slack` | POST | Receive Slack events |
| `/api/channels/webhook/whatsapp` | POST | Receive WhatsApp messages |
| `/api/channels/webhook/roam` | POST | Receive Roam DM events |
| `/api/channels/webhook/teams` | POST | Receive Teams bot messages |
| `/api/channels/status` | GET | All connection statuses for UI |
| `/api/channels/disconnect` | POST | Remove a platform connection |
| `/api/channels/test/[platform]` | POST | Send a test "hello" message |
| `/api/channels/notify` | POST | Internal — send proactive push |

---

### Message Router

All inbound webhooks funnel through a shared `processChannelMessage()` function:

```typescript
interface ChannelMessage {
  userId: string;
  platform: "slack" | "whatsapp" | "roam" | "teams";
  content: string;
  platformMessageId: string;
}

async function processChannelMessage(msg: ChannelMessage): Promise<void> {
  // 1. Load user context (plan, org, current partnerships, recent matches)
  // 2. Load last N channel messages for conversation continuity
  // 3. Build system prompt with channel context layer (see below)
  // 4. Call Ossy AI (existing chat system)
  // 5. Format response for platform
  // 6. Send via platform-specific send function
  // 7. Store both user message and Ossy response in channel_messages
}
```

#### Channel context system prompt injection

```typescript
const CHANNEL_PROMPTS: Record<Platform, string> = {
  slack: `
CHANNEL: Slack (individual DM)
FORMAT: Slack Markdown — bold with *asterisks*, bullets, no headers. Use Block Kit actions for CTAs.
TONE: Professional, warm, direct. Colleagues talking at work.
LENGTH: Max 200 words. Bullets over paragraphs.
CAPABILITIES: Q&A, match summaries, intro confirmations, status updates, notifications.
APP REDIRECT: For full firm profiles, search, editing, or analytics — send a deep link and say "best viewed in the app".
DEEP LINK BASE: https://cos-concept.vercel.app
  `,
  whatsapp: `
CHANNEL: WhatsApp (personal mobile)
FORMAT: WhatsApp formatting only — *bold*, _italic_. No tables, no complex markdown. Plain URLs only.
TONE: Casual, warm, brief. This is someone's personal phone.
LENGTH: Max 100 words. Split into 2 messages if needed. 1-2 emojis max.
CAPABILITIES: Quick Q&A, match summaries, simple yes/no confirmations, status pings.
APP REDIRECT: Anything requiring more than a paragraph — send the link and suggest they open it when at their desk.
DEEP LINK BASE: https://cos-concept.vercel.app
  `,
  roam: `
CHANNEL: Roam (async-first messaging)
FORMAT: Standard Markdown. Headers and numbered lists fine.
TONE: Thoughtful, async-friendly. Users here appreciate a bit more depth and context.
LENGTH: Up to 300 words. Include brief reasoning where it adds value.
CAPABILITIES: Same as Slack, plus slightly richer summaries.
APP REDIRECT: Same rules as Slack — rich UI actions go back to the app.
DEEP LINK BASE: https://cos-concept.vercel.app
  `,
  teams: `
CHANNEL: Microsoft Teams (corporate messaging)
FORMAT: Teams Markdown. Use Adaptive Cards for action buttons.
TONE: Professional, structured. Slightly more formal than Slack.
LENGTH: Up to 250 words. Clear sections if multi-part.
CAPABILITIES: Same as Slack.
APP REDIRECT: Same rules as Slack.
DEEP LINK BASE: https://cos-concept.vercel.app
  `,
};
```

---

### Deep Link Reference

| User intent | Deep link |
|-------------|-----------|
| View a specific firm | `/firm/[firmId]` |
| See all matches | `/matches` |
| View a specific match | `/matches?highlight=[firmId]` |
| View a partnership | `/partnerships/[id]` |
| Opportunity board | `/opportunities` |
| Settings / integrations | `/settings/integrations` |
| Dashboard | `/dashboard` |

---

### Proactive Notification System

Ossy can push to connected channels without a user message triggering it. Called from background job handlers.

```typescript
// Called from e.g. the weekly-digest job or when a match is found
await sendChannelNotification({
  userId,
  type: "new_match",
  data: { firmId, firmName, fitScore },
});
```

**Notification types:**

| Type | Trigger | WhatsApp template | Slack/Roam/Teams |
|------|---------|-------------------|-----------------|
| `new_match` | Match found above threshold | `new_match_alert` | Block Kit / Adaptive Card with "View" button |
| `intro_accepted` | Partner accepts intro | `intro_accepted` | Message + deep link to partnership |
| `intro_declined` | Partner declines | `intro_declined` | Brief message, suggest alternative |
| `partnership_stale` | No touchpoint in 30d | `partnership_stale` | Nudge with link |
| `weekly_digest` | Cron — every Monday 9am | `weekly_digest` | Summary card with top actions |
| `opportunity_response` | Someone responds to opportunity | — | Alert with link |

**WhatsApp template examples:**

```
# new_match_alert
Hi {{1}}, you have a new match on COS — {{2}} ({{3}}% fit).
Tap to view: {{4}}

# intro_accepted
Great news {{1}} — {{2}} accepted your intro request!
Continue the conversation: {{3}}

# weekly_digest
Your COS weekly roundup:
• {{1}} new matches
• {{2}} active partnerships
• {{3}} open opportunities
See it all here: {{4}}
```

---

## Settings UI

### Location
New section in `/settings` nav: **"Ossy Anywhere"** with `MessageSquare` icon.

Route: `/settings/integrations`

### Page layout

```
┌──────────────────────────────────────────────────────────┐
│  Ossy Anywhere                                           │
│  Talk to Ossy from the tools you already use.           │
│  She'll always bring you back to COS for the deep stuff. │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────────────────┐  ┌─────────────────────────┐   │
│  │  #  Slack           │  │  💬 WhatsApp             │   │
│  │                     │  │                         │   │
│  │  ✓ Connected        │  │  Not connected          │   │
│  │  your-workspace     │  │                         │   │
│  │  Last: 2h ago       │  │  [Connect WhatsApp]     │   │
│  │                     │  │                         │   │
│  │  [Test] [Disconnect]│  │                         │   │
│  └─────────────────────┘  └─────────────────────────┘   │
│                                                          │
│  ┌─────────────────────┐  ┌─────────────────────────┐   │
│  │  ◎  Roam            │  │  ⊞  Microsoft Teams      │   │
│  │                     │  │                         │   │
│  │  Not connected      │  │  Not connected          │   │
│  │                     │  │  ⚠ May need IT approval │   │
│  │  [Connect Roam]     │  │                         │   │
│  │                     │  │  [Connect Teams]        │   │
│  └─────────────────────┘  └─────────────────────────┘   │
│                                                          │
│  Privacy: Ossy only reads messages sent directly         │
│  to her. No channel history is accessed.                 │
└──────────────────────────────────────────────────────────┘
```

### Connection card states
- **Not connected** — platform logo, description, connect button
- **Pending (WhatsApp)** — phone entered, awaiting OTP verification
- **Connected** — platform name, account identifier, last active, Test + Disconnect buttons
- **Error** — reconnect prompt with error reason

### Test connection
Hitting "Test" sends a friendly message to that channel:
> *"👋 Ossy here. Your connection is working — you can talk to me here anytime. What would you like to explore?"*

---

## Per-Platform Setup Requirements

### Slack
- Create Slack app at `api.slack.com/apps`
- Scopes: `chat:write`, `im:write`, `im:history`, `users:read`
- Enable Events API, subscribe to `message.im`
- Set Request URL to `https://cos-concept.vercel.app/api/channels/webhook/slack`
- **Env vars:** `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`, `SLACK_BOT_TOKEN`

### WhatsApp
- Meta Business account + verification (can take 1–5 days)
- Dedicated phone number registered as WhatsApp Business
- Create approved message templates in Meta Business Manager (see Notification System above)
- Webhook: `https://cos-concept.vercel.app/api/channels/webhook/whatsapp`
- **Env vars:** `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`

### Roam
- Create app at `developer.ro.am`
- Request personal access + `chat:message:dm` event subscription
- Webhook: `https://cos-concept.vercel.app/api/channels/webhook/roam`
- **Env vars:** `ROAM_CLIENT_ID`, `ROAM_CLIENT_SECRET`, `ROAM_SIGNING_SECRET`
- Note: Events API is in Alpha — monitor for breaking changes

### Microsoft Teams
- Azure Portal → App registrations → New registration
- Bot Framework registration (Azure Bot Service)
- Scopes: `ChatMessage.Send`, `Chat.ReadWrite` (personal scope)
- Messaging endpoint: `https://cos-concept.vercel.app/api/channels/webhook/teams`
- **Env vars:** `TEAMS_APP_ID`, `TEAMS_APP_PASSWORD`, `TEAMS_TENANT_ID`

---

## Build Order

1. **Settings UI** — `/settings/integrations` page with all four connection cards (static shell first, wire up as each platform is built)
2. **Schema** — `channel_connections` + `channel_messages` tables, drizzle push
3. **Slack** — OAuth + Events API webhook + message router + channel prompt layer
4. **Roam** — OAuth + webhook (similar pattern to Slack, minimal delta)
5. **Teams** — Azure Bot registration + Adaptive Cards
6. **WhatsApp** — Meta verification + phone OTP + template setup (do last due to external dependency on Meta approval timeline)
7. **Proactive notifications** — `sendChannelNotification()` utility + wire into existing job handlers (weekly-digest, graph-sync, etc.)

---

## Future Extensions

- **Voice via WhatsApp** — WhatsApp supports audio message sending; Ossy could respond with an ElevenLabs voice note for a premium tier
- **Ossy in Slack Huddles** — Deepgram STT + Ossy responding in a Slack huddle channel
- **Smart quiet hours** — User sets "don't push to WhatsApp after 7pm", Ossy queues to next morning
- **Cross-channel read receipts** — If user reads a notification on web, don't send it to Slack too
- **Meeting detection** — If Teams/Roam detects user in a meeting, hold non-urgent Ossy messages

---

## Env Vars Summary

```bash
# Slack
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_SIGNING_SECRET=
SLACK_BOT_TOKEN=

# WhatsApp (Meta)
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=

# Roam
ROAM_CLIENT_ID=
ROAM_CLIENT_SECRET=
ROAM_SIGNING_SECRET=

# Microsoft Teams
TEAMS_APP_ID=
TEAMS_APP_PASSWORD=
TEAMS_TENANT_ID=
```
