# COS Knowledge Graph — Complete Reference for CORE

> **Purpose:** This document is written for the CORE platform's agent to understand how COS (Collective OS) models its knowledge graph, what data lives where, and how to work with it through the partner-sync API. Use this to update your `knowledgegraph.md` or equivalent internal documentation.

---

## 1. The Core Principle: Company is Everything

COS uses **one canonical node type for all organizations: `Company`**. There is no separate "Firm" or "ServiceFirm" node type. Instead, `ServiceFirm` is an **additional label** on Company nodes that represent COS platform member firms.

```
:Company                 → Any organization (8.5M+ in the graph)
:Company:ServiceFirm     → COS platform member firm (~1,050 currently)
```

**Critical rule:** Always query with `MATCH (f:Company:ServiceFirm)` for member firms. Never `MATCH (f:ServiceFirm)` alone — that label doesn't exist independently.

The 8.5M+ Company nodes come from:
- PDL (People Data Labs) company database
- Jina website scrapes (client companies discovered from case studies)
- Legacy n8n imports
- Self-registration (when a firm signs up for COS)

---

## 2. Node Types — Complete Field Reference

### Company (Base Node)

Every organization in the graph. The `id` is the primary key used for all MERGE operations.

| Property | Type | Description | Source |
|----------|------|-------------|--------|
| `id` | UUID string | Primary key. Used in all MERGE operations. | Generated at creation |
| `name` | string | Organization name | PDL, website scrape, self-reported |
| `domain` | string | Website domain (unique constraint) | PDL, Clearbit |
| `website` / `websiteUrl` | string | Full homepage URL | PDL, self-reported |
| `description` | string | Company description / pitch | Website scrape, PDL |
| `industry` | string | Primary sector classification | AI classifier, PDL |
| `employeeCount` | integer | Headcount | PDL, Clearbit |
| `employeeRange` | string | Size band: "51-200", "201-500", etc. | PDL |
| `foundedYear` | integer | Year incorporated | PDL |
| `location` | string | Full location string | PDL |
| `city` | string | City | PDL |
| `country` | string | Country name | PDL |
| `countryCode` | string | ISO 3166 country code | PDL |
| `source` | string | How this node was created | System: "pdl", "n8n", "website_scrape", "self_registered" |
| `sourceId` | string | External identifier from source system | Varies |
| `updatedAt` | datetime | Last modification timestamp | System |

**Additional properties on Company:ServiceFirm nodes:**

| Property | Type | Description | Source |
|----------|------|-------------|--------|
| `organizationId` | string | Better Auth organization ID | COS auth system |
| `isCosCustomer` | boolean | Always `true` for ServiceFirm nodes | System |
| `enrichmentStatus` | string | "pending" / "enriched" / "complete" | Enrichment pipeline |
| `classifierConfidence` | float 0-1 | AI classification confidence | Gemini classifier |
| `logoUrl` | string | Company logo | Clearbit |
| `partnershipPhilosophy` | string | Onboarding Q1: how they approach partnerships | User input |
| `dealBreaker` | string | Onboarding Q4: partnership deal-breakers | User input |
| `geographyPreference` | string | Onboarding Q5: geographic focus | User input |
| `pdlIndustry` | string | PDL's industry classification | PDL API |
| `pdlHeadline` | string | PDL's company headline | PDL API |
| `pdlLocation` | string | PDL's location string | PDL API |

**Constraints:**
- `Company.id` — UNIQUE
- `Company.domain` — UNIQUE

---

### Person

Any professional — employee, freelancer, advisor, contractor. Can have multiple roles.

| Property | Type | Description | Source |
|----------|------|-------------|--------|
| `id` | string | Composite: typically `{firmId}:{name-slug}` | System |
| `firstName` | string | First name | PDL, LinkedIn |
| `lastName` | string | Last name | PDL, LinkedIn |
| `fullName` | string | Combined name | PDL, LinkedIn |
| `headline` | string | Job title + company | LinkedIn |
| `linkedinUrl` | string | LinkedIn profile URL (unique constraint) | PDL, user input |
| `email` / `emails` | string / array | Contact email(s) | PDL |
| `location` | string | Location string | PDL |
| `bio` | string | AI-generated professional bio | Enrichment pipeline |
| `enrichmentStatus` | string | "pending" / "enriched" | System |
| `personTypes` | array | Role labels: ["expert", "contact", "platform_user"] | System |
| `firmId` | string | Primary firm ID | System |
| `updatedAt` | datetime | Last modification | System |

**Constraints:**
- `Person.linkedinUrl` — UNIQUE

---

### CaseStudy

Published success stories discovered from firm websites or manually submitted.

| Property | Type | Description | Source |
|----------|------|-------------|--------|
| `id` | string | Composite: `{firmId}:cs:{index}` | System |
| `title` | string | Case study headline | Website scrape, AI extraction |
| `description` | string | Full text content | Website scrape |
| `sourceUrl` | string | Original URL where discovered | Jina scraper |
| `firmId` | string | Publishing firm's ID | System |
| `status` | string | "pending" / "ingesting" / "active" / "blocked" / "failed" | System |
| `ingestedAt` | datetime | When first processed | System |

**Case studies have two analysis layers:**

**Visible layer (user-facing):** 2-sentence summary + auto-extracted tags (skills, industries, services, markets, client name)

**Hidden layer (powers matching — not shown to users):**
- `capabilityProof` — what the firm demonstrably delivered
- `partnershipSignals` — what complementary firms could add
- `idealReferralProfile` — what type of opportunities suit this firm
- `taxonomyMapping` — normalized L2 skills + industries
- `evidenceStrength` — "weak" / "moderate" / "strong"

---

### Skill (3-Level Hierarchy)

A single `Skill` node type with a `level` property for hierarchy. All three levels share the same label.

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Skill name (unique globally across all levels) |
| `level` | string | "L1", "L2", or "L3" |
| `l1` | string | Parent L1 name (on L2 skills) |
| `l2` | string | Parent L2 name (on L3 skills) |

**Scale:**
- **L1:** 30 categories (Information Technology, Finance, Marketing, HR, etc.)
- **L2:** 247 sub-categories (Cloud Computing, Financial Analysis, Digital Marketing, etc.)
- **L3:** 18,421 specific skills (AWS, DCF Modeling, Google Ads, etc.)

**Hierarchy is encoded via `BELONGS_TO` edges:**
- L3 skill → `BELONGS_TO` → L2 skill
- L2 skill → `BELONGS_TO` → L1 skill

**Constraint:** `Skill.name` — UNIQUE

---

### Industry

Sector verticals. Grows via enrichment.

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Industry name (unique) |
| `level` | string | Hierarchy level if applicable |

~55+ core verticals seeded (fintech, healthcare, manufacturing, etc.)

**Constraint:** `Industry.name` — UNIQUE

---

### Market

Geographic taxonomy.

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Market name (unique) |
| `type` | string | "country" / "region" / "city" / "economic_zone" |
| `isoCode` | string | ISO 3166 country code |

~200+ markets. Hierarchy via `PARENT_REGION` edges (city → country → region).

**Constraint:** `Market.name` — UNIQUE

---

### Category / FirmCategory

Firm type classifications. Dual labels for backwards compatibility.

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Category name (unique) |
| `definition` | string | What this category means |
| `theme` | string | UI styling theme |
| `sampleOrgs` | string | Example organizations |

30 categories: Fractional Leadership, Creative Studio, Staff Augmentation, etc.

**Constraint:** `Category.name` — UNIQUE, `FirmCategory.name` — UNIQUE

---

### Language

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Language name (unique) |
| `isoCode` | string | ISO 639-1 code |

~75+ languages.

---

### Service

Named service offerings extracted from firm websites.

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Service name (unique) |
| `description` | string | AI-generated description |
| `sourceUrl` | string | Where extracted from |

---

### FirmType / DeliveryModel

Engagement/delivery models.

10 types: Fractional Interim, Staff Augmentation, Embedded Teams, Boutique Agency, Project Consulting, Managed Service Provider, Advisory, Global Consulting, Freelancer Network, Agency Collective.

---

## 3. Relationship (Edge) Types — Complete Reference

### Enrichment Edges

Created when a firm's enrichment pipeline completes (PDL + Jina scrape + AI classification).

| Edge | From | To | Key Properties | Meaning |
|------|------|----|----------------|---------|
| `HAS_SKILL` | Company:ServiceFirm | Skill (L2) | source, confidence, strength, evidenceCount | Firm has this capability |
| `HAS_SKILL` | Person | Skill | proficiency, strength | Person has this skill |
| `IN_CATEGORY` | Company:ServiceFirm | FirmCategory | confidence | Firm belongs to this category |
| `SERVES_INDUSTRY` | Company:ServiceFirm | Industry | confidence | Firm operates in this vertical |
| `SERVES_INDUSTRY` | Person | Industry | — | Person has industry experience |
| `OPERATES_IN` | Company:ServiceFirm | Market | — | Firm serves this geography |
| `SPEAKS` | Company:ServiceFirm | Language | proficiency, speakerCount | Firm offers services in this language |
| `OFFERS_SERVICE` | Company:ServiceFirm | Service | strength, evidenceCount, websiteMentionCount | Firm offers this service |
| `HAS_CLIENT` | Company:ServiceFirm | Company | source="website_scrape" | Firm has worked with this client |
| `HAS_CASE_STUDY` | Company:ServiceFirm | CaseStudy | — | Firm published this case study |
| `DEMONSTRATES_SKILL` | CaseStudy | Skill | — | Case study proves this capability |
| `FOR_CLIENT` | CaseStudy | Company | — | Case study was for this client |
| `IN_INDUSTRY` | CaseStudy | Industry | — | Case study is in this vertical |
| `CURRENTLY_AT` | Person | Company:ServiceFirm | — | Person works at this firm |

### Preference Edges (Bidirectional Matching)

Created from onboarding answers. These power the matching algorithm.

| Edge | From | To | Key Properties | Meaning |
|------|------|----|----------------|---------|
| `PREFERS` | Company:ServiceFirm | Skill | dimension="skill", weight=0.9, source="stated" | Firm wants partners with this skill |
| `PREFERS` | Company:ServiceFirm | Category | dimension="capability_gap_category", weight=0.9 | Firm needs this type of partner |
| `PREFERS` | Company:ServiceFirm | Category | dimension="firm_category", weight=0.8 | Firm prefers partnering with this type |
| `PREFERS` | Company:ServiceFirm | Market | dimension="market", weight=0.7 | Firm wants partners in this geography |

**How matching works:** When Firm A searches, the engine:
1. Reads Firm A's `PREFERS` edges (what A wants)
2. Finds firms whose `HAS_SKILL` / `IN_CATEGORY` / `OPERATES_IN` edges match A's preferences
3. Checks if those candidate firms also have `PREFERS` edges that match A's capabilities
4. Score boost (up to +20%) for mutual/bidirectional fit

### Taxonomy Edges

Structural relationships seeded once during initialization.

| Edge | From | To | Key Properties | Meaning |
|------|------|----|----------------|---------|
| `BELONGS_TO` | Skill (L2) | Skill (L1) | — | Skill hierarchy |
| `BELONGS_TO` | Skill (L3) | Skill (L2) | — | Skill hierarchy |
| `PARTNERS_WITH` | Category | Category | nature, direction, frequency, revenueModel | Symbiotic firm-type pairings |
| `PARENT_REGION` | Market | Market | — | Geographic hierarchy |

**`PARTNERS_WITH` edge properties:**
- `nature` — How they partner (e.g., "Brand agency provides creative; PR firm amplifies reach")
- `direction` — "A→B", "B→A", or "bidirectional"
- `frequency` — "high", "medium", "low"
- `revenueModel` — "shared retainer", "mark-up", "separate contracts", etc.

346 partnership pairings defined in `data/firm-relationships.csv`.

---

## 4. Edge Property Patterns

All enrichment edges carry metadata:

| Property | Type | Description |
|----------|------|-------------|
| `source` | string | How the edge was created: "enrichment", "website_scrape", "stated", "case_study" |
| `confidence` | float 0-1 | Trust score from the AI classifier |
| `strength` | float | Computed relevance strength (recomputed by background jobs) |
| `evidenceCount` | integer | How many independent sources support this edge |
| `updatedAt` | datetime | Last time this edge was modified |
| `lastComputedAt` | datetime | Last time strength was recomputed |

---

## 5. Data Flow: How Things Get Into the Graph

### Flow 1: Firm Enrichment Pipeline

```
New firm signs up on COS
  → PDL API (company data, team members)
  → Jina web scraper (website content, services, case studies)
  → AI Classifier (Gemini): categorizes firm, extracts skills/industries
  → Graph Writer: MERGE Company:ServiceFirm node + all edges
```

### Flow 2: Onboarding → Preferences

```
User answers 5 onboarding questions via Ossy chat:
  Q1: Partnership philosophy → Company.partnershipPhilosophy property
  Q2: Capability gaps → PREFERS edges to Skill/Category
  Q3: Preferred partner types → PREFERS edges to Category
  Q4: Deal-breakers → Company.dealBreaker property
  Q5: Geography preference → Company.geographyPreference + Market edge
```

### Flow 3: Case Study Ingestion

```
Website URL discovered
  → Jina scrape extracts text
  → AI analysis (Gemini): extracts structure, skills, industries
  → Creates visible layer (summary + tags) and hidden layer (matching signals)
  → Graph Writer: CaseStudy node + DEMONSTRATES_SKILL, FOR_CLIENT, IN_INDUSTRY edges
```

### Flow 4: Expert LinkedIn Enrichment

```
PDL team discovery finds people at firm
  → Full LinkedIn work history enrichment
  → AI generates specialist profile
  → Graph Writer: Person node + HAS_SKILL, SERVES_INDUSTRY edges
```

---

## 6. The Matching Engine (Three Layers)

### Layer 1: Neo4j Structured Filtering
Cypher queries filter `Company:ServiceFirm` nodes by matching edges (skills, categories, industries, markets, services). Returns ~500 candidates with structured scores. Checks bidirectional `PREFERS` fit.

### Layer 2: pgvector Similarity Re-ranking
Uses 1024-dimensional Jina v3 embeddings on abstraction profiles. Re-ranks the ~500 candidates down to ~50.

### Layer 3: LLM Deep Ranking (Gemini Pro)
Final ranking with natural language explanations. Returns ~15 results.

---

## 7. What CORE Should Know About Data Quality

### Ground Truth Principle
COS values **what firms have actually done** over what they claim. The hierarchy of evidence:
1. **Case studies** (strongest) — published proof of delivery
2. **Client relationships** — discovered from websites
3. **Team expertise** — LinkedIn profiles of actual team members
4. **AI classification** — inferred from website content
5. **Self-reported** (weakest) — onboarding answers

### Abstraction Layer
Every firm has a hidden "abstraction profile" — an AI-generated narrative of their real capabilities that is NOT shown to users. This powers matching. It includes:
- Top services (ranked by evidence)
- Top skills (L2, with confidence)
- Top industries (with confidence)
- A narrative description of what makes them unique

### Enrichment Status
- `pending` — firm registered but not yet enriched
- `enriched` — PDL + website scrape done, AI classification pending
- `complete` — full pipeline finished, all edges written to graph

---

## 8. Partner Sync API — Available Endpoints

### Authentication
All requests require:
- `x-api-key` header with the shared partner sync API key
- `x-partner-id` header: `"chameleon-collective"`

### GET /api/partner-sync/schema-manifest
Returns the full graph schema (node labels, properties, edge types, constraints). Use this to detect schema drift.

### GET /api/partner-sync/taxonomy
Returns the complete COS taxonomy:
- All Skills (L1/L2/L3 with hierarchy)
- All Categories (30 firm types)
- All Industries
- All Markets (with hierarchy)
- All Languages
- All FirmTypes
- PARTNERS_WITH pairings (346 relationships)

### GET /api/partner-sync/entities?type=Company&limit=1000&cursor=...
Paginated entity export. Supports cursor-based pagination (1000 per page, up to 50 pages per sync run).

Returns:
```json
{
  "entities": [
    {
      "type": "Company",
      "id": "the-cos-uuid",
      "data": {
        "name": "Acme Corp",
        "domain": "acme.com",
        "website": "https://acme.com",
        "description": "...",
        "employeeCount": 150
      },
      "source": "cos"
    }
  ],
  "nextCursor": "opaque-string-or-null",
  "total": 8500000
}
```

### POST /api/partner-sync/entities
Push entities FROM CORE into COS. Accepts Company, Person, CaseStudy, ServiceFirm types.

### GET /api/partner-sync/provision-user & deprovision-user
User lifecycle management for cross-platform SSO.

---

## 9. Key Design Decisions CORE Should Respect

1. **MERGE, not CREATE** — All graph writes use MERGE (upsert). Re-running enrichment is always safe.

2. **Company.id is the canonical key** — Never use domain alone as an identifier. Multiple companies can share a domain (subsidiaries).

3. **ServiceFirm is a label, not a node** — Don't create ServiceFirm nodes without the Company base label.

4. **Skills are matched at L2** — The matching engine operates at L2 (247 categories). L3 skills (18,421) are used for display and search refinement, not primary matching.

5. **Preferences are delete-then-recreate** — When a firm updates preferences, old `PREFERS` edges for that dimension are deleted and new ones created. Don't append.

6. **Edge metadata matters** — `source`, `confidence`, and `evidenceCount` on edges determine ranking weight. Higher confidence = higher match score.

7. **Hidden layer is sacred** — Case study analysis has a hidden layer that powers matching but is never shown to users. If CORE receives this data, treat it as internal-only.

---

## 10. Taxonomy Mapping Guidance for CORE

When CORE has its own skill/industry/category taxonomy, map to COS's taxonomy using these rules:

1. **Skills:** Map to L2 level first (247 options). Only fall to L3 if L2 is ambiguous.
2. **Industries:** Use exact name match or closest synonym. COS has ~55 industries.
3. **Categories:** Map to one of the 30 firm categories. These are mutually exclusive.
4. **Markets:** Map to country name. COS uses full names ("United States"), not codes.

The taxonomy endpoint (`GET /api/partner-sync/taxonomy`) returns the complete mapping for each level.

---

## 11. What's Coming (Not Yet Implemented)

| Feature | Status | Impact on CORE |
|---------|--------|---------------|
| Social graph (TRUSTS, CONNECTED_TO edges) | Design only | Will enable trust-path-based matching |
| Project nodes (DELIVERED_PROJECT) | Design only | Will replace CaseStudy as primary evidence |
| pgvector search (Layer 2) | Partial | Will improve matching precision |
| Webhook notifications | Not started | Will notify CORE of graph changes in real-time |
| Bidirectional entity sync | Partial | Currently CORE pushes to COS; pull is new |
