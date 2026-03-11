# COS Concept — Schema Change Plan
# Knowledge Graph & Database Redesign

> **Created:** 2026-03-10
> **Status:** APPROVED — Ready for implementation
> **Source:** Product owner interview session (full user interview conducted 2026-03-10)
> **Owner:** Assign to lead engineer before implementation begins

---

## Overview

This document captures every schema decision made during a comprehensive product owner interview session. It covers the full redesign of both the Neo4j knowledge graph and the Postgres relational database to support the ecosystem vision — a canonical, multi-role company graph where edges express relationships and roles, not node labels.

**Core principle:**
> Nodes are entities. Edges are roles and relationships. A company is a company — its role in the ecosystem is expressed by the edges connecting it to other nodes.

---

## Table of Contents

1. [Core Architecture Decisions](#1-core-architecture-decisions)
2. [Neo4j — New Node Types](#2-neo4j--new-node-types)
3. [Neo4j — Deprecated Nodes & Migration](#3-neo4j--deprecated-nodes--migration)
4. [Neo4j — New & Updated Edge Types](#4-neo4j--new--updated-edge-types)
5. [Neo4j — Constraints & Indexes](#5-neo4j--constraints--indexes)
6. [Taxonomy Layer](#6-taxonomy-layer)
7. [Postgres — New Tables](#7-postgres--new-tables)
8. [Postgres — Modified Tables](#8-postgres--modified-tables)
9. [Postgres — New Enums](#9-postgres--new-enums)
10. [Migration Sequence](#10-migration-sequence)
11. [Admin Pages Required](#11-admin-pages-required)
12. [Inngest Jobs Required](#12-inngest-jobs-required)
13. [Key Business Rules](#13-key-business-rules)

---

## 1. Core Architecture Decisions

### 1.1 Canonical Company Node
- **Single `(:Company)` node** for every real-world company — clients, vendors, tools, platforms, service firms, solution partners
- **`domain`** is the unique key and primary dedup identifier
- **Multi-label pattern:** `(:Company:ServiceFirm)`, `(:Company:SolutionPartner)` — company identity is foundational, platform role is additive
- **`isCosCustomer: true`** property marks firms registered on the platform (replaces legacy `Organization` node concept)
- Non-member companies are context nodes today — first-class members in the future (schema must not lock them out)

### 1.2 Person Node
- **Single `(:Person)` node** as the universal identity anchor for all humans in the system
- **`linkedinUrl`** is the unique key and enrichment gate
- **`Expert` is NOT a separate node** — it is a role expressed through edges and enriched properties on the `Person` node
- `SpecialistProfile` remains a separate node — it is a distinct curated narrative, not just properties

### 1.3 Role-on-Edge Principle
All roles are expressed on edges, not node labels:
- A company's role (client, vendor, partner) = edge type connecting it to another company
- A person's role (consultant, client contact, solution partner employee) = `CURRENTLY_AT` edge to a `Company`

### 1.4 Evidence-Based Matching
- Skill strength, service strength = derived from case studies (highest weight), expert profiles (medium), website mentions (lowest)
- Never self-reported strength scores — always computed
- Minimum confidence threshold for any edge: **0.5** — below this, the edge is not written

### 1.5 Preference Learning (Dating App Model)
- Partnership preferences = weighted `PREFERS` edges with three signal sources: `stated`, `revealed`, `ai_inferred`
- Revealed behavior always overrides stated preferences
- The graph learns from every partnership acceptance, decline, lead claim, and opportunity response

---

## 2. Neo4j — New Node Types

### 2.1 `Company` (Canonical — replaces Client, legacy Company, solution_partners)

**Minimum required at creation:**
```cypher
(:Company {
  id,               // platform UUID — required
  domain,           // UNIQUE — only required field at creation
  name,             // stored if known at creation, enriched if not
  domains: [],      // additional domains — SUPERADMIN ONLY via merge UI
  source,           // scraped | imported | pdl | user_created | self_registered
  enrichmentStatus, // stub | pending | enriched
  isCosCustomer,    // boolean — true if registered on platform
  createdAt,
  updatedAt
})
```

**Additional labels (additive, not exclusive):**
- `:ServiceFirm` — registered professional services firm on platform
- `:SolutionPartner` — verified tech platform (HubSpot, Salesforce, etc.)

**Multi-domain rule:** `domains[]` array is only writable by superadmin via the company merge UI. The enrichment pipeline NEVER writes to `domains[]` automatically.

---

### 2.2 `Person` (Universal identity anchor — replaces legacy User, Person nodes)

**Minimum required at creation:**
```cypher
(:Person {
  id,               // platform UUID — required
  linkedinUrl,      // UNIQUE — only truly required field — enrichment gate
  firstName,        // populated after PDL enrichment
  middleName,       // optional — populated if available
  lastName,         // populated after PDL enrichment
  emails: [],       // array — multiple emails allowed, primary email at index 0
  source,           // scraped | imported | user_created | self_registered
  enrichmentStatus, // pending | enriched | needs_linkedin
  createdAt,
  updatedAt
})
```

**No `Expert` node** — professional profile data (headline, bio, pdlId, pdlData, title) lives as enriched properties on the `Person` node.

---

### 2.3 `SpecialistProfile` (Focused expert narrative — child of Person)

```cypher
(:SpecialistProfile {
  id,
  title,              // e.g. "Fractional CMO for B2B SaaS"
  bodyDescription,    // curated narrative
  status,             // draft | published | archived
  qualityScore,       // 0-1
  qualityStatus,      // strong | partial | weak | incomplete
  isSearchable,       // surfaces in matching engine when true
  isPrimary,          // one primary per person
  source              // ai_generated | user_created | ai_suggested_user_confirmed
})
```

---

### 2.4 `WorkHistory` (Professional role record — child of Person)

```cypher
(:WorkHistory {
  id,
  title,                  // job title
  description,            // role description
  startAt,                // start date
  endAt,                  // end date — null if current
  isCurrentPosition,      // boolean
  companyStageAtTime,     // pre_seed | seed | series_a | series_b | series_c | growth | enterprise | public
  companySizeAtTime,      // size_band at time of role
  source                  // pdl | linkedin | user_entered
})
```

---

### 2.5 `FirmCategory` (Replaces `Category` for firm classification)

```cypher
(:FirmCategory {
  id,
  name,         // e.g. "Boutique Agency"
  definition,
  theme,
  sampleOrgs,
  isActive      // soft delete
})
```

Seeded from `data/categories.csv`. Fully admin-manageable — add, edit, delete, merge.
ServiceFirm → FirmCategory is **many-to-many** — a firm can belong to multiple categories.

---

### 2.6 `TechCategory` (New — for technology company classification)

```cypher
(:TechCategory {
  id,
  name,         // e.g. "CRM", "Marketing Automation"
  description,
  isActive
})
```

Seeded from `solution_partners.category` enum (13 types). Fully admin-manageable.
Company → TechCategory is **many-to-many**.

---

### 2.7 `DeliveryModel` (Replaces `FirmType`)

```cypher
(:DeliveryModel {
  id,
  name,         // e.g. "Fractional", "Staff Augmentation", "Advisory"
  description,
  isActive
})
```

Seeded from existing FirmType data (10 types). Fully admin-manageable.
ServiceFirm → DeliveryModel is **many-to-many**.

---

### 2.8 `ServiceCategory` (New — L1 service taxonomy)

```cypher
(:ServiceCategory {
  id,
  name,         // e.g. "Go-to-Market Strategy"
  description,
  isActive
})
```

Seeded from `data/categories.csv` themes. Fully admin-manageable.

---

### 2.9 `Service` (Updated — L2 service taxonomy)

```cypher
(:Service {
  id,
  name,             // canonical service name e.g. "Sales Playbook Development"
  rawDescription,   // unstructured — used by Ossy for conversational nuance
  isOrgDefined,     // true if firm defined this themselves — higher trust
  status,           // published | draft | archived — migrated from OrgService
  isActive
})
```

Two-level hierarchy: `ServiceCategory → Service`.
Fully admin-manageable — add, edit, delete, merge, re-parent.

---

## 3. Neo4j — Deprecated Nodes & Migration

| Legacy Node | Action | Migration Path |
|---|---|---|
| `Client` | Deprecate | Migrate to `Company` nodes. Resolve domain via PDL. Stubs get `enrichmentStatus: "stub"` |
| `Category` | Split | `type: "firm"` → `FirmCategory`. `type: "tech"` → `TechCategory` |
| `FirmType` | Rename | Becomes `DeliveryModel`. Data migrated, node relabelled |
| `Expert` | Remove | Professional data moved to enriched properties on `Person` node |
| `Organization` (legacy) | Deprecate | `isCosCustomer: true` + `cosCustomerSince` on canonical `Company` node |
| `User` (legacy) | Deprecate | Recreate as `Person` node. Match by email/name first. Cascade legacy node |
| `Company` (legacy) | Deprecate | Migrate to canonical `Company` node. Domain is dedup key |
| `Person` (legacy) | Deprecate | Migrate to canonical `Person` node. LinkedIn required — else admin queue |
| `LegacySkill` | Deprecate | AI mapping pass → canonical `Skill` nodes via `MAPS_TO` edges. Unmapped → admin queue |
| `ProfessionalService` | Deprecate | AI mapping pass → `ServiceCategory/Service` nodes. Unmapped → admin queue |
| `OrgService` | Deprecate | Migrate to `Service` nodes with `isOrgDefined: true`. `publishStatus` → `status` property |
| `PartnershipPreferences` | Deprecate | Taxonomy prefs → `PREFERS`/`AVOIDS` weighted edges. Scalar constraints stay in Postgres |
| `Opportunity` (legacy) | Cascade delete | No migration. New Opportunity concept lives in Postgres only |
| `MatchRecommendation` | Keep (read-only) | Legacy blocklist — used to prevent re-suggesting old matches via `PREVIOUSLY_MATCHED` edges |
| `MatchActivity` | Keep (read-only) | Paired with MatchRecommendation as historical signal |

### Legacy Person Migration Rules
```
For each legacy Person / User node:
  Has linkedinUrl?
    YES → Create Person node → queue for PDL enrichment
    NO  → Create stub Person node → enrichmentStatus: "needs_linkedin" → admin review queue

  Match existing Person node? (by linkedinUrl first, then email)
    MATCH FOUND → merge data, new node wins, legacy fills gaps only
    NO MATCH    → new Person node created

  Cascade delete legacy node after migration
```

---

## 4. Neo4j — New & Updated Edge Types

### 4.1 Company ↔ Company Relationships (32 types)

All company relationship edges carry:
```
confidence: float (0.5 minimum — below this, edge not written)
source: scraped | case_study | pdl | user_confirmed | admin
createdAt, updatedAt
```

**Commercial:**
| Edge | Direction | Description |
|---|---|---|
| `HAS_CLIENT` | A → B | A delivered services to B |
| `IS_VENDOR_TO` | A → B | A regularly supplies B |
| `IS_RESELLER_OF` | A → B | A resells B's product |
| `LICENSES_FROM` | A → B | A pays B for IP/software rights |
| `IS_DISTRIBUTOR_OF` | A → B | A distributes B's product |
| `IS_FRANCHISEE_OF` | A → B | A operates under B's franchise |
| `WHITE_LABELS_FOR` | A → B | A delivers work B sells as their own |

**Partnership & Collaboration:**
| Edge | Direction | Description |
|---|---|---|
| `PARTNERS_WITH` | A ↔ B | Formal or inferred partnership |
| `SUBCONTRACTS_TO` | A → B | A executes work on behalf of B |
| `REFERS_TO` | A → B | A sends leads/clients to B |
| `CO_DELIVERS_WITH` | A ↔ B | Joint project delivery |
| `IS_PREFERRED_VENDOR_OF` | A → B | A is on B's approved vendor list |
| `IS_CERTIFIED_PARTNER_OF` | A → B | A holds certification from B |
| `IS_IMPLEMENTATION_PARTNER_OF` | A → B | A implements B's platform for clients |
| `IS_AFFILIATE_OF` | A → B | A earns commission promoting B |

**Technology & Platform:**
| Edge | Direction | Description |
|---|---|---|
| `USES_TOOL` | A → B | A uses B's software operationally |
| `BUILT_ON` | A → B | A's product built on B's platform |
| `INTEGRATES_WITH` | A ↔ B | Native integration between A and B |
| `IS_TECH_PARTNER_OF` | A ↔ B | Formal technology partnership |

**Competitive:**
| Edge | Direction | Description |
|---|---|---|
| `COMPETES_WITH` | A ↔ B | Direct competitors |
| `ADJACENT_TO` | A ↔ B | Related but non-overlapping markets |

**Ownership & Structure:**
| Edge | Direction | Description |
|---|---|---|
| `IS_SUBSIDIARY_OF` | A → B | A legally owned by B |
| `IS_PARENT_OF` | A → B | A owns B |
| `IS_ACQUIRED_BY` | A → B | A acquired by B |
| `IS_SPIN_OFF_OF` | A → B | A spun out of B |
| `IS_JOINT_VENTURE_OF` | A → B | A is a JV created by B and others |
| `HAS_INVESTED_IN` | A → B | A holds equity in B |

**Community & Network:**
| Edge | Direction | Description |
|---|---|---|
| `IS_MEMBER_OF` | A → B | A is member of B (association, collective) |
| `IS_SPONSORED_BY` | A → B | A receives sponsorship from B |
| `IS_ACCREDITED_BY` | A → B | A holds accreditation from B |

**People & Talent (Graph inference):**
| Edge | Direction | Description |
|---|---|---|
| `SHARES_ALUMNI_WITH` | A ↔ B | People who worked at A also worked at B |
| `SHARES_ADVISOR_WITH` | A ↔ B | Both companies share a common advisor |

---

### 4.2 Preference Edges (Company → Taxonomy)

```cypher
(:Company:ServiceFirm)-[:PREFERS {
  weight: float,          // 0.0 - 1.0 — strength of preference
  source: string,         // stated | revealed | ai_inferred
  dimension: string,      // industry | market | firm_category | delivery_model | service
  updatedAt: timestamp
}]->(:Industry | :Market | :FirmCategory | :DeliveryModel | :Service)

(:Company:ServiceFirm)-[:AVOIDS {
  weight: float,          // 1.0 = hard avoidance
  source: string,
  dimension: string,
  updatedAt: timestamp
}]->(:Industry | :Market | :FirmCategory | :DeliveryModel | :Service)
```

**Weight update triggers:**
- Partnership accepted → `revealed` weight boost on shared taxonomy nodes
- Partnership declined → weight reduction or `AVOIDS` edge
- Lead claimed → `revealed` weight boost
- Opportunity responded → `revealed` weight boost

---

### 4.3 Person Edges

```cypher
// Current roles — multiple allowed simultaneously
(:Person)-[:CURRENTLY_AT {
  title: string,
  engagementType: string,   // full_time | fractional | advisor | board | embedded
  startDate: string,
  isPrimary: boolean,
  source: string
}]->(:Company)

// Work history
(:Person)-[:HAS_WORK_HISTORY]->(:WorkHistory)-[:AT_COMPANY]->(:Company)
(:WorkHistory)-[:DEMONSTRATED_SKILL]->(:Skill)
(:WorkHistory)-[:IN_INDUSTRY]->(:Industry)

// Taxonomy connections
(:Person)-[:HAS_SKILL { proficiency, strength, source }]->(:Skill)
(:Person)-[:HAS_INDUSTRY_EXPERIENCE]->(:Industry)
(:Person)-[:OPERATES_IN]->(:Market)
(:Person)-[:SPEAKS { proficiency }]->(:Language)

// Profile connections
(:Person)-[:HAS_SPECIALIST_PROFILE]->(:SpecialistProfile)
(:Person)-[:CONTRIBUTED_TO]->(:CaseStudy)

// Auth link
(:User)-[:IS_PERSON]->(:Person)
```

---

### 4.4 Updated Existing Edges

| Edge | Change |
|---|---|
| `HAS_CLIENT` | Now points to `Company` node — not `Client` node |
| `HAS_SKILL` (ServiceFirm) | Add `strength` (0-1, derived), `evidenceCount`, `caseStudyCount`, `expertCount`, `serviceCount`, `lastComputedAt` |
| `OFFERS_SERVICE` | Add `strength` (0-1, derived), `evidenceCount`, `caseStudyCount`, `expertCount`, `websiteMentionCount`, `lastComputedAt` |
| `SPEAKS` (ServiceFirm) | Add `proficiency` (derived from experts), `speakerCount`, `source: "derived"` |
| `IN_CATEGORY` | Now points to `FirmCategory` or `TechCategory` — not `Category` |

---

### 4.5 Auto-Computed Edges

| Edge | Trigger | Logic |
|---|---|---|
| `SHARES_CLIENT` | Post-enrichment Inngest job (Phase 2) | Two ServiceFirms sharing a `HAS_CLIENT → Company` edge |
| `PREVIOUSLY_MATCHED` | Legacy migration one-time job | Written from `MatchRecommendation` data — blocklist for new matching engine |

---

### 4.6 Service → Skill Normalization

```cypher
(:Service)-[:MAPS_TO_SKILL]->(:Skill)
```

Raw scraped service strings normalized to canonical Skill taxonomy by AI during enrichment. `rawDescription` on `Service` node preserved for Ossy conversational context.

---

## 5. Neo4j — Constraints & Indexes

### New Uniqueness Constraints
```cypher
CREATE CONSTRAINT company_domain IF NOT EXISTS FOR (n:Company) REQUIRE n.domain IS UNIQUE;
CREATE CONSTRAINT person_linkedin IF NOT EXISTS FOR (n:Person) REQUIRE n.linkedinUrl IS UNIQUE;
CREATE CONSTRAINT firm_category_name IF NOT EXISTS FOR (n:FirmCategory) REQUIRE n.name IS UNIQUE;
CREATE CONSTRAINT tech_category_name IF NOT EXISTS FOR (n:TechCategory) REQUIRE n.name IS UNIQUE;
CREATE CONSTRAINT delivery_model_name IF NOT EXISTS FOR (n:DeliveryModel) REQUIRE n.name IS UNIQUE;
CREATE CONSTRAINT service_category_name IF NOT EXISTS FOR (n:ServiceCategory) REQUIRE n.name IS UNIQUE;
```

### New Property Indexes
```cypher
CREATE INDEX company_name IF NOT EXISTS FOR (n:Company) ON (n.name);
CREATE INDEX company_enrichment IF NOT EXISTS FOR (n:Company) ON (n.enrichmentStatus);
CREATE INDEX company_is_cos_customer IF NOT EXISTS FOR (n:Company) ON (n.isCosCustomer);
CREATE INDEX person_enrichment IF NOT EXISTS FOR (n:Person) ON (n.enrichmentStatus);
CREATE INDEX person_email IF NOT EXISTS FOR (n:Person) ON (n.emails);
CREATE INDEX work_history_title IF NOT EXISTS FOR (n:WorkHistory) ON (n.title);
CREATE INDEX work_history_dates IF NOT EXISTS FOR (n:WorkHistory) ON (n.startAt, n.endAt);
CREATE INDEX work_history_stage IF NOT EXISTS FOR (n:WorkHistory) ON (n.companyStageAtTime);
```

### New Full-Text Indexes
```cypher
CREATE FULLTEXT INDEX company_search IF NOT EXISTS FOR (n:Company) ON EACH [n.name, n.domain];
CREATE FULLTEXT INDEX person_search IF NOT EXISTS FOR (n:Person) ON EACH [n.firstName, n.lastName, n.headline];
```

---

## 6. Taxonomy Layer

### 6.1 Industry Taxonomy

**Structure:** L1 (Sector) → L2 (Industry) → L3 (Sub-industry)
**Base dataset:** Crunchbase taxonomy (L1/L2 seed)
**L3:** Grown organically from platform data — admin promotes emerging sub-industries

**External mappings stored as properties on `Industry` node:**
```cypher
(:Industry {
  name,                 // COS canonical name
  level,                // L1 | L2 | L3
  linkedinValue,        // primary LinkedIn industry mapping
  crunchbaseValue,      // primary Crunchbase mapping
  cosLegacyId,          // legacy COS industry ID
  cosLegacyName         // legacy COS industry name
})
```

**Postgres `industry_mappings` table** handles all source → canonical mappings.
**Postgres `unmapped_industries` staging table** holds unrecognized values for admin review.

---

### 6.2 Market Taxonomy

**Structure:** L1 (Global Region) → L2 (Country, ISO code) → L3 (City/Metro, lat/lng)
**Base dataset:**
- L1/L2: ISO 3166-1 standard
- L3: GeoNames dataset (~4M cities, filtered by population threshold)

**Proximity queries** run in Postgres (Haversine formula) — not Neo4j.
**Proximity matching** is a conversational filter via Ossy — not a hard UI filter control.

---

### 6.3 Skills Taxonomy

**Structure:** SkillL1 → Skill (L2) → Skill (L3) — existing, unchanged
**Admin-manageable:** add, edit, delete, merge, re-parent
**`HAS_SKILL` strength** on ServiceFirm edges: derived from case studies (highest) + expert profiles (medium) + service mentions (lowest). Recomputed by Inngest on content changes.

---

### 6.4 Service Taxonomy

**Structure:** ServiceCategory (L1) → Service (L2)
**Seeded from:** `data/categories.csv` themes
**Extensible to L3** in the future — architecture supports it, not built now
**Admin-manageable:** add, edit, delete, merge, re-parent
**`OFFERS_SERVICE` strength** on ServiceFirm edges: derived same pattern as skills.

---

## 7. Postgres — New Tables

### 7.1 `industries` (Canonical industry taxonomy)

```sql
CREATE TABLE industries (
  id                text PRIMARY KEY,
  name              text NOT NULL,                    -- COS canonical name
  level             industry_level NOT NULL,          -- L1 | L2 | L3
  parent_id         text REFERENCES industries(id),   -- hierarchy
  sector            text,                             -- L1 name (denormalized)
  linkedin_value    text,                             -- primary LinkedIn mapping
  crunchbase_value  text,                             -- primary Crunchbase mapping
  cos_legacy_id     text,                             -- legacy COS industry ID
  cos_legacy_name   text,                             -- legacy COS industry name
  graph_node_id     text,                             -- Neo4j node ID
  is_active         boolean DEFAULT true,
  created_at        timestamp DEFAULT now(),
  updated_at        timestamp DEFAULT now()
);
```

### 7.2 `industry_mappings` (Source → canonical translation layer)

```sql
CREATE TABLE industry_mappings (
  id                    text PRIMARY KEY,
  canonical_industry_id text REFERENCES industries(id),
  source                text NOT NULL,    -- linkedin | crunchbase | cos_legacy
  external_value        text NOT NULL,    -- raw value from source
  external_label        text,             -- human readable label from source
  confidence            real,             -- 0.5-1.0
  mapped_by             text,             -- admin | ai | auto
  created_at            timestamp DEFAULT now()
);
```

### 7.3 `unmapped_industries` (Staging for unrecognized industry values)

```sql
CREATE TABLE unmapped_industries (
  id              text PRIMARY KEY,
  raw_value       text NOT NULL,
  source          text NOT NULL,     -- linkedin | crunchbase | pdl | scraped
  occurrence_count integer DEFAULT 1,
  example_company text,              -- first company where this was seen
  status          text DEFAULT 'pending', -- pending | mapped | dismissed
  mapped_to_id    text REFERENCES industries(id),
  created_at      timestamp DEFAULT now(),
  updated_at      timestamp DEFAULT now()
);
```

### 7.4 `markets` (Canonical market taxonomy with geo data)

```sql
CREATE TABLE markets (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  level       market_level NOT NULL,     -- L1 | L2 | L3
  parent_id   text REFERENCES markets(id),
  iso_code    text,                      -- ISO 3166-1 for countries
  latitude    real,                      -- for L3 cities
  longitude   real,                      -- for L3 cities
  radius_km   real,                      -- metro area radius for L3
  population  integer,                   -- from GeoNames
  graph_node_id text,
  is_active   boolean DEFAULT true,
  created_at  timestamp DEFAULT now(),
  updated_at  timestamp DEFAULT now()
);
```

### 7.5 `firm_categories` (Canonical firm category taxonomy — Postgres mirror)

```sql
CREATE TABLE firm_categories (
  id            text PRIMARY KEY,
  name          text NOT NULL UNIQUE,
  definition    text,
  theme         text,
  sample_orgs   text,
  graph_node_id text,
  is_active     boolean DEFAULT true,
  created_at    timestamp DEFAULT now(),
  updated_at    timestamp DEFAULT now()
);
```

### 7.6 `tech_categories` (Canonical tech category taxonomy — Postgres mirror)

```sql
CREATE TABLE tech_categories (
  id            text PRIMARY KEY,
  name          text NOT NULL UNIQUE,
  description   text,
  graph_node_id text,
  is_active     boolean DEFAULT true,
  created_at    timestamp DEFAULT now(),
  updated_at    timestamp DEFAULT now()
);
```

### 7.7 `delivery_models` (Canonical delivery model taxonomy — Postgres mirror)

```sql
CREATE TABLE delivery_models (
  id            text PRIMARY KEY,
  name          text NOT NULL UNIQUE,
  description   text,
  graph_node_id text,
  is_active     boolean DEFAULT true,
  created_at    timestamp DEFAULT now(),
  updated_at    timestamp DEFAULT now()
);
```

### 7.8 `service_categories` (L1 service taxonomy — Postgres mirror)

```sql
CREATE TABLE service_categories (
  id            text PRIMARY KEY,
  name          text NOT NULL UNIQUE,
  description   text,
  graph_node_id text,
  is_active     boolean DEFAULT true,
  created_at    timestamp DEFAULT now(),
  updated_at    timestamp DEFAULT now()
);
```

### 7.9 `services` (L2 service taxonomy — Postgres mirror)

```sql
CREATE TABLE services (
  id                  text PRIMARY KEY,
  name                text NOT NULL UNIQUE,
  service_category_id text REFERENCES service_categories(id),
  description         text,
  graph_node_id       text,
  is_active           boolean DEFAULT true,
  created_at          timestamp DEFAULT now(),
  updated_at          timestamp DEFAULT now()
);
```

### 7.10 `leads` (PARTIALLY BUILT — see partnerships.md)

```sql
CREATE TABLE leads (
  id              text PRIMARY KEY,
  opportunity_id  text REFERENCES opportunities(id),
  firm_id         text REFERENCES service_firms(id),
  title           text NOT NULL,
  description     text,
  required_skills jsonb,
  required_industries jsonb,
  estimated_value text,
  timeline        text,
  status          lead_status DEFAULT 'draft',
  source          text,             -- ai_generated | manual | ossy
  confidence      real,             -- min 0.5
  created_at      timestamp DEFAULT now(),
  updated_at      timestamp DEFAULT now()
);
```

### 7.11 `lead_shares`

```sql
CREATE TABLE lead_shares (
  id                    text PRIMARY KEY,
  lead_id               text REFERENCES leads(id) ON DELETE CASCADE,
  shared_with_firm_id   text REFERENCES service_firms(id),
  shared_by             text REFERENCES users(id),
  viewed_at             timestamp,
  claimed_at            timestamp,
  created_at            timestamp DEFAULT now()
);
```

---

## 8. Postgres — Modified Tables

### 8.1 `service_firms`
- Add `graph_node_id` → canonical `Company` Neo4j node ID
- Add `is_cos_customer` boolean (denormalized from graph for fast Postgres queries)
- Add `cos_customer_since` timestamp

### 8.2 `solution_partners`
- Add `canonical_company_id` FK → future `companies` table
- Add `graph_node_id` → canonical `Company:SolutionPartner` Neo4j node ID

### 8.3 `imported_companies`
- Add `canonical_company_id` FK → future `companies` table

### 8.4 `imported_clients`
- Add `canonical_company_id` FK → future `companies` table

### 8.5 `imported_contacts`
- Add `canonical_person_id` FK → future `persons` table

### 8.6 `partner_preferences`
- **Remove** taxonomy array fields — these move to Neo4j `PREFERS` edges
- **Keep** scalar fields only: `rate_start`, `rate_end`, `project_size_ranges[]`, `deal_breakers[]`, `growth_goals`, `raw_onboarding_data`
- Add `preferences_synced_at` timestamp — tracks when Neo4j edges were last written from this table

### 8.7 `expert_profiles`
- Rename concept to "General Expert Profile" in documentation
- Add `person_node_id` → canonical `Person` Neo4j node ID
- Add `linkedin_url` column if not present — enrichment gate

---

## 9. Postgres — New Enums

```sql
CREATE TYPE enrichment_status AS ENUM ('stub', 'pending', 'enriched', 'needs_linkedin');
CREATE TYPE engagement_type AS ENUM ('full_time', 'fractional', 'advisor', 'board', 'embedded');
CREATE TYPE preference_source AS ENUM ('stated', 'revealed', 'ai_inferred');
CREATE TYPE lead_status AS ENUM ('draft', 'open', 'shared', 'claimed', 'won', 'lost', 'expired');
CREATE TYPE industry_level AS ENUM ('L1', 'L2', 'L3');
CREATE TYPE market_level AS ENUM ('L1', 'L2', 'L3');
CREATE TYPE company_source AS ENUM ('scraped', 'imported', 'pdl', 'user_created', 'self_registered');
CREATE TYPE person_source AS ENUM ('scraped', 'imported', 'user_created', 'self_registered');
```

---

## 10. Migration Sequence

> ⚠️ Execute in this exact order. Each step depends on the previous. Never run steps in parallel unless explicitly noted.

### Phase A — Taxonomy Foundation (Safe to run first — no data loss)
1. Create new Postgres taxonomy tables: `industries`, `markets`, `firm_categories`, `tech_categories`, `delivery_models`, `service_categories`, `services`
2. Seed `FirmCategory` nodes in Neo4j from `data/categories.csv`
3. Seed `TechCategory` nodes from `solution_partners.category` enum
4. Seed `DeliveryModel` nodes from existing `FirmType` nodes
5. Seed `ServiceCategory` + `Service` nodes from categories data
6. Seed industry taxonomy L1/L2 from Crunchbase dataset
7. Seed market taxonomy L1/L2 from ISO 3166-1 + L3 from GeoNames
8. Build `industry_mappings` table — LinkedIn → Crunchbase → legacy COS mappings

### Phase B — Canonical Company Nodes
9. Create `Company` nodes for all existing `ServiceFirm` nodes (multi-label: `Company:ServiceFirm`)
10. Sync all `solution_partners` rows → `Company:SolutionPartner` nodes
11. Migrate existing `Client` nodes → `Company` stub nodes (domain resolution via PDL)
12. Migrate legacy `Company` nodes → canonical `Company` nodes
13. Migrate legacy `Organization` nodes → `Company` nodes with `isCosCustomer: true`
14. Write taxonomy edges for all new `Company` nodes (IN_INDUSTRY, OPERATES_IN, IN_CATEGORY)

### Phase C — Person Nodes
15. Migrate legacy `User` nodes → `Person` nodes (match first, create if no match)
16. Migrate legacy `Person` (imported contacts) → canonical `Person` nodes
17. Queue all `Person` nodes with `linkedinUrl` for PDL enrichment
18. Flag all `Person` nodes without `linkedinUrl` as `enrichmentStatus: "needs_linkedin"` → admin queue

### Phase D — Skill & Service Taxonomy Migration
19. AI mapping pass: `LegacySkill` → canonical `Skill` nodes. Unmapped → `admin review queue`
20. AI mapping pass: `ProfessionalService` → `ServiceCategory/Service` nodes. Unmapped → admin queue
21. Migrate `OrgService` nodes → `Service` nodes with `isOrgDefined: true`, status preserved

### Phase E — Relationship Migration
22. Repoint all `HAS_CLIENT` edges from `Client` → canonical `Company` nodes
23. Migrate `WorkHistory` edges → reparent from legacy `User` to `Person` nodes
24. Migrate `PartnershipPreferences` → `PREFERS`/`AVOIDS` weighted edges (source: "stated")
25. Write `PREVIOUSLY_MATCHED` blocklist edges from `MatchRecommendation` data

### Phase F — Cleanup
26. Deprecate all legacy nodes: set `isLegacy: true`, `migratedAt` timestamp
27. Cascade delete `Opportunity` (legacy) nodes
28. Validate graph integrity — check for orphaned nodes, broken edges
29. Run full-text index rebuild
30. Update `neo4j-schema.ts` with all new constraints and indexes

---

## 11. Admin Pages Required

### New Pages

| Page | Path | Capabilities |
|---|---|---|
| Company Management | `/admin/companies` | View all companies, filter by enrichmentStatus, merge duplicates, edit properties, trigger enrichment, delete |
| Company Detail | `/admin/companies/[id]` | Full company profile, all edges, enrichment history, merge tool |
| Industry Taxonomy | `/admin/taxonomy/industries` | CRUD L1/L2/L3, manage mappings, unmapped queue, AI suggest, bulk import |
| Market Taxonomy | `/admin/taxonomy/markets` | CRUD L1/L2/L3, proximity radius settings |
| Skill Taxonomy | `/admin/taxonomy/skills` | CRUD, re-parent, merge |
| Service Taxonomy | `/admin/taxonomy/services` | CRUD, re-parent, merge |
| FirmCategory Management | `/admin/taxonomy/firm-categories` | CRUD, merge |
| TechCategory Management | `/admin/taxonomy/tech-categories` | CRUD, merge |
| DeliveryModel Management | `/admin/taxonomy/delivery-models` | CRUD, merge |
| Person Management | `/admin/persons` | View all persons, filter by enrichmentStatus, trigger PDL enrichment, flag for review |
| Migration Dashboard | `/admin/migration` | Track progress of all migration phases, re-run failed steps |

### Enhanced Existing Pages

| Page | Enhancement |
|---|---|
| `/admin/neo4j` | Add new node type counts, migration phase status |
| `/admin/partnerships` | Add PREVIOUSLY_MATCHED blocklist visibility |

---

## 12. Inngest Jobs Required

### New Background Jobs

| Job | Trigger | Purpose |
|---|---|---|
| `company/enrich-stub` | New `Company` node created with `enrichmentStatus: "stub"` | Hit PDL/Clearbit to populate name, industry, size, etc. |
| `company/write-taxonomy-edges` | After company enrichment completes | Write IN_INDUSTRY, OPERATES_IN, IN_CATEGORY edges |
| `person/enrich-pdl` | New `Person` node with `linkedinUrl` | Hit PDL to populate name, headline, work history, skills |
| `skill/compute-strength` | Case study ingested OR expert profile updated | Recompute `HAS_SKILL` strength scores on ServiceFirm |
| `service/compute-strength` | Case study ingested OR service added/removed | Recompute `OFFERS_SERVICE` strength scores on ServiceFirm |
| `language/derive-firm-proficiency` | Expert `SPEAKS` edge updated | Derive firm-level language proficiency from all experts |
| `industry/map-unmapped` | New value added to `unmapped_industries` | AI suggests canonical mapping — admin reviews |
| `preference/update-revealed` | Partnership accepted/declined, lead claimed, opportunity responded | Update `PREFERS`/`AVOIDS` edge weights from behavior |
| `matching/surprise-match` | Scheduled — periodic | Ossy identifies paying firms that would benefit from freemium user introductions |
| `matching/trial-unlock-check` | Profile content updated | Check if new user meets composite quality score ≥ 0.7 for trial match |

### One-Time Migration Jobs (run once, then decommission)

| Job | Purpose |
|---|---|
| `migration/client-nodes-to-company` | Migrate Client → Company stub nodes |
| `migration/legacy-user-to-person` | Migrate legacy User → Person nodes |
| `migration/legacy-person-to-person` | Migrate imported Person → canonical Person nodes |
| `migration/legacy-skill-mapping` | AI map LegacySkill → canonical Skill |
| `migration/professional-service-mapping` | AI map ProfessionalService → ServiceCategory/Service |
| `migration/org-service-to-service` | Migrate OrgService → Service nodes |
| `migration/partnership-prefs-to-edges` | Migrate PartnershipPreferences → PREFERS edges |
| `migration/previously-matched-edges` | Write PREVIOUSLY_MATCHED blocklist from MatchRecommendation data |

---

## 13. Key Business Rules

> These rules must be enforced in code — not just documented. Add validation at the API layer.

| Rule | Enforcement |
|---|---|
| Edge confidence minimum 0.5 | Reject any edge write below 0.5 confidence |
| `domains[]` on Company = superadmin only | API route guard — only `superadmin` role can write `domains[]` |
| LinkedIn URL required for PDL enrichment | Enrichment pipeline checks `linkedinUrl` before queuing |
| Person without LinkedIn → `needs_linkedin` status | Set automatically at Person node creation |
| Surprise match = Ossy-initiated only | No UI control for freemium users to request a surprise match |
| Lead sharing = firm owner review required | No auto-dispatch of leads — always human-approved |
| Legacy matches = never re-suggested | `PREVIOUSLY_MATCHED` edge check in Layer 1 Neo4j filter |
| Skill/Service strength = derived only | No API endpoint accepts manual strength score writes |
| `PREFERS` weight `revealed` > `stated` | Matching engine weights: revealed × 1.0, stated × 0.7, ai_inferred × 0.6 |
| Trial match = one-time, non-renewable | Tracked in `ai_usage_log` with `feature: "trial_match"` — gate checks this |
| Freemium = passive only | Cannot initiate partnership requests, searches, or opportunity sharing |

---

## Files To Create / Update After Implementation

| File | Action |
|---|---|
| `src/lib/neo4j-schema.ts` | Add all new constraints and indexes |
| `src/lib/neo4j-seed.ts` | Add FirmCategory, TechCategory, DeliveryModel, ServiceCategory, Service seeding |
| `src/lib/enrichment/graph-writer.ts` | Update to write to Company nodes, Person nodes, new edge types |
| `src/lib/matching/structured-filter.ts` | Update Cypher to use new node/edge labels |
| `src/lib/billing/plan-limits.ts` | Update Free plan limits to new freemium model |
| `src/lib/billing/profile-quality-scorer.ts` | CREATE NEW — composite quality score for trial unlock |
| `docs/context/knowledge-graph.md` | Full rewrite to reflect new schema |
| `docs/context/database.md` | Add all new tables and modified tables |
| `docs/context/billing.md` | Already updated — plan limits still need code update |
| `docs/context/partnerships.md` | Already updated — Lead system needs implementation |

---

*This document was produced from a comprehensive product owner interview session conducted on 2026-03-10. All decisions are approved and ready for implementation. Assign a lead engineer to own the migration sequence before any code is written.*
