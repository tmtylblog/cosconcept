# COS CONCEPT — Product Vision & Component Design

## What Is Collective OS?

Collective OS is a growth platform for professional services firms (agencies, consultancies, fractional leaders) that replaces broken business development with partnership-driven growth. It combines:

1. A massive **knowledge graph** of the professional services landscape
2. **AI-powered matching** between firms that should partner
3. A **conversational AI consultant** named Ossy (text + voice)
4. **Call intelligence** (recording, transcription, coaching)
5. An **email agent** (ossy@joincollectiveos.com)
6. **Partnership lifecycle management** (discovery → collaboration)

The core insight: professional services firms grow faster through partnerships than cold outreach, but finding the right partners is hard. Collective OS solves this by knowing more about the landscape than any individual firm could, and using AI to surface the right connections.

---

## 1. Organizations / Service Firms

### Global Database (Two-Tier System)
The platform maintains a global database of professional services firms. Target: **1.5 million+ firms** worldwide.

**Tier 1 — Global Database (unclaimed profiles):**
- Basic info scraped from websites, LinkedIn, public sources
- Used as the "universe" for matching
- Firms exist in the system before they know about the platform
- Lightweight profiles: name, website, description, category, location, estimated size

**Tier 2 — Platform Members (claimed profiles):**
- Firms that have signed up and claimed their profile
- Full onboarding interview completed with Ossy
- Rich data: partnership preferences, case studies, expert profiles, work history
- Can search, match, and form partnerships

### Website Scraping & Auto-Population
When a firm joins (or when we build the global database):
1. **Jina Reader API** scrapes their website for structured content
2. Extract: services offered, case studies, client logos, team members, contact info
3. Auto-classify into our 30 firm categories (using `data/categories.csv`)
4. Map extracted services to our skills taxonomy (L1/L2/L3)
5. **Periodic re-crawl** to keep data fresh (Inngest cron jobs)

### Client Ingestion from Firm Websites
When scraping agency websites, look for client logos and case study mentions:
- Use **Claude Sonnet vision** to identify client logos from agency portfolio pages
- Match logos/names to our global Client database
- Create DELIVERED_PROJECT edges in Neo4j
- This is "ground truth" — actual client relationships, not self-reported

### Partnership Preferences (The "Dating Profile")
After onboarding, each firm has preferences across 8 dimensions (see ONBOARDING-PROMPT.md):
1. Service offerings & capabilities
2. Industry & vertical focus
3. Geographic markets
4. Ideal partner profile
5. Client profile & deal size
6. Partnership model preferences
7. Values & working style
8. Growth goals

These preferences drive the matching engine's bidirectional scoring.

### Cost Consciousness
- Use Jina for scraping (not LLM calls) — already have API key
- Use Proxycurl for LinkedIn data (not scraping) — already have API license
- Cascading search ensures LLM only touches a tiny fraction of firms
- Background jobs (Inngest) for all heavy processing, not real-time

---

## 2. Experts

### Who Are Experts?
Experts are individual professionals associated with firms:
- **Employees** — full-time staff at an agency/consultancy
- **Freelancers** — independent contractors
- **Fractional Leaders** — part-time executive roles (fractional CMO, CTO, etc.)
- **Contractors** — project-based external talent

### Player Card Profiles
Each expert can have **multiple "player card" profiles** — different versions of themselves for different contexts:
- One player card for "Shopify expert"
- Another for "D2C growth strategist"
- Different visibility settings per card (public, partners only, private)

### AI Bio Builder
Ossy can interview experts to build their bios:
- Conversational interview (text or voice)
- Asks about experience, specialties, notable projects
- Generates professional bio in the expert's voice
- Expert can edit and approve
- Creates multiple player card variants based on the interview

### Work History Import
- **Proxycurl API** — import work history from LinkedIn URL
- Creates employment timeline (EMPLOYED_BY edges in Neo4j)
- Maps past companies to ServiceFirm or Client nodes
- Extracts skills and industries from job descriptions

### Skills, Languages & Markets
- **Skills:** Assigned from the 3-level taxonomy (18,421 L3 skills)
  - Can be self-reported or inferred from work history
  - Linked via POSSESSES_SKILL edges
- **Languages:** Proficiency levels (native, fluent, professional, conversational, basic)
- **Markets:** Geographic experience (OPERATES_IN edges to Market nodes)

### Voice Agent Interview Mode
When building expert profiles via voice:
- Ossy conducts a natural interview
- Captures responses via Deepgram streaming STT
- Generates structured profile data from conversation
- "Tell me about the most interesting project you've worked on..."
- Creates player card drafts for expert approval

---

## 3. Company / Client Database

### Design Philosophy
- **Lightweight** — clients are connecting nodes, not heavy profiles
- **Platform-owned** — no single firm owns a client record
- **Global** — the same client appears once, linked to all firms that served them
- **Suggest-only changes** — firms can suggest edits but can't directly modify

### Why Clients Matter
Clients are the connecting tissue in the knowledge graph:
- "You both worked with Nike? Your services are complementary."
- "This firm has delivered 5 projects for enterprise retailers — they know that space."
- Client industry/size drives matching signals
- Client overlap between firms suggests natural partnership potential

### Deduplication
- Primary key: website domain (prevents duplicates)
- Name matching with fuzzy logic for edge cases
- Platform admin reviews suggested edits

---

## 4. Projects

### Commercial Truth
Projects represent actual work delivered. They're the most honest data in the system because they represent real commercial relationships.

**Key attributes:**
- Which firm delivered the project
- Which client received it
- What skills/services were involved
- What was the contract value range
- Was payment verified
- What was the outcome

### Why Projects Matter
- Ground truth for capability claims: "They SAY they do Shopify, but have they actually delivered Shopify projects?"
- Revenue validation: verified payment data proves real client relationships
- Skill inference: project skills supplement self-reported expertise
- Creates DELIVERED_PROJECT and BENEFITED_FROM edges in the knowledge graph

---

## 5. Case Studies

### What They Are
Published success stories that firms attach to their profiles. More detailed than projects — they include the challenge, solution, and outcome narrative.

### Visibility Controls
Three levels:
- **Public** — visible to everyone (used for marketing/discovery)
- **Partners only** — visible to trusted partners
- **Private** — only visible to the firm itself (internal documentation)

### AI Processing
When case studies are added:
- Challenge/solution/outcome text gets embedded (vector representations)
- Skills are extracted and mapped to our taxonomy
- Industry/market tags are inferred
- Used in matching: "This firm solved a similar challenge to what you described"

---

## 6. Trusted Partners & Collectives

### Partnership Types

**Trusted Partner (1:1 Mutual)**
- Two firms formally acknowledge each other as trusted partners
- Bidirectional — both must accept
- Unlocks: shared visibility, opportunity sharing, deeper profile access
- Pipeline: New Match → In Conversation → Requested → Accepted → Trusted Partner

**Collective (1:Many)**
- One firm creates a collective and invites others
- Like a holding company or alliance structure
- Shared branding, shared pipeline, shared resources
- All members can see each other's full profiles and experts

**Vendor Network (1:Many, One-Directional)**
- One firm maintains a curated list of vendors/subcontractors
- One-directional visibility — the managing firm sees vendor profiles, not vice versa
- Used for: "Here are the 15 development shops I trust for subcontracting"
- Vendors may not even know they're in someone's vendor network

### Partnership Pipeline
Stages a potential partnership moves through:
1. **New Match** — AI surfaces the match, neither party has acted
2. **In Conversation** — one or both parties are exploring (via Ossy or messaging)
3. **Requested** — one party formally requests trusted partner status
4. **Accepted** — both parties agree → becomes Trusted Partner
5. **Declined** — one party declines (can be revisited later)

### Dynamic Profiles
When Firm A views Firm B's profile, the display is dynamically customized:
- Highlights services most relevant to Firm A's needs
- Shows case studies in industries Firm A cares about
- Surfaces shared clients or connections
- Different emphasis based on what Firm A is looking for

### Three-Way Intro Emails
When Ossy recommends a partnership, it can send a three-way introduction email:
- Ossy (ossy@joincollectiveos.com) introduces both firms
- Explains why they might be a good fit
- Provides context about each firm
- Tracks whether the email leads to a conversation

### Call Coaching
After a partnership call is recorded and transcribed:
- Talking time ratio analysis (who dominated the conversation?)
- Value proposition clarity scoring
- Key topics covered vs. recommended topics
- Suggestions for follow-up
- "You spent 80% of the call talking about your services — next time, try asking more about their client base"

---

## 7. Opportunity Management

### No Public Boards
Unlike traditional platforms, COS does NOT have public opportunity/project boards. Reasons:
- Creates race-to-the-bottom dynamics
- Favors firms that check the platform constantly
- Doesn't leverage the relationship layer

### AI-Powered Opportunity Extraction
Instead, opportunities are extracted by AI from natural interactions:
- **Call transcripts:** "We had a prospect ask about Shopify development — that's not our thing"
- **Chat with Ossy:** "I just had a call and they need help with SEO"
- **Email monitoring:** Ossy detects opportunity signals in CC'd emails

### Hidden Opportunity Detection
Ossy watches for signals that someone might have an opportunity:
- Language patterns in calls/chats that indicate unmet client needs
- Skill gaps mentioned during conversations
- Client requests that fall outside the firm's capabilities
- "I had to turn down a project because we don't do X" → suggest partners who do X

### Structured Sharing
When an opportunity is identified:
1. Ossy asks the firm to confirm and add details
2. Opportunity gets structured: client industry, required skills, estimated value, timeline
3. Shared only with relevant trusted partners (not broadcast)
4. Track whether shared opportunities convert to projects

---

## 8. Search & Matching

### The Abstraction Layer
Every entity (firm, expert, case study) gets a hidden, normalized profile:
- **Not what they say they are** — what the evidence shows
- Computed from: case studies, projects, client types, skills demonstrated, industries served
- Generated by lightweight AI models (Gemini Flash) — not expensive LLM calls
- Updated incrementally on content change + weekly full rebuild
- Stored as structured tags (Neo4j edges) + vector embeddings (pgvector)

### Ground Truth Principle
What matters more than self-description:
1. **Projects delivered** (with verified payment) — strongest signal
2. **Case studies** with specific outcomes — strong signal
3. **Client relationships** (especially if multiple firms served same client) — strong signal
4. **Expert work history** (Proxycurl data) — moderate signal
5. **Skills taxonomy mapping** — moderate signal
6. **Self-reported services** — weakest signal (but still used)

### Cascading Search (3 Layers)
```
Layer 1: Structured Filter (PostgreSQL + Neo4j) → ~500 results → $0 cost
Layer 2: Vector Similarity (pgvector) → ~50 results → ~$0.001 cost
Layer 3: LLM Deep Ranking (Gemini Pro) → ~10-15 results → ~$0.01-0.05 cost
```

Total cost per search: under $0.10, even at scale.

### Bidirectional Matching
It's not enough for Firm A to want Firm B. The system checks:
- Does Firm B want the type of partner Firm A is?
- Does Firm B work in industries Firm A cares about?
- Does Firm B operate in markets Firm A needs?
- Is there a symbiotic relationship between their firm types? (from firm-relationships.csv)
- Are they compatible on working style, deal size, partnership model?

Both sides must score well for a match to surface.

### Multi-Model AI Strategy (Cost Consciousness)
- **Classification/tagging:** Gemini Flash or Haiku (cheapest)
- **Deep matching/ranking:** Gemini Pro (large context window for comparing many firms)
- **Conversation/voice:** Claude Sonnet (best quality)
- **Embeddings:** OpenAI text-embedding-3-small (best quality/cost ratio)
- Central **AI cost gateway** logs every call: model, tokens, cost, purpose

### Proactive Matchmaking
The system doesn't wait for searches — it proactively generates matches:
- New firm onboards → immediate match generation
- Firm updates preferences → regenerate matches
- New case study added → recalculate for affected firms
- Weekly batch: re-evaluate all matches for drift
- Ossy surfaces matches conversationally: "I found 3 new firms that look like great partners for you"

---

## 9. Voice & Call Intelligence

### Voice Conversations with Ossy
Users can talk to Ossy instead of typing:
- Mic button in chat UI to toggle voice mode
- Real-time streaming: speech → text → AI response → speech
- Target: <1 second response latency
- Visual waveform/indicator while Ossy speaks
- Always supports text fallback

**Use cases:**
- Onboarding interview
- Expert bio builder (interview mode)
- Quick opportunity sharing ("I just had a call with...")
- Post-call coaching review
- General consultation

### Chrome Extension (Call Recording)
Manifest V3 Chrome extension that:
- Captures tab audio from browser-based meetings (Google Meet, Zoom web, Teams web)
- Streams audio to Deepgram for real-time transcription
- Sends transcript + metadata to COS API when call ends
- Stores: full transcript, speaker diarization, call duration, participants

### Post-Call Analysis Pipeline
After a call is transcribed (Inngest workflow):
1. **Opportunity extraction:** Claude identifies opportunities mentioned
2. **Coaching analysis:** Talking time ratio, value prop clarity, key topics
3. **Partner recommendations:** Based on topics, suggest relevant partners
4. **Action items:** Extract follow-ups, next steps, commitments
5. Results surfaced in Ossy chat: "I noticed 3 opportunities from your call with..."

### Future: Meeting Bot (Phase 6+)
- Recall.ai API to join meetings as a bot participant named "Ossy"
- Works for desktop Zoom/Teams apps (not just browser)
- Same post-call pipeline

---

## 10. Ossy Email Agent

### What It Does
ossy@joincollectiveos.com is an email address that Ossy monitors and responds from:
- **Three-way partnership intros:** Ossy introduces two firms via email
- **CC'd monitoring:** When users CC Ossy on emails, it captures context
- **Response understanding:** Classifies email intent, extracts action items
- **Follow-up prompting:** Reminds users to follow up on partnership conversations

### How It Works (Nylas API or Google Workspace)
- Ossy has a real email inbox
- Incoming emails parsed for intent and context
- AI generates appropriate responses (with human approval for sensitive ones)
- Email threads tracked in platform (email_threads table)

---

## 11. Firm Categories & Taxonomy

### 30 Categories (from data/categories.csv)
Firms are classified into one or more of these categories:

**By Theme:**
- **Brand:** Brand Strategy & Positioning
- **Creative:** Creative, Content & Production
- **Customer:** Customer Success & Retention
- **Data:** Data, Analytics & BI | Market Research & Customer Intelligence
- **Finance:** Finance, Accounting & Tax
- **HR:** Human Capital & Talent | People Operations & HR
- **Legal:** Privacy, Risk & Compliance | Legal
- **Marketing:** Growth Marketing & Demand Gen | Lifecycle, CRM & Marketing Ops | PR & Communications
- **Operations:** Operations & Process | Change, Transformation & Reengineering
- **Product:** Product Strategy & Innovation | Product Management, UX & Design
- **Sales:** Sales Strategy & Enablement | Revenue Operations & GTM
- **Strategy:** Strategy & Management Consulting
- **Technology:** Technology Strategy & Digital Transformation | Systems Integration | Software Engineering | AI, Automation & Intelligent Systems | IT Infrastructure | Cybersecurity

Plus cross-cutting categories:
- Fractional & Embedded Leadership
- Training, Enablement & Professional Coaching
- Outsourcing & Managed Business Services
- Industry & Applied Engineering

### Skills Taxonomy
- **L1:** 30 top-level categories (Administration, Analysis, Architecture and Construction, Business, Customer and Client Support, Design, Economics/Policy/Social Studies, Education and Training, Energy and Utilities, Engineering, Environment, Finance, Hospitality and Food Services, Human Resources, Information Technology, Law/Regulation/Compliance, Manufacturing and Production, Marketing and Public Relations, Media and Communications, Performing Arts/Sports/Recreation, Personal Care and Services, Physical and Inherent Abilities, Property and Real Estate, Sales, Transportation/Supply Chain/Logistics)
- **L2:** 247 sub-categories
- **L3:** 18,421 specific skills

---

## 12. Firm Relationships (Symbiotic Partnerships)

The `data/firm-relationships.csv` file (346 rows) maps how different types of firms naturally work together. This is CRITICAL domain knowledge that the matching engine uses.

**Each row contains:**
- Company Type A and Company Type B
- Nature of the relationship (why they partner)
- Client use case (what triggers the partnership)
- Direction of engagement (who typically initiates)
- Partnership frequency (how common is this pairing)
- Revenue model (how money flows)
- Risk/complexity level
- Real-world examples
- Key skills involved

**Example:** A Brand Strategy Agency often partners with a Creative Studio because brand agencies translate strategic positioning into visual identity — the creative studio executes the designs. The brand agency typically initiates. High frequency. Revenue flows from brand agency to creative studio as subcontractor.

This data helps the matching engine understand which pairings are naturally symbiotic vs. which would be unusual.

---

## 13. Persona Positioning (Adaptive Communication)

The `data/persona-positioning.csv` (~190 rows) tells Ossy HOW to speak to different types of leaders. It's a matrix of:
- **Company size:** 0-10, 11-50, 51-200, 201-500, 501-1000, 1001+ employees
- **Role:** CEO, COO, CFO, CMO, CRO, CHRO, VP of Sales, Head of Partnerships, and more

**Why it matters:**
- A CEO of a 5-person agency cares about different things than a VP of Partnerships at a 500-person consultancy
- The language, concerns, and value propositions are different
- Ossy adapts its tone, focus, and recommendations based on who it's talking to
- This data drives the adaptive voice/chat personality

---

## 14. Key Design Decisions Summary

1. **Chat-first interface** — the primary UX is conversation with Ossy, not forms and dashboards
2. **Voice as first-class** — not an afterthought; voice onboarding, voice search, voice coaching
3. **No public opportunity boards** — opportunities are extracted by AI and shared privately
4. **Bidirectional matching** — both parties must be a fit, not just one
5. **Ground truth over self-reporting** — what you've done matters more than what you say
6. **Progressive disclosure** — don't ask for everything upfront; enrich over time
7. **Cost-conscious AI** — cheapest model for each job; cascading search to minimize LLM usage
8. **Platform-owned data** — clients belong to the platform, skills taxonomy is centralized
9. **Privacy by default** — social graph, preferences, and opportunity data are private
10. **Global first, then enrich** — start with a big database of basic info, then deepen for members
