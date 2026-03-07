# COS CONCEPT — Collective OS Architecture Plan

## Context

COS CONCEPT is a growth platform for professional services firms (agencies, consultancies, fractional leaders) that replaces broken business development with partnership-driven growth. The platform combines a massive knowledge graph, AI-powered matching, conversational UX, voice agents, call intelligence, and an email agent into a single operating system for partnership-led growth.

**Builder:** Solo developer + Claude AI
**Hosting:** Vercel
**Brand:** Collective OS — "Grow Faster Together"

---

## 1. Recommended Tech Stack

### Core Application
| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Framework** | Next.js 15 (App Router) | Vercel-native, SSR/SSG, API routes, streaming support |
| **Language** | TypeScript | Type safety across full stack |
| **Styling** | Tailwind CSS 4 | Utility-first, design tokens via `cos-` prefix |
| **UI Components** | shadcn/ui + Radix | Accessible, composable, no vendor lock-in |
| **Icons** | Lucide React | Consistent, lightweight |
| **Validation** | Zod | Runtime + compile-time schema validation |

### Databases
| Database | Technology | Purpose |
|----------|-----------|---------|
| **Graph DB** | Neo4j Aura | Knowledge graph — nodes, edges, path traversal, relationship queries |
| **Relational DB** | Neon PostgreSQL | Auth, sessions, user accounts, org settings, job queues, structured data |
| **Vector Store** | pgvector (on Neon) | Embeddings for semantic search, abstraction layer vectors |
| **Cache** | Upstash Redis | Session cache, rate limiting, real-time features |

### AI / LLM (Multi-Model Strategy)
| Use Case | Model | Rationale |
|----------|-------|-----------|
| **Conversational UX (Ossy chat)** | Claude Sonnet | Best conversational quality, streaming |
| **Voice agent (Ossy voice)** | Claude Sonnet via Vercel AI SDK | Same brain, voice I/O layer on top |
| **Deep matching (final ranking)** | Gemini 2.0 Flash/Pro | Large context window (1M+), cost-effective for big comparisons |
| **Classification/tagging** | Gemini 2.0 Flash or Haiku | Cheap, fast, good enough for structured extraction |
| **Embeddings** | OpenAI text-embedding-3-small | Best quality/cost ratio for vector search |
| **Call transcription** | Deepgram Nova-3 | Real-time streaming transcription, speaker diarization, best accuracy/cost |
| **Voice synthesis (Ossy speaks)** | ElevenLabs or Deepgram Aura | Natural-sounding voice for the AI consultant |
| **Voice input (user speaks)** | Deepgram Nova-3 (streaming) | Real-time speech-to-text for voice conversations |
| **Image/logo recognition** | Claude Sonnet (vision) | Client logo identification from agency websites |
| **Bio generation** | Claude Sonnet | Interview-style expert bio creation |
| **Opportunity extraction** | Claude Sonnet | Structured opportunity parsing from transcripts |

**Cost Gateway:** Central `src/lib/ai/gateway.ts` routes all AI calls through a single layer that logs model, tokens, cost, and purpose. Admin dashboard shows spend by model and feature.

### Voice & Call Intelligence
| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Voice conversations with Ossy** | Vercel AI SDK + WebRTC/WebSocket | Real-time voice chat in browser |
| **Speech-to-text (user input)** | Deepgram Nova-3 streaming API | Live transcription of user's voice |
| **Text-to-speech (Ossy output)** | ElevenLabs / Deepgram Aura TTS | Ossy speaks responses aloud |
| **Call recording (meetings)** | Chrome extension (Manifest V3) | Captures audio from any browser-based meeting (Zoom web, Google Meet, Teams web) |
| **Call transcription** | Deepgram Nova-3 | Transcribes recorded meetings with speaker diarization |
| **Meeting bot (future)** | Recall.ai API | Joins Zoom/Meet/Teams as bot participant (Phase 6+) |

### Infrastructure & Integtic
| Service | Technology | Purpose |
|---------|-----------|---------|
| **Auth** | NextAuth.js v5 (Auth.js) | Google, LinkedIn, email/magic-link auth |
| **Background Jobs** | Inngest | Durable serverless functions — scraping, enrichment, matching, email |
| **File Storage** | Vercel Blob | Logos, audio, documents, profile images |
| **Email (Ossy agent)** | Nylas API or Google Workspace API | Send/receive/parse emails for ossy@joincollectiveos.com |
| **Web Scraping** | Jina Reader API | Structured content extraction from agency websites |
| **LinkedIn Enrichment** | Proxycurl API | Work history, company data from LinkedIn URLs |
| **Real-time Messaging** | Ably or Pusher | Platform messaging between firms |
| **Monitoring** | Vercel Analytics + Sentry | Performance, errors, usage |
| **Deployment** | Vercel (git push) | Auto-deploy from main branch |

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        VERCEL EDGE                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐   │
│  │ Next.js  │  │ API      │  │ Inngest  │  │ WebSocket/    │   │
│  │ Pages    │  │ Routes   │  │ Functions│  │ WebRTC (Voice)│   │
│  └──────────┘  └──────────┘  └──────────┘  └───────────────┘   │
└─────────────────────────┬───────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
   ┌────▼────┐     ┌──────▼──────┐   ┌─────▼─────┐
   │  Neon   │     │  Neo4j      │   │ Upstash   │
   │ Postgres│     │  Aura       │   │ Redis     │
   │+pgvector│     │ (Graph DB)  │   │ (Cache)   │
   └─────────┘     └─────────────┘   └───────────┘
        │
   ┌────▼────┐
   │ Vercel  │
   │  Blob   │
   │(Storage)│
   └─────────┘

External Services:
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ Deepgram │ │ Jina     │ │Proxycurl │ │ Nylas    │ │ElevenLabs│
│(Voice/   │ │(Scraping)│ │(LinkedIn)│ │(Email)   │ │(TTS)     │
│ Transcr.)│ │          │ │          │ │          │ │          │
└──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘

┌──────────┐ ┌──────────┐ ┌──────────┐
│ Claude   │ │ Gemini   │ │ OpenAI   │
│(Convo/   │ │(Matching/│ │(Embeddin-│
│ Voice AI)│ │ Ranking) │ │  gs)     │
└──────────┘ └──────────┘ └──────────┘

Chrome Extension:
┌─────────────────────────┐
│ COS Call Capture (MV3)  │
│ - Captures meeting audio│
│ - Streams to Deepgram   │
│ - Sends transcript to   │
│   COS API for analysis  │
└─────────────────────────┘
```

---

## 3. Data Model Overview

### Neon PostgreSQL (Prisma ORM)
Handles: auth, sessions, org management, billing, job logs, platform settings, messaging, file metadata

**Key tables:**
- `users` — auth accounts (email, OAuth provider refs)
- `organizations` — platform member firms (claimed profiles, settings, subscription)
- `org_members` — users ↔ organizations (roles: owner, admin, member)
- `partner_preferences` — the "dating profile" (8 preference dimensions from onboarding prompt)
- `partnership_requests` — pipeline stages (new_match → in_conversation → requested → accepted)
- `partnerships` — active trusted partner relationships
- `collectives` — group partnership containers
- `vendor_networks` — one-directional partner visibility groups
- `opportunities` — structured opportunities shared between partners
- `messages` — platform messaging
- `conversations` — conversation threads
- `call_recordings` — metadata for recorded calls (transcript ref, participants, duration)
- `call_transcripts` — full transcription text + structured analysis
- `email_threads` — Ossy email conversations
- `abstraction_profiles` — hidden normalized data derived from content (embeddings stored via pgvector)
- `ai_model_registry` — which models used where + cost tracking
- `ai_usage_log` — per-call logging of model, tokens, cost, feature
- `expert_profiles` — the "player card" profiles (multiple per expert)
- `scrape_jobs` — website scraping job tracking
- `onboarding_sessions` — conversational onboarding state

### Neo4j Aura (Knowledge Graph)
Handles: entity relationships, path queries, matching traversals, social graph

**Nodes** (as specified in knowledge graph design):
- `ServiceFirm` — with partnership logic attributes
- `Expert` — with response_velocity, years_experience
- `Client` — lightweight (name, domain, industry, size, revenue)
- `Project` — commercial truth (contract_value_range, verified_payment)
- `CaseStudy` — with challenge_embedding, solution_embedding, outcome_metrics
- `Skill` — 3-level hierarchy (L1 → L2 → L3, 18,421 skills)
- `Industry` — sector taxonomy with synonyms
- `Market` — geographic taxonomy with synonyms

**Edges** (as specified):
- Commercial: DELIVERED_PROJECT, BENEFITED_FROM, HAS_CASE_STUDY, IS_EXPERT_ON
- Trust: EMPLOYED_BY, POSSESSES_SKILL, OFFERS_SERVICE
- Social: COMMUNICATES_WITH, CONNECTED_TO, TRUSTS/ENDORSES
- Preference: SEEKS_PARTNER_TYPE, PREFERS_INDUSTRY, AVOIDS/BLOCKS

**Super-Edges** (computed at query time):
- Trust Path: user → COMMUNICATES_WITH → person → EMPLOYED_BY → firm
- Capability Path: firm → DELIVERED_PROJECT → client(industry) → skill

### pgvector (on Neon)
- `abstraction_embeddings` — normalized vector representations of firms, experts, case studies
- Used as Layer 2 in the cascading search (between structured filters and LLM ranking)

---

## 4. Voice & Call Architecture

### 4A. Voice Conversations with Ossy (In-Browser)

Users can talk to Ossy by voice instead of typing. This uses a real-time voice pipeline:

```
User speaks → Browser mic capture (MediaRecorder API)
  → WebSocket stream to API route
  → Deepgram Nova-3 (streaming STT, real-time transcription)
  → Transcribed text sent to Claude Sonnet (via Vercel AI SDK)
  → Claude response streamed back
  → ElevenLabs/Deepgram Aura (TTS, streams audio)
  → Audio plays in browser via Web Audio API
```

**Key technical decisions:**
- Use Vercel AI SDK's `useChat` hook extended with voice I/O
- WebSocket connection for real-time streaming (not REST)
- Deepgram's streaming API for <300ms latency on transcription
- TTS streams audio chunks as they're generated (no waiting for full response)
- Visual: show waveform/indicator while Ossy is speaking
- Fallback: always support text chat alongside voice

**Use cases for voice:**
- Onboarding interview ("Tell me about your firm...")
- Expert bio builder (interview mode)
- Quick opportunity sharing ("I just had a call with...")
- Partnership coaching post-call review
- General Ossy consultation

### 4B. Call Recording & Transcription (Chrome Extension)

**Chrome Extension (Manifest V3):**
- Captures tab audio using `chrome.tabCapture` API
- Works on: Google Meet, Zoom (web), Microsoft Teams (web), any browser-based meeting
- User clicks "Start Recording" in extension popup
- Audio streamed to Deepgram for real-time transcription
- Extension sends transcript + metadata to COS API when call ends
- Stores: full transcript, speaker diarization, call duration, participants (if detectable)

**Post-Call Processing (Inngest workflow):**
1. Call ends → transcript saved to `call_transcripts` table
2. Inngest job triggers analysis pipeline:
   - **Opportunity extraction:** Claude identifies opportunities mentioned in the call
   - **Coaching analysis:** Talking time ratio, value prop clarity, key topics covered
   - **Partner recommendations:** Based on topics discussed, suggest partners or case studies
   - **Action items:** Extract follow-ups, next steps, commitments
3. Results saved and surfaced in Ossy chat: "I noticed 3 opportunities from your call with..."

### 4C. Future: Meeting Bot (Phase 6+)
- Recall.ai API to join meetings as a bot participant
- Works for desktop Zoom/Teams apps (not just browser)
- Bot named "Ossy" joins the call, records, transcribes
- Same post-call pipeline as Chrome extension

---

## 5. Cascading Search & Matching Architecture

### The Abstraction Layer
Every firm, expert, and case study gets a hidden normalized profile:
1. **On content change** (new case study, client added, etc.): Inngest job runs lightweight model (Gemini Flash) to extract structured tags (skills, industries, client types, signals)
2. **Periodic rebuild** (weekly): Full re-computation across all entities to catch drift
3. **Embedding generation**: Abstraction profile → OpenAI embedding → stored in pgvector
4. Tags stored in Neo4j as edges (OFFERS_SERVICE, etc.)

### Search Flow (3 Layers)
```
User query: "I need a Shopify partner in APAC that works with enterprise retail"

Layer 1: Structured Filter (PostgreSQL + Neo4j)
  → Geography = APAC
  → Skill includes "Shopify" or "eCommerce"
  → Client size includes "Enterprise"
  → Result: ~500 firms
  Cost: ~$0 (database queries)

Layer 2: Vector Similarity (pgvector)
  → Embed the query
  → Cosine similarity against abstraction embeddings of 500 firms
  → Rank by relevance score
  → Top 50 results
  Cost: ~$0.001 (one embedding call)

Layer 3: LLM Deep Ranking (Gemini Pro)
  → Send top 50 firm abstractions + user preferences + query context
  → LLM produces ranked list with explanations ("why this match")
  → Considers bidirectional fit (does the firm also want what the user offers?)
  → Uses firm-relationships.csv data for symbiotic relationship signals
  → Top 10-15 results returned
  Cost: ~$0.01-0.05 per search
```

### Matchmaking (Proactive)
Same pipeline but triggered automatically:
- New firm completes onboarding → generate matches
- Firm updates preferences → regenerate matches
- New case study added → recalculate relevant matches
- Uses firm-relationships.csv to weight symbiotic firm types higher

---

## 6. Key Technical Challenges & Solutions

### Challenge 1: Matching Quality
**Problem:** Past attempts had poor search/matching results.
**Solution:**
- Abstraction layer normalizes all content into comparable structured data
- Bidirectional matching (both parties must want what the other offers)
- Firm relationships matrix (346 rows) provides domain knowledge about which firm types naturally partner
- Persona positioning data helps Ossy present matches in the right context
- Ground truth weighting: actual work history > self-description
- Continuous feedback loop: track which matches lead to partnerships, retrain

### Challenge 2: Cost at Scale (1.5M+ firms)
**Problem:** LLM calls for every firm would cost millions.
**Solution:**
- Cascading search: 99% filtered before LLM touches data
- Batch processing: abstraction layer computed by Inngest jobs (not real-time)
- Model selection: cheapest model that can do the job (classification → Flash, matching → Pro, conversation → Sonnet)
- Jina for web scraping (not LLM)
- Proxycurl for LinkedIn (not scraping)
- Caching: popular search patterns cached in Redis
- AI cost gateway tracks every call

### Challenge 3: Onboarding Friction
**Problem:** Too much info needed before first value.
**Solution:**
- Pre-populated profiles from global database (we already have data on them)
- Website scraping auto-fills services, case studies, clients
- Proxycurl imports work history from LinkedIn URL
- LinkedIn CSV upload for social graph
- Conversational onboarding (Ossy asks questions one at a time, voice or text)
- Progressive disclosure: get basic preferences first, enrich over time

### Challenge 4: Voice Latency
**Problem:** Voice conversations need to feel natural (<1s response time).
**Solution:**
- Streaming everything: STT streams words as spoken, LLM streams response, TTS streams audio
- Deepgram Nova-3 has <300ms first-word latency
- ElevenLabs streaming TTS starts speaking before full response is generated
- Use interruption detection: if user starts talking, stop Ossy's audio
- WebSocket for real-time bidirectional communication

---

## 7. Reference Data (Ingested)

All stored in `C:\Claude Projects\COS CONCEPT\data\`:

| File | Description | Rows |
|------|------------|------|
| `persona-positioning.csv` | Pitch positioning by role × firm size | ~190 |
| `firm-relationships.csv` | Symbiotic relationships between firm types | 346 |
| `categories.csv` | 30 firm categories with definitions | 31 |
| `skills-L1.csv` | L1→L2 skill mapping | 247 |
| `skills-L2-map.csv` | L2 skill categories | 247 |
| `skills-L3-map.csv` | L2→L3 granular skills | 18,421 |

---

## 8. Build Phases

### Phase 0: Project Scaffold (Week 1)
- Initialize Next.js 15 project with TypeScript, Tailwind, shadcn/ui
- Set up Neon PostgreSQL + Prisma
- Set up Neo4j Aura (free tier to start)
- NextAuth.js with Google + email auth
- Vercel deployment pipeline (git push → auto-deploy)
- Design system: colors, typography, `cos-` token prefix
- Basic layout shell with chat-first interface skeleton

### Phase 1: Ossy Chat Core (Weeks 2-3)
- Vercel AI SDK integration with Claude Sonnet
- Chat UI: full-screen conversational interface
- Chat persistence (conversation history in Neon)
- Ossy personality/system prompt with brand voice
- Voice input/output for Ossy conversations (Deepgram STT + ElevenLabs TTS)
- Basic voice toggle in chat UI (mic button, speaker indicator)
- Streaming responses (text + audio)
- **Deliverable:** User can sign up and have a text or voice conversation with Ossy

### Phase 2: Organization & Expert Profiles (Weeks 4-6)
- Prisma schema for organizations, experts, users, org_members
- Organization CRUD (claim existing / create new)
- Expert profile CRUD with multiple "player cards"
- Profile visibility controls (private / partners / public)
- Website scraping pipeline (Jina → Inngest job → structured data)
- Proxycurl integration for work history import
- LinkedIn CSV upload for connections
- AI Bio Builder (conversational interview via Ossy)
- Logo upload to Vercel Blob
- **Deliverable:** Firms can create/claim profiles, experts can build player cards (via chat or forms)

### Phase 3: Knowledge Graph Population (Weeks 7-9)
- Neo4j schema: all nodes and edges from the design
- Ingest skills taxonomy (L1/L2/L3 → Skill nodes)
- Ingest firm categories + specializations
- Ingest firm relationships matrix (→ edge weights for matching)
- Global firm database import pipeline (bulk Neo4j import)
- Global client database structure
- Client logo recognition pipeline (vision model for agency websites)
- Website re-crawl scheduler (Inngest cron)
- Case study ingestion and linking
- **Deliverable:** Knowledge graph populated with global data, queryable

### Phase 4: Search & Matching Engine (Weeks 10-13)
- Abstraction layer computation pipeline (Inngest + Gemini Flash)
- Embedding generation (OpenAI → pgvector)
- Cascading search: Layer 1 (structured) → Layer 2 (vector) → Layer 3 (LLM)
- Bidirectional matching logic
- Match explanation generation ("Here's why we think they're a fit")
- Trading card UI component for partner previews
- Ossy-integrated matching ("Show me partners for Shopify in APAC")
- Dynamic profile highlighting (show attributes most relevant to the viewer)
- AI cost gateway + admin dashboard
- **Deliverable:** Users can search for and discover partners with high-quality results

### Phase 5: Partnerships & Opportunities (Weeks 14-16)
- Conversational onboarding flow (8 preference areas from the prompt)
- Partnership pipeline: New Match → In Conversation → Requested → Trusted Partner
- Collective creation and management
- Vendor network (one-directional visibility)
- Platform messaging (lightweight)
- Three-way intro emails via Ossy email agent (Nylas)
- Opportunity extraction from call transcripts (Claude)
- Structured opportunity sharing between trusted partners
- Visibility controls for case studies and experts (private / partners / public)
- **Deliverable:** Full partnership lifecycle from discovery to collaboration

### Phase 6: Call Intelligence & Chrome Extension (Weeks 17-19)
- Chrome extension (Manifest V3) for call recording
- Tab audio capture → Deepgram streaming transcription
- Post-call analysis pipeline (Inngest): opportunities, coaching, action items
- Call coaching report: talking time, value prop analysis, recommendations
- Ossy post-call debrief in chat ("I noticed 3 opportunities from your call...")
- Calendar invite detection (Ossy CC'd → triggers recording)
- **Deliverable:** Users can record calls and get AI-powered coaching + opportunity detection

### Phase 7: Ossy Email Agent (Weeks 20-21)
- ossy@joincollectiveos.com email setup (Nylas/Google Workspace)
- Email send/receive/parse pipeline
- Three-way partnership introductions via email
- Email response understanding (classify intent, extract action items)
- CC'd email monitoring
- **Deliverable:** Ossy operates outside the platform via email

### Phase 8: Advanced Features (Weeks 22+)
- Social graph analysis (LinkedIn CSV → relationship mapping)
- Meeting bot via Recall.ai (joins Zoom/Teams/Meet as participant)
- Advanced voice agent improvements (interruption handling, multi-turn voice)
- Global client database enrichment pipeline
- Admin dashboard: AI costs, matching quality metrics, user analytics
- Onboarding analytics: conversion funnel, time-to-first-match
- Advanced coaching: pattern recognition across multiple calls
- Collective analytics and reporting

---

## 9. Canonical Enums (from reference data)

### Partner Types
Fractional / Interim, Staff Augmentation, Embedded Teams, Boutique Agency, Project Based Consulting Firms, Managed Service Providers, Advisory Firms, Global Consulting Firms, Freelancer Network, Agency Collectives

### Partner Sizes
Individual Experts, Micro (1-10), Small (11-50), Emerging (51-200), Mid Sized (201-500), Upper Middle Market (501-1000), Large Enterprise (1001-5000), Major Enterprise (5001-10000), Global Corporation (10000+)

### Project Size Ranges
$1K-$10K, $10K-$50K, $50K-$100K, $100K-$500K, $500K-$1M, $1M+

### Firm Categories (30)
See `data/categories.csv` for full list with definitions and themes

### Skills Taxonomy
- L1: 30 categories (Administration → Transportation)
- L2: 247 sub-categories
- L3: 18,421 specific skills
See `data/skills-L1.csv`, `data/skills-L2-map.csv`, `data/skills-L3-map.csv`

---

## 10. Verification Strategy

### Per-Phase Testing
- **Phase 0:** Vercel deployment works, auth flow complete, chat renders
- **Phase 1:** Voice + text conversation with Ossy, messages persist, voice latency <1s
- **Phase 2:** Create org, claim profile, import LinkedIn work history, build expert player card
- **Phase 3:** Query Neo4j for firm → skill → case study paths, verify data integrity
- **Phase 4:** Search returns relevant results, matching is bidirectional, cost per search <$0.10
- **Phase 5:** Full partnership lifecycle, opportunity sharing works, intro emails send
- **Phase 6:** Chrome extension captures audio, transcription accurate, coaching report generated
- **Phase 7:** Ossy sends/receives emails, understands responses

### Key Metrics to Track
- Match-to-partnership conversion rate
- Time to first value (onboarding → first match)
- Search result quality (user feedback / click-through)
- AI cost per user per month
- Voice conversation latency (target <1s response)
- Call coaching accuracy (user ratings)
