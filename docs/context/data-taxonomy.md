# 16. Data & Taxonomy

> Last updated: 2026-03-09

Reference data powering the COS matching engine, knowledge graph, and AI classification pipeline. All CSV files live in `data/` at the project root. Parsed at runtime by `src/lib/taxonomy.ts` and `src/lib/taxonomy/index.ts`.

---

## CSV File Inventory

| File | Rows (excl. header) | Columns | Purpose |
|------|---------------------|---------|---------|
| `categories.csv` | 30 | Category, Definition, Sample Orgs, Theme | Firm category taxonomy (what a firm *does*) |
| `skills-L1.csv` | 245 | L1, L2 | L1 -> L2 skill mapping (identical to skills-L2-map.csv) |
| `skills-L2-map.csv` | 245 | L1, L2 | Duplicate of skills-L1.csv (same content) |
| `skills-L3-map.csv` | 18,419 | L2, L3 | L2 -> L3 granular skill/tool mapping |
| `firm-relationships.csv` | 345 | Company Type A, Company Type B, Nature of Relationship, Client Use Case, Direction of Engagement, Partnership Frequency, Revenue Model, Risk or Complexity, Real World Example, Key Skills, Citations | Symbiotic partnership pairings between firm types |
| `persona-positioning.csv` | 534 | profile_match, instructions | Sales positioning playbook: role x firm-size matrix |
| `skills-strings.json` | 30 entries | JSON array | Flat list of L1 skill category names + header tokens |
| `skills-workbook.xlsx` | - | - | Source Excel workbook (not parsed at runtime) |
| `specializations-gid0.csv` | 0 | - | Empty placeholder (Google Sheets export artifact) |
| `firm-relationships-sheet0.csv` | 0 | - | Empty (broken Google Sheets export) |
| `firm-relationships-sheet1.csv` | 17 | - | Google Sheets auth page HTML (not usable data) |
| `persona-positioning-sheet1.csv` | 0 | - | Empty (broken Google Sheets export) |
| `legacy/` | - | - | Contains `Data Dump (JSON)/` with 5 step-folders of legacy n8n data |

**Active files used by code:** `categories.csv`, `skills-L1.csv`, `skills-L3-map.csv`, `firm-relationships.csv`, `persona-positioning.csv`.

---

## 3-Level Skill Hierarchy

The skill taxonomy is a 3-level tree: L1 (broad domain) -> L2 (subcategory) -> L3 (specific tool/skill).

### Summary

| Level | Count | Description | Example |
|-------|-------|-------------|---------|
| L1 | 26 | Broad domains | Information Technology, Marketing and Public Relations |
| L2 | 246 | Subcategories | Cloud Computing, Digital Marketing, Financial Modeling |
| L3 | ~18,419 | Granular skills/tools | AWS Lambda, Google Ads, Monte Carlo Simulation |

### All 26 L1 Categories

1. Administration (2 L2s)
2. Agriculture, Horticulture, and Landscaping (3 L2s)
3. Analysis (11 L2s)
4. Architecture and Construction (4 L2s)
5. Business (19 L2s)
6. Customer and Client Support (3 L2s)
7. Design (9 L2s)
8. Economics, Policy, and Social Studies (4 L2s)
9. Education and Training (8 L2s)
10. Energy and Utilities (1 L2)
11. Engineering (3 L2s)
12. Environment (3 L2s)
13. Finance (29 L2s)
14. Hospitality and Food Services (5 L2s)
15. Human Resources (7 L2s)
16. Information Technology (66 L2s)
17. Law, Regulation, and Compliance (11 L2s)
18. Manufacturing and Production (5 L2s)
19. Marketing and Public Relations (13 L2s)
20. Media and Communications (10 L2s)
21. Performing Arts, Sports, and Recreation (2 L2s)
22. Personal Care and Services (3 L2s)
23. Physical and Inherent Abilities (2 L2s)
24. Property and Real Estate (3 L2s)
25. Sales (12 L2s)
26. Transportation, Supply Chain, and Logistics (8 L2s)

### Hierarchy Example

```
Information Technology (L1)
  -> Cloud Computing (L2)
    -> AWS EC2 (L3)
    -> Azure Functions (L3)
    -> Google Cloud Platform (L3)
    -> Kubernetes (L3)
    -> ... (~100+ L3s per popular L2)
  -> Cybersecurity (L2)
    -> Penetration Testing (L3)
    -> SIEM (L3)
    -> ... (372 L3s)
  -> Software Development (L2)
    -> ... (430 L3s)
```

### Top L2 Categories by L3 Depth

| L2 Skill | L3 Count |
|----------|----------|
| Software Development Tools | 463 |
| Software Development | 430 |
| Cybersecurity | 372 |
| Photo/Video Production and Technology | 298 |
| Web Design and Development | 292 |
| AI and Machine Learning (AI/ML) | 287 |
| Data Management | 274 |
| Telecommunications | 260 |
| Java | 233 |
| Regulation and Legal Compliance | 229 |

---

## Firm Categories (30 Types)

Defined in `categories.csv`. Each has a definition, theme grouping, and sample member firms.

| # | Category | Theme | Sample Orgs |
|---|----------|-------|-------------|
| 1 | Fractional & Embedded Leadership | - | Chameleon Collective, FOAF, STA |
| 2 | Training, Enablement & Professional Coaching | - | Agency Outsight |
| 3 | Outsourcing & Managed Business Services | - | AloaLabs, E2M |
| 4 | Brand Strategy & Positioning | Brand | Gamut Creative, Unfettered, Wild Tame Co. |
| 5 | Creative, Content & Production | Creative | PopFizz, Not A Production Company |
| 6 | Customer Success & Retention | Customer | Sinesis Limited |
| 7 | Data, Analytics & Business Intelligence | Data | Mediaconfidant |
| 8 | Market Research & Customer Intelligence | Data | Soundcheck Insights, RETHINK Retail |
| 9 | Finance, Accounting & Tax | Finance | FlowFi |
| 10 | Human Capital & Talent | HR | CloudTask |
| 11 | People Operations & HR | HR | Employ HR Pro |
| 12 | Privacy, Risk & Compliance | Legal | (none listed) |
| 13 | Legal | Legal | Lakelet Advisory |
| 14 | Growth Marketing & Demand Generation | Marketing | Pillar Marketing, iBeAuthentic |
| 15 | Lifecycle, CRM & Marketing Operations | Marketing | Retencity |
| 16 | Public Relations & Communications | Marketing | Carve Comms, Auerbach International |
| 17 | Operations & Process | Operations | (none listed) |
| 18 | Change, Transformation & Reengineering | Operations | (none listed) |
| 19 | Product Strategy & Innovation | Product | Jiri Consulting |
| 20 | Product Management, UX & Design | Product | Odd Creative, WHIPSAW |
| 21 | Sales Strategy & Enablement | Sales | Vendux |
| 22 | Revenue Operations & Go-To-Market | Sales | KWJ Consulting, Aspect Marketing |
| 23 | Strategy & Management Consulting | Strategy | Levy Consulting Co., Twin Fish Group |
| 24 | Technology Strategy & Digital Transformation | Technology | (none listed) |
| 25 | Systems Integration & Enterprise Platforms | Technology | Axelerant |
| 26 | Software Engineering & Custom Development | Technology | Bits&Letters, SLIDEFACTORY |
| 27 | AI, Automation & Intelligent Systems | Technology | Phenologix, Yotomations, Fountain City |
| 28 | IT Infrastructure & Managed Services | Technology | Vaulted Oak, Spec Data |
| 29 | Cybersecurity & Information Security | Technology | RipRap Security, Hacker Simulations |
| 30 | Industry & Applied Engineering | - | (none listed) |

These categories are seeded as `Category` nodes in Neo4j and used by the AI classifier (`src/lib/enrichment/ai-classifier.ts`) to tag every firm.

---

## Symbiotic Firm Relationships (345 Pairings)

Defined in `firm-relationships.csv`. Describes how different firm types naturally partner, subcontract, or refer work to each other.

### Schema

| Column | Description |
|--------|-------------|
| Company Type A | First firm type (e.g., "Brand Strategy Agency") |
| Company Type B | Second firm type (e.g., "Creative Studio") |
| Nature of Relationship | How they collaborate (free text) |
| Client Use Case | Typical client scenario driving the pairing |
| Direction of Engagement | `A -> B`, `B -> A`, or `bidirectional` |
| Partnership Frequency | `High`, `Medium`, or `Low` |
| Revenue Model | How money flows: shared retainer, referral fee, mark-up, separate contracts, etc. |
| Risk or Complexity | Primary risk factor (e.g., "Creative misalignment") |
| Real World Example | Concrete scenario illustrating the pairing |
| Key Skills | (Mostly empty in current data) |
| Citations | (Mostly empty in current data) |

### Scale

- **345 total pairings** across **230 unique firm types**
- Firm types in this file are more granular than the 30 categories (e.g., "AI/ML Consulting Firm", "Podcast Production Company", "Fractional CMO Network")
- The 30 categories represent the top-level grouping; these 230 types are the operational subtypes

### Example Pairings

| Firm A | Firm B | Direction | Frequency | Revenue Model |
|--------|--------|-----------|-----------|---------------|
| Brand Strategy Agency | Creative Studio | A -> B | High | Shared retainer |
| Brand Strategy Agency | Market Research Firm | A -> B | High | Mark-up or pass-through |
| Brand Strategy Agency | PR Firm | bidirectional | Medium | Referral fee |
| SEO Agency | Content Marketing Agency | bidirectional | High | Separate or combined retainer |
| Media Agency | Programmatic Advertising Platform | bidirectional | High | Platform fees and agency mark-ups |

### How Relationships Are Used

1. **Neo4j Seeding** (`src/lib/neo4j-seed.ts`): Creates `PARTNERS_WITH` edges between `Category` nodes with properties: nature, direction, frequency, revenueModel.
2. **Matching Engine**: When a client needs a specific capability, the graph traverses `PARTNERS_WITH` edges to suggest complementary firms.
3. **Partnership Introductions**: Surfaces natural partnership opportunities between member firms based on relationship patterns.

---

## Persona Positioning (534 Entries)

Defined in `persona-positioning.csv`. A sales playbook that tells Ossy (and human salespeople) how to pitch based on the prospect's role and company size.

### Schema

| Column | Description |
|--------|-------------|
| profile_match | Composite key: `{firm_size_bracket} - {role_title}` |
| instructions | Multi-paragraph positioning instructions, pain points, messaging guidance |

### Firm Size Brackets (6)

| Bracket | Description |
|---------|-------------|
| 0-10 Employees | Startup / Small Business |
| 11-50 Employees | Growing Startup / Small Business |
| 51-200 Employees | Scaling Startup / Mid-Market |
| 201-500 Employees | Established Mid-Market |
| 501-1000 Employees | Large Mid-Market |
| 1001+ Employees | Enterprise |

### Role Titles (14+ unique roles across sizes)

Roles vary by firm size bracket. At larger sizes, titles become more specific (VP, SVP, EVP variants). Core roles:

- CEO / Founder / President / Co-Founder
- COO / VP of Operations
- CFO / VP of Finance
- CMO / VP of Marketing
- CRO / VP of Sales & Revenue
- CHRO / CPO / HR Lead
- Chief Product Officer / CPO / SVP of Product
- Chief Experience Officer / CXO / SVP of Customer Experience
- Head of Ecommerce / VP of Ecommerce
- Head of CX / Customer Experience
- Head of Product
- Head of Partnerships / Business Development / Corporate Development
- Director/VP/SVP of Strategic Partnerships & Corporate Development

### Matrix Coverage

~87 unique role-x-size combinations, each with detailed positioning instructions (typically 6-8 lines of guidance per entry). The instructions include:
- How to frame the pitch for that specific persona
- 4-5 key selling points tailored to their priorities
- A closing insight about what matters most to this persona

### How Positioning Is Used

Parsed by `src/lib/taxonomy.ts` (`getPersonaPositioning()`) for use by:
- **Ossy chat**: Adjusts conversation tone based on the user's role and firm size
- **Email generation**: Tailors outreach messaging
- **Coaching reports**: Provides call intelligence feedback based on persona fit

---

## Additional Static Data (Hardcoded in taxonomy.ts)

Not in CSV files, but defined in `src/lib/taxonomy.ts` and `src/lib/taxonomy/index.ts`:

### Markets (200+ entries)

Geographic targeting data. Seeded as `Market` nodes in Neo4j.

- **26 regions**: Global, North America, EMEA, APAC, DACH, Nordic, GCC, EU, etc.
- **196 countries**: Every UN-recognized sovereign state organized by continent.

### Languages (75+ entries)

Business languages for firm tagging. Seeded as `Language` nodes in Neo4j.

Includes: English, Spanish, French, German, Portuguese, Mandarin, Japanese, Korean, Arabic, Hindi, and 65+ more.

### Firm Types (10)

Delivery model taxonomy (hardcoded in `neo4j-seed.ts`):

1. Fractional & Interim
2. Staff Augmentation
3. Embedded Teams
4. Boutique Agency
5. Project Consulting
6. Managed Service Provider
7. Advisory
8. Global Consulting
9. Freelancer Network
10. Agency Collective

### Industries (57)

Seeded as initial `Industry` nodes. Grows dynamically as the enrichment pipeline discovers new verticals. Includes standard verticals (Technology, SaaS, Healthcare) and *-Tech categories (FinTech, HealthTech, MarTech, etc.).

---

## Import & Seeding Architecture

### Taxonomy Parsers

Two copies of the taxonomy parser exist (to be consolidated):

| File | Role |
|------|------|
| `src/lib/taxonomy.ts` | Original parser. Exports `getFirmCategories()`, `getSkillsL1L2()`, `getSkillsL2L3()`, `getSkillL1Names()`, `getSkillL2Names()`, `getMarkets()`, `getLanguages()`, `getPersonaPositioning()` |
| `src/lib/taxonomy/index.ts` | Newer version with same exports plus `getL1ForL2()` helper. Also contains full MARKETS and LANGUAGES arrays (more complete than taxonomy.ts) |

Both read from `data/` using `fs.readFileSync()` with CSV parsing that handles quoted fields.

### Neo4j Seed Script

**File:** `src/lib/neo4j-seed.ts`
**Endpoint:** `POST /api/admin/neo4j/seed` (protected by `ADMIN_SECRET` header)

Seeds in dependency order:
1. Categories (30 `Category` nodes)
2. Skills L1 (26 `SkillL1` nodes)
3. Skills L2 (246 `Skill` nodes with `BELONGS_TO` edges to L1)
4. Skills L3 (18,419 `Skill` nodes with `BELONGS_TO` edges to L2)
5. Firm Relationships (345 `PARTNERS_WITH` edges between `Category` nodes)
6. Markets (200+ `Market` nodes)
7. Languages (75+ `Language` nodes)
8. Firm Types (10 `FirmType` nodes)
9. Industries (57 `Industry` nodes)

Uses `MERGE` (upsert) so it is safe to run multiple times. Processes in batches of 500.

**Status:** Functional. The seed endpoint works and populates Neo4j.

### Public Taxonomy API

**Endpoint:** `GET /api/public/taxonomy`
**File:** `src/app/api/public/taxonomy/route.ts`

Returns categories, skills (L1->L2), and firm relationships as JSON. Supports `?section=categories|skills|relationships` for partial responses. Cached in-memory for 1 hour. No auth required (optional API key).

This endpoint is consumed by the CORE website's COS sync (`POST /api/website/cos-sync`).

### AI Classifier

**File:** `src/lib/enrichment/ai-classifier.ts`

Uses the taxonomy data to classify scraped firms against:
- 30 firm categories
- 246 L2 skills
- Markets and languages
- Industries

Powered by Gemini Flash via OpenRouter for cost efficiency.

### Matching Engine Usage

The matching engine (`src/lib/matching/`) consumes taxonomy data through Neo4j graph queries:

- **`structured-filter.ts`**: Layer 1 — Narrows candidates by traversing Neo4j skill/industry/market relationships
- **`query-parser.ts`**: Parses natural language queries against taxonomy terms
- **`deep-ranker.ts`**: Layer 3 — Uses taxonomy context for LLM-based re-ranking
- **`abstraction-generator.ts`**: Generates firm abstraction profiles using taxonomy vocabulary

---

## Legacy Data

**Location:** `data/legacy/Data Dump (JSON)/`

Contains 5 step-folders from the original n8n-based COS platform:
1. `Step 1_ System Data`
2. `Step 2_ Organization Basic Data`
3. `Step 3_ Organization Content Data`
4. `Step 4_ User Profile Data`
5. `Step 5_ Network Data`

Legacy import routes exist at:
- `src/app/api/admin/import/contacts/route.ts`
- `src/app/api/admin/import/companies/route.ts`
- `src/app/api/admin/import/case-studies/route.ts`
- `src/app/api/admin/import/outreach/route.ts`
- `src/app/api/admin/import/clients/route.ts`
- `src/app/api/admin/import/sync-graph/route.ts`
- `src/app/api/admin/import/stats/route.ts`

---

## Known Issues & Gaps

1. **Duplicate taxonomy parsers**: `src/lib/taxonomy.ts` and `src/lib/taxonomy/index.ts` have overlapping code. Should consolidate to one.
2. **Broken sheet exports**: `firm-relationships-sheet0.csv`, `firm-relationships-sheet1.csv`, `persona-positioning-sheet1.csv`, and `specializations-gid0.csv` are empty or contain Google Sheets HTML errors. Not used by code.
3. **Persona CSV parsing**: The persona-positioning.csv uses multi-line quoted fields, making simple CSV parsing unreliable. The parser in `taxonomy.ts` treats each newline-separated entry as having `profile_match` and `instructions` columns, but the actual file structure has instructions spanning multiple lines within quotes.
4. **L3 skills not exposed via public API**: The `/api/public/taxonomy` endpoint only returns L1->L2 mapping; L3 data is only available through Neo4j after seeding.
5. **Key Skills and Citations columns**: In `firm-relationships.csv`, these columns are mostly empty.
6. **Firm type mismatch**: The 230 granular firm types in `firm-relationships.csv` do not map 1:1 to the 30 categories in `categories.csv`. The seeding script creates `Category` nodes for relationship firm types, which means Neo4j has both the 30 canonical categories and the 230+ relationship-specific types as `Category` nodes.
