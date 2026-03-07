# COS CONCEPT — Knowledge Graph Design

## Overview
The knowledge graph is the backbone of COS CONCEPT. It maps the entire professional services landscape — firms, experts, clients, projects, skills, industries, and markets — and the relationships between them. It powers matching, search, recommendations, and trust path analysis.

**Database:** Neo4j Aura

---

## Node Types

### 1. ServiceFirm
Represents an agency, consultancy, or professional services firm.

**Properties:**
- `firm_id` (unique)
- `name`
- `website`
- `description`
- `founded_year`
- `size_band` (enum: Individual Experts, Micro 1-10, Small 11-50, Emerging 51-200, Mid Sized 201-500, Upper Middle Market 501-1000, Large Enterprise 1001-5000, Major Enterprise 5001-10000, Global Corporation 10000+)
- `firm_type` (enum: Fractional/Interim, Staff Augmentation, Embedded Teams, Boutique Agency, Project Based Consulting, Managed Service Provider, Advisory, Global Consulting, Freelancer Network, Agency Collective)
- `headquarters_market` → Market node
- `partnership_readiness_score` (computed)
- `response_velocity` (avg time to respond to partnership requests)
- `is_platform_member` (boolean — global vs claimed)
- `profile_completeness` (percentage)
- `claimed_by_user_id` (null if unclaimed)

### 2. Expert
Represents an individual professional (employee, freelancer, fractional leader).

**Properties:**
- `expert_id` (unique)
- `name`
- `title`
- `bio` (AI-generated or manual)
- `years_experience`
- `response_velocity`
- `expert_type` (enum: employee, freelancer, fractional_leader, contractor)
- `availability_status` (available, partially_available, unavailable)
- `languages` (array with proficiency levels: native, fluent, professional, conversational, basic)

### 3. Client
Lightweight node representing a company that has been served by firms/experts.

**Properties:**
- `client_id` (unique)
- `name`
- `domain` (website domain — used for deduplication)
- `industry` → Industry node
- `size_band` (same enum as ServiceFirm)
- `estimated_revenue_range`
- `logo_url`
- `is_verified` (boolean)

**Key principle:** Platform-owned data. Firms can suggest edits but don't own client nodes. Used as a connecting node between firms ("Oh, you both worked with Nike? You might have complementary services.").

### 4. Project
Represents actual commercial work delivered. "Commercial truth" — the most honest data in the system.

**Properties:**
- `project_id` (unique)
- `title`
- `description`
- `contract_value_range` (enum: $1K-$10K, $10K-$50K, $50K-$100K, $100K-$500K, $500K-$1M, $1M+)
- `start_date`
- `end_date`
- `verified_payment` (boolean)
- `status` (completed, in_progress, cancelled)

### 5. CaseStudy
Published success stories attached to firms/projects.

**Properties:**
- `case_study_id` (unique)
- `title`
- `challenge_description`
- `solution_description`
- `outcome_description`
- `challenge_embedding` (vector)
- `solution_embedding` (vector)
- `outcome_metrics` (structured: revenue impact, time saved, etc.)
- `published` (boolean)
- `visibility` (public, partners_only, private)

### 6. Skill (3-Level Hierarchy)
The skills taxonomy — 18,421 skills organized in 3 levels.

**Structure:**
- L1: 30 top-level categories (e.g., "Information Technology", "Finance", "Marketing and Public Relations")
- L2: 247 sub-categories (e.g., "Cloud Computing", "Financial Analysis", "Digital Marketing")
- L3: 18,421 specific skills (e.g., "Amazon Web Services (AWS)", "DCF Modeling", "Google Ads")

**Relationships:**
- L1 -[HAS_SUBCATEGORY]→ L2
- L2 -[HAS_SKILL]→ L3

**Data source:** `data/skills-L1.csv`, `data/skills-L2-map.csv`, `data/skills-L3-map.csv`

### 7. Industry
Sector/vertical taxonomy.

**Properties:**
- `industry_id` (unique)
- `name`
- `synonyms` (array — e.g., "Healthcare" = "Health", "Medical")
- `parent_industry` (for hierarchical industries)

### 8. Market
Geographic taxonomy.

**Properties:**
- `market_id` (unique)
- `name`
- `type` (country, region, city, economic_zone)
- `synonyms` (array — e.g., "APAC" = "Asia Pacific")
- `parent_market` (for hierarchical: city → country → region)

---

## Edge Types

### Commercial Edges (work relationships)
| Edge | From → To | Meaning |
|------|-----------|---------|
| `DELIVERED_PROJECT` | ServiceFirm → Project | Firm executed this project |
| `BENEFITED_FROM` | Client → Project | Client received this project |
| `HAS_CASE_STUDY` | ServiceFirm → CaseStudy | Firm published this case study |
| `IS_EXPERT_ON` | Expert → CaseStudy | Expert contributed to this work |
| `WORKED_ON` | Expert → Project | Expert participated in this project |

### Trust/History Edges
| Edge | From → To | Meaning |
|------|-----------|---------|
| `EMPLOYED_BY` | Expert → ServiceFirm | Employment/engagement relationship |
| `POSSESSES_SKILL` | Expert → Skill | Expert has this skill (with proficiency level) |
| `OFFERS_SERVICE` | ServiceFirm → Skill | Firm offers services in this area |
| `HAS_EXPERTISE_IN` | ServiceFirm → Industry | Firm works in this industry |
| `OPERATES_IN` | ServiceFirm → Market | Firm has presence in this market |

### Social/Network Edges
| Edge | From → To | Meaning |
|------|-----------|---------|
| `COMMUNICATES_WITH` | Expert → Expert | Direct communication (from LinkedIn/email) |
| `CONNECTED_TO` | Expert → Expert | LinkedIn connection (weaker than communicates) |
| `TRUSTS` | ServiceFirm → ServiceFirm | Trusted partner relationship (platform-verified) |
| `ENDORSES` | Expert → Expert | Professional endorsement |
| `MEMBER_OF` | ServiceFirm → Collective | Part of a collective |

### Preference/Routing Edges
| Edge | From → To | Meaning |
|------|-----------|---------|
| `SEEKS_PARTNER_TYPE` | ServiceFirm → FirmType | Wants to partner with this type |
| `PREFERS_INDUSTRY` | ServiceFirm → Industry | Prefers partners in this industry |
| `PREFERS_MARKET` | ServiceFirm → Market | Prefers partners in this geography |
| `AVOIDS` | ServiceFirm → ServiceFirm | Does not want to partner with |
| `BLOCKS` | ServiceFirm → ServiceFirm | Hard block (never show) |

---

## Computed Super-Edges (Query Time)

These aren't stored — they're computed by traversing the graph at query time.

### Trust Path
How connected is the current user to a potential partner?
```
user → COMMUNICATES_WITH → person → EMPLOYED_BY → firm
```
**Depth 1:** Direct communication with someone at the firm
**Depth 2:** Communicate with someone who communicates with someone at the firm
**Max traversal:** 3 hops

### Capability Path
What can a firm actually do, based on evidence?
```
firm → DELIVERED_PROJECT → project → BENEFITED_FROM ← client(industry)
firm → HAS_CASE_STUDY → case_study → skills extracted
firm → EMPLOYED_BY ← expert → POSSESSES_SKILL → skill
```
This provides ground-truth capabilities vs. self-reported services.

### Symbiotic Relationship Path
Which firms naturally work together?
```
firm_type_A → [firm-relationships.csv lookup] → firm_type_B
```
Weighted by: partnership frequency, revenue model compatibility, direction of engagement.
Data source: `data/firm-relationships.csv` (346 relationship definitions)

---

## Social Graph Ingestion

### LinkedIn CSV Upload
- User uploads their LinkedIn connections CSV
- System extracts: name, title, company, email
- Creates/matches Expert nodes
- Creates CONNECTED_TO edges
- Differentiates connection strength (connected vs. communicated)

### Email Domain Analysis
- Analyze email metadata patterns
- Email exchanges = COMMUNICATES_WITH edges (stronger than CONNECTED_TO)
- Frequency → edge weight (higher = stronger relationship)

---

## Key Principles

1. **Platform-owned clients:** Client nodes belong to the platform, not individual firms. Prevents duplicate entries and enables cross-referencing.
2. **Ground truth weighting:** Edges from actual work (DELIVERED_PROJECT, HAS_CASE_STUDY) carry more weight than self-reported edges (OFFERS_SERVICE).
3. **Bidirectional matching:** Both firms' preferences must align. Firm A wanting to partner with Firm B is only half the equation.
4. **Progressive enrichment:** Graph starts sparse, enriches over time through scraping, user input, and inference.
5. **Privacy-aware:** Social graph edges derived from user uploads are private to that user. They inform matching but aren't visible to others.
