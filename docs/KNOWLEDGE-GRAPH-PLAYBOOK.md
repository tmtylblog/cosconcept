# Knowledge Graph Playbook for COS Data Partners

> **Purpose:** This document gives a Claude agent (or human engineer) everything needed to stand up a Neo4j knowledge graph for a professional services company that will interoperate with Collective OS (COS). It covers architecture, philosophy, schema, data migration patterns, enrichment pipelines, matching integration, and the "data partner" contract that lets the two graphs talk to each other.

---

## Table of Contents

1. [Why a Knowledge Graph](#1-why-a-knowledge-graph)
2. [Strategic Philosophy](#2-strategic-philosophy)
3. [COS Core Schema (The Shared Backbone)](#3-cos-core-schema-the-shared-backbone)
4. [Setting Up Neo4j Aura](#4-setting-up-neo4j-aura)
5. [Driver & Connection Pattern](#5-driver--connection-pattern)
6. [Schema Setup (Constraints & Indexes)](#6-schema-setup-constraints--indexes)
7. [Taxonomy Seeding](#7-taxonomy-seeding)
8. [Legacy Data Migration Patterns](#8-legacy-data-migration-patterns)
9. [Enrichment Pipeline](#9-enrichment-pipeline)
10. [Graph Writer Pattern](#10-graph-writer-pattern)
11. [Matching Engine Integration](#11-matching-engine-integration)
12. [Extending the Schema for Your Company](#12-extending-the-schema-for-your-company)
13. [Data Partner Contract](#13-data-partner-contract)
14. [Interop: How Two Graphs Talk](#14-interop-how-two-graphs-talk)
15. [Operational Runbook](#15-operational-runbook)

---

## 1. Why a Knowledge Graph

Relational databases store rows. Knowledge graphs store **relationships**. For professional services, relationships ARE the product:

- **Who worked with whom** (firms ↔ clients ↔ experts)
- **Who can do what** (skills, industries, markets)
- **Who should work together** (symbiotic firm types, shared clients, complementary skills)
- **Trust paths** (3-hop traversal: "I know someone who knows someone at that firm")

A relational database can model this, but graph queries that traverse 3-4 relationship hops are 100-1000x faster in Neo4j than in PostgreSQL with JOINs. When your core business question is "find me the best-fit partners through multiple dimensions of compatibility," a graph is the right tool.

### What COS Uses the Graph For

| Use Case | How the Graph Powers It |
|----------|------------------------|
| Partner matching | Layer 1 of a 3-layer cascade: Cypher queries filter by skills, industries, markets, categories — eliminates 99% before expensive AI ranking |
| Trust path analysis | Traverse `COMMUNICATES_WITH` and `CURRENTLY_AT` edges to find how connected two firms are (max 3 hops) |
| Capability verification | "They SAY they do Shopify, but have they DELIVERED Shopify projects?" — follow `HAS_CASE_STUDY → DEMONSTRATES_SKILL` paths |
| Symbiotic matching | 346 pre-defined firm relationship pairings as `PARTNERS_WITH` edges between Category nodes |
| Proactive recommendations | Weekly batch Cypher queries surface new matches when firms add case studies or update preferences |

---

## 2. Strategic Philosophy

These principles govern every design decision. Your company's KG should follow the same principles to be compatible.

### Ground Truth > Self-Description

What firms have **actually done** (projects, case studies, verified clients) matters more than what they claim. The graph prioritizes evidence-based edges:

| Evidence Type | Signal Strength | Graph Representation |
|---|---|---|
| Verified project delivery | Strongest | `ServiceFirm → DELIVERED_PROJECT → Project → BENEFITED_FROM ← Client` |
| Published case studies | Strong | `ServiceFirm → HAS_CASE_STUDY → CaseStudy → DEMONSTRATES_SKILL → Skill` |
| Client relationships | Strong | `ServiceFirm → HAS_CLIENT → Company` |
| Expert work history | Moderate | `Person → CURRENTLY_AT → ServiceFirm` + `Person → HAS_SKILL → Skill` |
| AI-classified capabilities | Moderate | `ServiceFirm → HAS_SKILL → Skill` (from website scrape + classifier) |
| Self-reported services | Weakest | `ServiceFirm → OFFERS_SERVICE → Service` |

### The Abstraction Layer

Every entity gets a **hidden, normalized profile** that the AI generates from evidence, not from user input. This profile:
- Summarizes what the firm actually does (not what they say)
- Gets embedded as a vector for semantic similarity search
- Is rebuilt incrementally when evidence changes
- Is never shown to the user — it's internal scoring data

### Bidirectional Matching

It's not enough for Firm A to want Firm B. The system checks BOTH directions:
- Does Firm B want the type of partner Firm A is?
- Does Firm B operate in markets Firm A needs?
- Is there a symbiotic relationship between their firm types?

### Progressive Enrichment

The graph starts sparse and grows richer over time:
1. **Day 0:** Basic profile (name, website, email domain)
2. **Day 1:** Website scrape → services, clients, team members, case study URLs
3. **Day 2:** PDL enrichment → employee count, location, industry, LinkedIn URL
4. **Day 3:** AI classification → categories, skills (L2), industries, markets, languages
5. **Ongoing:** Case study ingestion, expert LinkedIn enrichment, specialist profiles

### Cost-Conscious AI

Every AI call is tracked. The cheapest model that can do the job is used:

| Task | Model | Cost |
|------|-------|------|
| Classification/tagging | Gemini 2.0 Flash | Very low |
| Structured filtering | Neo4j Cypher (no AI) | $0 |
| Vector similarity | pgvector (no AI) | ~$0.001 |
| Deep ranking | Gemini 2.0 Pro | ~$0.01-0.05 |
| Conversation | Claude Sonnet | Medium |
| Embeddings | OpenAI text-embedding-3-small | Very low |

Total cost per search: under $0.10.

---

## 3. COS Core Schema (The Shared Backbone)

This is the schema your company's graph MUST implement to be a COS data partner. These are the node types and edge types that COS understands.

### Core Business Nodes

```
ServiceFirm        — An agency, consultancy, or professional services firm
  .id              — Unique ID (your PG firm ID or UUID)
  .name            — Firm name
  .organizationId  — Auth org ID
  .website         — URL
  .domain          — Extracted domain (e.g., "chameleon.co")
  .description     — About text
  .foundedYear     — Integer
  .employeeCount   — Integer
  .logoUrl         — URL
  .enrichmentStatus — "stub" | "partial" | "complete"
  .updatedAt       — datetime

Person              — Individual professional (employee, freelancer, fractional)
  .id              — Composite: `firmId:name-slug` or UUID
  .fullName        — Full name
  .headline        — Professional headline
  .linkedinUrl     — LinkedIn URL
  .location        — City/region
  .firmId          — Current primary firm
  .enrichmentStatus — "stub" | "enriched"
  .updatedAt       — datetime

Company             — Any company (client, employer, or service firm with Company label)
  .name            — Company name (unique key for non-domain matches)
  .domain          — Website domain (unique key, preferred)
  .website         — Full URL
  .isCosCustomer   — Boolean (is this company a COS platform member?)
  .enrichmentStatus — "stub" | "enriched"

CaseStudy           — Published work example
  .id              — Composite: `firmId:cs:index` or UUID
  .title           — Case study title
  .description     — Full narrative
  .sourceUrl       — Original URL
  .firmId          — Owning firm
  .status          — "pending" | "ingested"
  .outcomes[]      — Array of outcome strings
  .updatedAt       — datetime
```

### Taxonomy Nodes (Reference Data)

These are shared across ALL COS data partners. Your company seeds these from COS CSV files.

```
Category / FirmCategory  — 30 firm categories (from categories.csv)
  .name            — Category name (unique)
  .definition      — What this category means
  .theme           — Grouping theme (Brand, Creative, Technology, etc.)

Skill               — 18,668 skills in 3-level hierarchy
  .name            — Skill name (unique)
  .level           — "L1" | "L2" | "L3"
  .l1              — Parent L1 name (for L2 skills)
  .l2              — Parent L2 name (for L3 skills)

SkillL1             — 26 top-level skill categories
  .name            — Category name (unique)
  .level           — "L1"

Industry            — Verticals (starts with ~55, grows via enrichment)
  .name            — Industry name (unique)

IndustryL1          — 15 top-level industry groupings
  .name            — L1 industry name

Market              — Countries and regions (~200+)
  .name            — Market name (unique)
  .type            — "region" | "country"
  .isoCode         — ISO code (for countries)
  .level           — "L1" (region) | "L2" (country)

Language            — Business languages (~75+)
  .name            — Language name (unique)
  .isoCode         — ISO 639-1 code

FirmType / DeliveryModel — 10 firm delivery models
  .name            — Type name (unique)
  .description     — What this type means

ServiceCategory     — 8 service groupings
  .name            — Category name
  .description     — Description

Service             — Named services under ServiceCategory
  .name            — Service name (unique)

TechCategory        — 13 technology platform categories
  .name            — Category name
  .slug            — URL-safe identifier
```

### Edge Types

#### Business Edges (Created by Enrichment)
```
(ServiceFirm)-[:IN_CATEGORY]->(FirmCategory)         — Firm belongs to category
(ServiceFirm)-[:HAS_SKILL]->(Skill)                  — Firm has this capability
(ServiceFirm)-[:SERVES_INDUSTRY]->(Industry)          — Firm serves this vertical
(ServiceFirm)-[:OPERATES_IN]->(Market)                — Firm operates here
(ServiceFirm)-[:SPEAKS]->(Language)                   — Firm works in this language
(ServiceFirm)-[:OFFERS_SERVICE]->(Service)            — Firm offers this service
(ServiceFirm)-[:HAS_CLIENT]->(Company)                — Firm has served this client
(ServiceFirm)-[:HAS_CASE_STUDY]->(CaseStudy)          — Firm published this case study
(ServiceFirm)-[:IS_FIRM_TYPE]->(FirmType)             — Firm's delivery model

(Person)-[:CURRENTLY_AT]->(ServiceFirm)               — Person works at firm
(Person)-[:HAS_SKILL]->(Skill)                        — Person has this skill
(Person)-[:SERVES_INDUSTRY]->(Industry)               — Person has industry experience
(Person)-[:HAS_SPECIALIST_PROFILE]->(SpecialistProfile) — AI-generated niche profile

(CaseStudy)-[:DEMONSTRATES_SKILL]->(Skill)            — Case study proves this skill
(CaseStudy)-[:FOR_CLIENT]->(Company)                  — Case study was for this client
(CaseStudy)-[:IN_INDUSTRY]->(Industry)                — Case study is in this vertical
```

#### Taxonomy Edges (Created by Seeding)
```
(Skill:L2)-[:BELONGS_TO]->(SkillL1)                   — L2 belongs to L1 parent
(Skill:L3)-[:BELONGS_TO]->(Skill:L2)                  — L3 belongs to L2 parent
(Industry)-[:BELONGS_TO]->(IndustryL1)                 — Industry belongs to group
(Market:country)-[:PARENT_REGION]->(Market:region)     — Country in region
(Service)-[:BELONGS_TO]->(ServiceCategory)             — Service in category
(FirmCategory)-[:PARTNERS_WITH]->(FirmCategory)        — Symbiotic relationship
  .nature          — Why they partner
  .direction       — Who typically initiates
  .frequency       — How common
  .revenueModel    — How money flows
```

#### Preference/Routing Edges (Future — designed, not yet implemented)
```
(ServiceFirm)-[:PREFERS]->(Skill|Industry|Market)     — Partnership preference
(ServiceFirm)-[:AVOIDS]->(ServiceFirm)                — Don't show this match
(ServiceFirm)-[:BLOCKS]->(ServiceFirm)                — Hard block
```

---

## 4. Setting Up Neo4j Aura

1. Create a Neo4j Aura instance at [console.neo4j.io](https://console.neo4j.io)
2. Choose **AuraDB Free** for development or **AuraDB Professional** for production
3. Save the connection URI, username, and password
4. Connection URI format: `neo4j+s://XXXXXXXX.databases.neo4j.io`
5. Default username is always `neo4j`

### Environment Variables

```bash
NEO4J_URI=neo4j+s://XXXXXXXX.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your-generated-password
```

---

## 5. Driver & Connection Pattern

Singleton driver pattern that survives serverless hot reloads:

```typescript
// lib/neo4j.ts
import neo4j, { type Driver } from "neo4j-driver";

const globalForNeo4j = globalThis as unknown as { neo4jDriver: Driver };

function createDriver(): Driver {
  const uri = process.env.NEO4J_URI;
  const username = process.env.NEO4J_USERNAME;
  const password = process.env.NEO4J_PASSWORD;

  if (!uri || !username || !password) {
    throw new Error("Missing Neo4j config. Set NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD.");
  }

  return neo4j.driver(uri, neo4j.auth.basic(username, password));
}

export const neo4jDriver = globalForNeo4j.neo4jDriver ?? createDriver();

if (process.env.NODE_ENV !== "production") {
  globalForNeo4j.neo4jDriver = neo4jDriver;
}

// Read helper — uses READ session mode
export async function neo4jRead<T>(
  cypher: string,
  params?: Record<string, unknown>
): Promise<T[]> {
  const session = neo4jDriver.session({ defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.run(cypher, params);
    return result.records.map((r) => r.toObject() as T);
  } finally {
    await session.close();
  }
}

// Write helper — uses WRITE session mode
export async function neo4jWrite<T>(
  cypher: string,
  params?: Record<string, unknown>
): Promise<T[]> {
  const session = neo4jDriver.session({ defaultAccessMode: neo4j.session.WRITE });
  try {
    const result = await session.run(cypher, params);
    return result.records.map((r) => r.toObject() as T);
  } finally {
    await session.close();
  }
}
```

**Key pattern:** Always close sessions in `finally`. Use `globalThis` to persist the driver across serverless invocations in dev mode.

---

## 6. Schema Setup (Constraints & Indexes)

Run these BEFORE seeding or writing data. All use `IF NOT EXISTS` — safe to re-run.

### Uniqueness Constraints (Required for MERGE to work correctly)

```cypher
-- Core business nodes
CREATE CONSTRAINT firm_id IF NOT EXISTS FOR (n:ServiceFirm) REQUIRE n.id IS UNIQUE
CREATE CONSTRAINT person_linkedin IF NOT EXISTS FOR (n:Person) REQUIRE n.linkedinUrl IS UNIQUE
CREATE CONSTRAINT company_domain IF NOT EXISTS FOR (n:Company) REQUIRE n.domain IS UNIQUE
CREATE CONSTRAINT case_study_id IF NOT EXISTS FOR (n:CaseStudy) REQUIRE n.id IS UNIQUE

-- Taxonomy nodes (name-based uniqueness)
CREATE CONSTRAINT skill_name IF NOT EXISTS FOR (n:Skill) REQUIRE n.name IS UNIQUE
CREATE CONSTRAINT skill_l1_name IF NOT EXISTS FOR (n:SkillL1) REQUIRE n.name IS UNIQUE
CREATE CONSTRAINT industry_name IF NOT EXISTS FOR (n:Industry) REQUIRE n.name IS UNIQUE
CREATE CONSTRAINT market_name IF NOT EXISTS FOR (n:Market) REQUIRE n.name IS UNIQUE
CREATE CONSTRAINT category_name IF NOT EXISTS FOR (n:Category) REQUIRE n.name IS UNIQUE
CREATE CONSTRAINT firm_category_name IF NOT EXISTS FOR (n:FirmCategory) REQUIRE n.name IS UNIQUE
CREATE CONSTRAINT language_name IF NOT EXISTS FOR (n:Language) REQUIRE n.name IS UNIQUE
CREATE CONSTRAINT firm_type_name IF NOT EXISTS FOR (n:FirmType) REQUIRE n.name IS UNIQUE
CREATE CONSTRAINT service_name IF NOT EXISTS FOR (n:Service) REQUIRE n.name IS UNIQUE
CREATE CONSTRAINT service_category_name IF NOT EXISTS FOR (n:ServiceCategory) REQUIRE n.name IS UNIQUE
CREATE CONSTRAINT tech_category_name IF NOT EXISTS FOR (n:TechCategory) REQUIRE n.name IS UNIQUE
CREATE CONSTRAINT delivery_model_name IF NOT EXISTS FOR (n:DeliveryModel) REQUIRE n.name IS UNIQUE
```

### Full-Text Search Indexes

```cypher
CREATE FULLTEXT INDEX firm_search IF NOT EXISTS
  FOR (n:ServiceFirm) ON EACH [n.name, n.description]

CREATE FULLTEXT INDEX person_search IF NOT EXISTS
  FOR (n:Person) ON EACH [n.firstName, n.lastName, n.headline]

CREATE FULLTEXT INDEX company_search IF NOT EXISTS
  FOR (n:Company) ON EACH [n.name, n.domain]

CREATE FULLTEXT INDEX case_study_search IF NOT EXISTS
  FOR (n:CaseStudy) ON EACH [n.title, n.description]
```

### Property Indexes (for fast lookups)

```cypher
CREATE INDEX firm_website IF NOT EXISTS FOR (n:ServiceFirm) ON (n.website)
CREATE INDEX firm_org_id IF NOT EXISTS FOR (n:ServiceFirm) ON (n.organizationId)
CREATE INDEX skill_level IF NOT EXISTS FOR (n:Skill) ON (n.level)
CREATE INDEX skill_l1 IF NOT EXISTS FOR (n:Skill) ON (n.l1)
CREATE INDEX category_theme IF NOT EXISTS FOR (n:Category) ON (n.theme)
CREATE INDEX company_name IF NOT EXISTS FOR (n:Company) ON (n.name)
CREATE INDEX company_enrichment IF NOT EXISTS FOR (n:Company) ON (n.enrichmentStatus)
CREATE INDEX person_enrichment IF NOT EXISTS FOR (n:Person) ON (n.enrichmentStatus)
```

---

## 7. Taxonomy Seeding

The taxonomy is the shared vocabulary between COS and all data partners. You MUST seed from the same CSV files COS uses.

### Required CSV Files

| File | Contents | Rows |
|------|----------|------|
| `data/categories.csv` | 30 firm categories with definitions + themes | 31 (header + 30) |
| `data/skills-L1.csv` | L1 → L2 skill mappings | 247 |
| `data/skills-L3-map.csv` | L2 → L3 granular skills | 18,421 |
| `data/firm-relationships.csv` | Symbiotic firm pairings | 346 |

### Seeding Order (Dependencies)

Seeds must run in this order:

1. **Categories** (30 nodes) — no dependencies
2. **SkillL1** (~26 nodes) — no dependencies
3. **Skills L2** (~247 nodes) — depends on SkillL1 (creates `BELONGS_TO` edges)
4. **Skills L3** (~18,421 nodes) — depends on Skills L2 (creates `BELONGS_TO` edges)
5. **Firm Relationships** (346 edges) — depends on Categories (creates `PARTNERS_WITH` edges)
6. **Markets** (~200+ nodes) — no dependencies
7. **Languages** (~75+ nodes) — no dependencies
8. **FirmTypes** (10 nodes) — no dependencies
9. **Industries** (~55 nodes) — no dependencies
10. **FirmCategories** — mirrors Categories with new label
11. **TechCategories** (13 nodes)
12. **DeliveryModels** (10 nodes) — mirrors FirmTypes
13. **ServiceCategories** (8 nodes)
14. **Services** (~60 nodes) — depends on ServiceCategories
15. **Industry Hierarchy** — creates IndustryL1 parents + L2 edges
16. **Market Hierarchy** — creates region→country `PARENT_REGION` edges

### Batch MERGE Pattern

All seeding uses MERGE (upsert) with batching for performance:

```typescript
const BATCH_SIZE = 500;

async function batchMerge(
  label: string,
  items: { name: string; props?: Record<string, unknown> }[]
): Promise<number> {
  let created = 0;
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    await neo4jWrite(
      `UNWIND $items AS item
       MERGE (n:${label} {name: item.name})
       SET n += item.props`,
      {
        items: batch.map((it) => ({
          name: it.name,
          props: it.props ?? {},
        })),
      }
    );
    created += batch.length;
  }
  return created;
}
```

**Critical:** Always use MERGE, never CREATE. This makes seeding idempotent — safe to re-run.

---

## 8. Legacy Data Migration Patterns

When migrating from an existing system (CRM, database, spreadsheets), follow this 5-step pattern:

### Step 1: System/Reference Data
- Skills, professional services, industries, markets, languages
- MERGE with existing taxonomy nodes by name
- Add `legacyId` property for cross-referencing

### Step 2: Organizations
- Core business entities (firms, agencies)
- Detect which orgs are "customers" vs. "prospects" using signals (user accounts, match activity)
- Link to industries, categories, markets via edges

### Step 3: Content Data
- Clients/companies, users/contacts, case studies, services, opportunities, partnership preferences
- Create Company nodes, link to organizations via `HAS_CLIENT`
- Create CaseStudy nodes, link skills via `DEMONSTRATES_SKILL`

### Step 4: People/Profiles
- Detailed user profiles with skills, industries, markets, languages
- Work history as nodes: `Person → HAS_WORK_HISTORY → WorkHistory → WORKED_AT → Company`

### Step 5: Network/Relationship Data
- Match recommendations, match activity, partnership status
- These are edges between organizations

### Migration Code Pattern

```typescript
const BATCH_SIZE = 250;

async function batchWrite(
  cypher: string,
  items: unknown[],
  paramName = "items"
): Promise<number> {
  let written = 0;
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    await neo4jWrite(cypher, { [paramName]: batch });
    written += batch.length;
  }
  return written;
}

// Example: Migrate organizations
await batchWrite(
  `UNWIND $items AS item
   MERGE (o:Organization {legacyId: item.id})
   SET o.name = item.name,
       o.website = item.website,
       o.isLegacy = true`,
  orgNodes
);
```

### Key Migration Principles

1. **Always use MERGE** — prevents duplicates on re-run
2. **Preserve legacyId** — keeps cross-reference to source system
3. **Batch everything** — 250-500 items per Cypher call
4. **Run steps in order** — each step may reference nodes from previous steps
5. **Safe-wrap each step** — catch errors per migration function, don't abort the whole pipeline
6. **Log counts** — track how many nodes/edges each step created for verification

---

## 9. Enrichment Pipeline

The enrichment pipeline takes a raw firm profile and progressively enriches it with data from multiple sources:

```
Raw Profile (name + website)
    ↓
[Jina Scraper] → Services, clients, team, case study URLs, about text
    ↓
[PDL Enrichment] → Employee count, location, industry, LinkedIn, founding year
    ↓
[AI Classifier] → Categories, skills (L2), industries, markets, languages, confidence
    ↓
[Graph Writer] → Creates/updates all Neo4j nodes and edges
    ↓
[Case Study Ingestor] → Scrapes case study URLs, extracts skills/industries/outcomes
    ↓
[Expert Enrichment] → LinkedIn profiles → skills, industries, specialist profiles
```

### AI Classifier Pattern

The classifier takes raw content + firmographic data and classifies against the COS taxonomy:

```typescript
const result = await generateObject({
  model: "google/gemini-2.0-flash-001",  // Cheap, fast
  prompt: classificationPrompt,
  schema: z.object({
    categories: z.array(z.string()),   // From 30 COS categories
    skills: z.array(z.string()),       // L2-level from 247 skills
    industries: z.array(z.string()),   // Standard industry names
    markets: z.array(z.string()),      // Countries/regions
    languages: z.array(z.string()),    // Business languages
    confidence: z.number(),            // 0-1
    firmNature: z.enum(["service_provider", "product_company", "brand_or_retailer", "hybrid", "unclear"]),
  }),
});

// CRITICAL: Validate against actual taxonomy
const validCategories = new Set(getCOSCategories().map(c => c.name));
result.categories = result.categories.filter(c => validCategories.has(c));
```

**Always validate AI output against the actual taxonomy.** The AI may hallucinate category names that don't exist.

---

## 10. Graph Writer Pattern

After enrichment, the graph writer creates/updates all nodes and edges atomically:

```typescript
export async function writeFirmToGraph(data: GraphFirmData): Promise<GraphWriteResult> {
  // 1. Create/update ServiceFirm node
  await neo4jWrite(
    `MERGE (f:ServiceFirm {id: $id})
     SET f.name = $name, f.website = $website, ...`,
    { id: data.firmId, ... }
  );

  // 2. Link to categories
  await neo4jWrite(
    `MATCH (f:ServiceFirm {id: $firmId})
     UNWIND $names AS catName
     MERGE (c:FirmCategory {name: catName})
     MERGE (f)-[r:IN_CATEGORY]->(c)
     SET r.source = "enrichment", r.confidence = $confidence`,
    { firmId, names: categories, confidence }
  );

  // 3. Link to skills (L2)
  // 4. Link to industries
  // 5. Link to markets
  // 6. Link to languages
  // 7. Link to services (from website scrape)
  // 8. Link to clients (from website scrape)
  // 9. Create Person stubs (team members found on website)
  // 10. Store case study URLs for later ingestion
}
```

### Edge Provenance

Always tag edges with their source:

```cypher
MERGE (f)-[r:HAS_SKILL]->(s)
SET r.source = "enrichment", r.confidence = 0.85
```

This lets you distinguish AI-inferred skills from self-reported ones, and filter by confidence.

---

## 11. Matching Engine Integration

COS uses a 3-layer cascading search:

### Layer 1: Structured Filter (Neo4j)

Cypher queries eliminate 99% of firms before any AI runs:

```typescript
export async function structuredFilter(
  filters: SearchFilters,
  limit = 500
): Promise<StructuredCandidate[]> {
  const conditions: string[] = [];
  const params: Record<string, unknown> = { limit };

  if (filters.skills?.length) {
    conditions.push(
      `EXISTS { MATCH (f)-[:HAS_SKILL]->(s:Skill) WHERE s.name IN $skills }`
    );
    params.skills = filters.skills;
  }

  if (filters.industries?.length) {
    conditions.push(
      `EXISTS { MATCH (f)-[:SERVES_INDUSTRY]->(i:Industry) WHERE i.name IN $industries }`
    );
    params.industries = filters.industries;
  }

  // Build dynamic query...
  const query = `
    MATCH (f:ServiceFirm)
    WHERE ${conditions.join(" AND ")}
    RETURN f.id AS firmId, f.name AS firmName, ...
    LIMIT $limit
  `;

  // Score based on how many criteria matched
  // Return ~500 candidates sorted by structured score
}
```

### Layer 2: Vector Similarity (pgvector)

The ~500 candidates from Layer 1 get re-ranked using vector similarity of their abstraction profiles (hidden AI-generated summaries). This narrows to ~50.

### Layer 3: LLM Deep Ranking (Gemini Pro)

The ~50 candidates get full LLM analysis. Each gets an explanation of why it's a good match. This produces the final ~10-15 results shown to the user.

**Total cost: < $0.10 per search.**

---

## 12. Extending the Schema for Your Company

Your company MUST implement the core schema above. But you can ADD:

### Company-Specific Node Types

Add nodes that are unique to your business, prefixed to avoid collision:

```
YourPrefix_Product        — Your company's product/service catalog
YourPrefix_Campaign       — Marketing campaigns
YourPrefix_Pipeline       — Sales pipeline stages
YourPrefix_Engagement     — Active client engagements
```

### Company-Specific Edge Types

```
(ServiceFirm)-[:REFERRED_BY]->(Person)          — Referral tracking
(Person)-[:MANAGED_BY]->(Person)                 — Org chart
(Company)-[:ENGAGED_WITH]->(YourPrefix_Campaign) — Campaign participation
```

### Company-Specific Properties

You can add properties to COS-standard nodes:

```cypher
// OK: Adding your own properties to ServiceFirm
MATCH (f:ServiceFirm {id: $id})
SET f.yourPrefix_internalRating = 4.5,
    f.yourPrefix_lastContactDate = datetime(),
    f.yourPrefix_accountOwner = "jane@yourcompany.com"
```

**Rule: Never modify COS-standard properties.** Only add new ones with your prefix.

---

## 13. Data Partner Contract

To be a COS data partner, your graph must:

### MUST DO
1. Use the **same taxonomy** (seed from COS CSV files)
2. Use the **same node labels** for shared concepts (ServiceFirm, Person, Company, Skill, Industry, Market, etc.)
3. Use the **same edge types** for shared relationships
4. Implement **uniqueness constraints** on the same properties
5. Tag all edges with `source` property (so COS knows where data came from)
6. Include a **`cosPartnerId`** property on your ServiceFirm nodes (your company's COS organization ID)
7. Keep taxonomy in sync — when COS updates categories/skills, re-seed

### MUST NOT DO
1. Modify COS-standard property names or semantics
2. Create edges between COS-standard nodes with non-standard edge types
3. Delete or modify COS taxonomy nodes (categories, skills, industries, etc.)
4. Share private/internal data through the interop layer without consent

### MAY DO
1. Add custom node types (prefixed)
2. Add custom properties to COS-standard nodes (prefixed)
3. Add custom edge types (prefixed)
4. Implement additional indexes
5. Add computed properties for internal use

---

## 14. Interop: How Two Graphs Talk

### Option A: Federated Queries (Planned)

COS queries your graph instance directly via Neo4j Fabric or API:

```
COS Graph  ←→  Your Graph
   |                |
   Shared Taxonomy  |
   |                |
   Your firms appear in COS search results
   COS firms appear in your internal tools
```

### Option B: Sync Protocol (Current)

Periodic sync via API:

1. **Your company → COS:** Push enriched ServiceFirm data (firm + edges) via COS API
2. **COS → Your company:** Pull relevant match data, taxonomy updates, shared opportunities

### Sync Payload Format

```typescript
interface PartnerGraphSync {
  // Who is syncing
  cosPartnerId: string;
  syncTimestamp: string;

  // Firms to sync (your enriched data)
  firms: {
    id: string;
    name: string;
    domain: string;
    categories: string[];      // COS category names
    skills: string[];          // COS L2 skill names
    industries: string[];      // Standard industry names
    markets: string[];         // COS market names
    enrichmentStatus: string;
    confidence: number;
  }[];

  // People to sync
  people: {
    id: string;
    fullName: string;
    firmId: string;
    skills: string[];
    industries: string[];
  }[];

  // Case studies to sync
  caseStudies: {
    id: string;
    firmId: string;
    title: string;
    skills: string[];
    industries: string[];
    clientName?: string;
  }[];
}
```

### Trust & Privacy

- Only sync data that the originating firm has consented to share
- Private edges (internal ratings, notes) never sync
- Sync is authenticated with API keys per data partner
- COS validates all synced data against taxonomy before ingesting

---

## 15. Operational Runbook

### Health Check

```typescript
await neo4jDriver.verifyConnectivity();
// If this throws, the connection is broken
```

### Node Count Check

```cypher
MATCH (n) RETURN labels(n) AS labels, count(n) AS count
ORDER BY count DESC LIMIT 20
```

### Taxonomy Integrity Check

```cypher
// Verify L2 skills are connected to L1
MATCH (s:Skill {level: "L2"})
WHERE NOT (s)-[:BELONGS_TO]->(:SkillL1)
RETURN s.name AS orphanedSkill LIMIT 10

// Verify firms have at least one category
MATCH (f:ServiceFirm)
WHERE NOT (f)-[:IN_CATEGORY]->()
RETURN f.name AS uncategorizedFirm LIMIT 10
```

### Backup / Clone

On Neo4j Aura:
1. Go to [console.neo4j.io](https://console.neo4j.io)
2. Click your database → "Clone"
3. This creates a full copy with a **new URI + new password**
4. Update your env vars (URI and password both change)

### Performance Tips

1. **Always batch writes** — 250-500 items per UNWIND call
2. **Use MERGE, not CREATE** — prevents duplicates, enables idempotent re-runs
3. **Index before querying** — full-text indexes for search, property indexes for lookups
4. **Close sessions** — always in `finally` blocks
5. **Use parameterized queries** — never string-interpolate Cypher (security + performance)

---

## Summary

This playbook gives you everything to:

1. **Stand up** a Neo4j graph that's compatible with COS
2. **Seed** the shared taxonomy (categories, skills, industries, markets, languages)
3. **Migrate** legacy data into the graph following COS patterns
4. **Enrich** firms through the scrape → classify → write pipeline
5. **Match** using the 3-layer cascade (structured → vector → LLM)
6. **Extend** the schema for your company's specific needs
7. **Sync** with COS as a data partner

The graph is the foundation. Everything else — AI matching, conversational UX, proactive recommendations — builds on top of the relationships and evidence captured here.
