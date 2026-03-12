# Neo4j Edge Creation Project

> Created: 2026-03-12
> Status: In Progress
> Context: Post-Track-A migration cleanup. Node labels are clean. This doc covers all missing edges.

---

## Current Edge Audit (as of 2026-03-12)

| Edge | Count | Status |
|------|-------|--------|
| `WORKS_AT` (Contact→Company) | 3,902 | ✓ Done |
| `IN_CATEGORY` (Firm→FirmCategory) | 119 | ✓ Done |
| `HAS_SKILL` | 40,954 | ✓ Done |
| `SERVES_INDUSTRY` | 20,486 | ✓ Done |
| `OPERATES_IN` | 4,425 | ✓ Done |
| `PARTNERS_WITH` | 668 | ✓ Done |
| `BELONGS_TO` (skill hierarchy) | 19,364 | ✓ Done |
| `DEMONSTRATES_SKILL` | 10,481 | ✓ Done |
| `HAS_CLIENT` | 64 | ✓ Done |
| `HAS_WORK_HISTORY` | 10,962 | ✓ Done |
| `WORKED_AT` | 10,088 | ✓ Done |
| `HAS_CASE_STUDY` | 1,378 | ✓ Done |
| `CURRENTLY_AT` | 786 | ✓ Done |
| `OFFERS_SERVICE` | 4,736 | ✓ Done |
| **`FOR_CLIENT`** | **0** | ❌ Missing (blocked) |
| `AUTHORED_BY` (CaseStudy→Person) | 1,251 | ✓ Keep — already correct |

---

## Task 1: `HAS_CASE_STUDY` — Company:ServiceFirm → CaseStudy

**Priority: High. Easiest win. No enrichment needed.**

### Rules
- **Only `ServiceFirm` nodes get this edge.** `ServiceFirm` is the label that identifies a company in a service-provider role. Plain `Company` nodes (client stubs, imported contacts' companies, etc.) do not author case studies.
- Direction: `(f:ServiceFirm)-[:HAS_CASE_STUDY]->(cs:CaseStudy)`

### What we know
- 2,345 `CaseStudy` nodes exist from the legacy migration
- Each has an `orgName` property (e.g., `"Chameleon Collective"`)
- Each has `legacyId`, `about`, `links`, `status`
- **Neither `firmId` nor a direct ServiceFirm pointer exists** on these nodes
- `ServiceFirm` nodes have a `name` property
- Match path: `ServiceFirm.name == CaseStudy.orgName` — the `ServiceFirm` label constraint naturally restricts to service providers only

### What to build
**Script:** `scripts/create-case-study-edges.ts`

**Steps:**
1. `MATCH (cs:CaseStudy) WHERE cs.orgName IS NOT NULL` — find all case studies with an org name
2. `MATCH (f:Company:ServiceFirm {name: cs.orgName})` — match only against ServiceFirm nodes (service providers)
3. `MERGE (f)-[:HAS_CASE_STUDY]->(cs)` — create the edge
4. Also set `cs.firmId = f.id` on match for forward compatibility
5. Log: how many matched, how many case studies had no matching ServiceFirm (misses = either the org isn't a platform member, or name doesn't match exactly)

**Expected result:** Subset of 2,345 edges (name match rate will be <100% since not all `orgName` values correspond to a registered ServiceFirm — log the misses for manual review)

---

## Task 2: `CURRENTLY_AT` — Person[expert] → Company:ServiceFirm

**Priority: High. Required for person→firm traversal and matching.**

### What we know
- 3,432 `Person[expert+platform_user]` nodes from legacy migration (`source=null`, have `legacyId`)
- These were legacy COS users. Their org membership was stored as `BELONGS_TO` → `Organization`, which no longer exists
- **WorkHistory path exists:** `Person -[HAS_WORK_HISTORY]-> WorkHistory -[WORKED_AT]-> Company:ServiceFirm`
  - 1,375 WorkHistory nodes already link to a `Company:ServiceFirm`
  - Only **28** of those are flagged `isCurrentPosition=true`
  - This is the primary path to create `CURRENTLY_AT` from

### What to build
**Script:** `scripts/create-currently-at-edges.ts`

**Step 1 — Current position path (high confidence)**
```cypher
MATCH (p:Person)-[:HAS_WORK_HISTORY]->(wh:WorkHistory {isCurrentPosition: true})-[:WORKED_AT]->(f:Company:ServiceFirm)
MERGE (p)-[r:CURRENTLY_AT]->(f)
SET r.source = "work_history",
    r.isPrimary = true,
    r.engagementType = "full_time",
    r.createdAt = datetime()
```
Expected: ~28 edges

**Step 2 — Most recent WorkHistory path (medium confidence)**
For persons with no current-position flag, use their most recent WorkHistory → ServiceFirm:
```cypher
MATCH (p:Person)-[:HAS_WORK_HISTORY]->(wh:WorkHistory)-[:WORKED_AT]->(f:Company:ServiceFirm)
WHERE NOT EXISTS { (p)-[:CURRENTLY_AT]->() }
  AND wh.endAt IS NULL
WITH p, f, wh ORDER BY wh.startAt DESC
WITH p, collect(f)[0] AS topFirm
MERGE (p)-[r:CURRENTLY_AT]->(topFirm)
SET r.source = "work_history_inferred",
    r.isPrimary = true,
    r.engagementType = "full_time",
    r.confidence = 0.7,
    r.createdAt = datetime()
```
Expected: some additional coverage from the 1,375 WH→ServiceFirm paths

**Step 3 — Log remaining gaps**
Count `Person[expert]` nodes with no `CURRENTLY_AT` edge after steps 1+2. These are persons whose WorkHistory doesn't link to a ServiceFirm node (i.e., their legacy org was never enriched as a ServiceFirm). Document the count — these can only be fixed if we enrich more firms.

---

## Task 3: `AUTHORED_BY` — CaseStudy → Person (Keep As-Is)

**No action needed. This edge is correct and should be preserved.**

### What we confirmed
- 1,251 `AUTHORED_BY` edges exist, direction: `CaseStudy -[AUTHORED_BY]-> Person`
- The `User` label was stripped during Track A migration — these edges now point to `Person` nodes, which is the correct target label
- The migration already handled this correctly: the same graph nodes that were `User` are now `Person`, so the edges are still valid and pointing at the right nodes
- `AUTHORED_BY` and `HAS_CASE_STUDY` serve different purposes and coexist:
  - `(Company:ServiceFirm)-[:HAS_CASE_STUDY]->(CaseStudy)` — firm ownership of the case study
  - `(CaseStudy)-[:AUTHORED_BY]->(Person)` — individual person who authored it

### No script needed. No changes required.

---

## Task 4: `OFFERS_SERVICE` and `FOR_CLIENT` — Blocked on Enrichment

**Priority: Low (blocked). These edges are created by the enrichment pipeline (`graph-writer.ts`), not by migration scripts.**

### What we know
- `OFFERS_SERVICE` (ServiceFirm → Service): created when Jina scraper extracts service names from firm websites
- `FOR_CLIENT` (CaseStudy → Company): created when a case study is fully ingested with a named client
- Neither can be backfilled from legacy data — the legacy `CaseStudy` nodes have raw HTML in `about`, not structured client/service fields
- The enrichment pipeline (`graph-sync.ts` Inngest function) creates these edges post-enrichment

### What to do
1. Ensure the Inngest `graph/sync-firm` event fires after every firm enrichment completes
2. Consider a one-time backfill: trigger enrichment for all `ServiceFirm` nodes that don't yet have `OFFERS_SERVICE` edges
3. For legacy CaseStudy nodes specifically: could write an AI extraction job to parse the `about` HTML and extract client names — but this is a separate project

---

## Execution Order

| # | Task | Script | Effort | Impact |
|---|------|--------|--------|--------|
| 1 | Create `HAS_CASE_STUDY` (ServiceFirm→CaseStudy) | `create-case-study-edges.ts` | Low | High — links case studies to service provider firms |
| 2 | Create `CURRENTLY_AT` (Person→ServiceFirm) | `create-currently-at-edges.ts` | Medium | High — wires experts to firms for matching |
| 3 | `OFFERS_SERVICE` / `FOR_CLIENT` | Enrichment pipeline | High | High — requires running enrichment at scale |
| — | `AUTHORED_BY` (CaseStudy→Person) | No action | — | Already correct, 1,251 edges intact |

---

## Files to Create

```
scripts/
├── create-case-study-edges.ts     # Task 1 — Company:ServiceFirm → CaseStudy via orgName match
└── create-currently-at-edges.ts   # Task 2 — Person[expert] → Company:ServiceFirm via WorkHistory
```

All scripts should:
- Accept `--dry-run` flag
- Log before/after counts
- Use MERGE (not CREATE) to be idempotent
