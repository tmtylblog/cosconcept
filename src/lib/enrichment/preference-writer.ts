/**
 * Preference Writer — syncs onboarding answers to Neo4j PREFERS edges.
 *
 * After the user answers the 5 onboarding questions, this module creates
 * graph edges that the matching engine can traverse:
 *
 * (ServiceFirm)-[:PREFERS {dimension, weight, source, updatedAt}]->(Skill|Category|Market)
 *
 * partnershipPhilosophy → ServiceFirm property (selects matching algorithm)
 * capabilityGaps        → PREFERS edges to Skill or Category nodes
 * preferredPartnerTypes → PREFERS edges to Category nodes
 * dealBreaker           → ServiceFirm property (free text, can't create edges yet)
 * geographyPreference   → ServiceFirm property + optional PREFERS edge to Market
 *
 * All writes use MERGE for idempotency. Stale edges are deleted before re-creation.
 */

import { neo4jWrite } from "../neo4j";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { partnerPreferences } from "@/lib/db/schema";
import { getSkillL2Names, getFirmCategories } from "@/lib/taxonomy";
import { readAllPreferences } from "@/lib/profile/update-profile-field";

// ─── Types ───────────────────────────────────────────────

export interface PreferenceWriteResult {
  firmId: string;
  prefersWritten: number;
  propertiesSet: string[];
  errors: string[];
}

// ─── Internal Helpers ────────────────────────────────────

/**
 * Delete all PREFERS edges for a given firm + dimension, then re-create
 * from current data. This handles answer changes safely.
 */
async function replacePreferEdges(
  firmId: string,
  dimension: string,
  targetLabel: string,
  targetNames: string[]
): Promise<number> {
  // Step 1: Delete stale PREFERS edges for this firm + dimension
  await neo4jWrite(
    `MATCH (f:ServiceFirm {id: $firmId})-[r:PREFERS]->()
     WHERE r.dimension = $dimension
     DELETE r`,
    { firmId, dimension }
  );

  if (targetNames.length === 0) return 0;

  // Step 2: Create fresh edges
  // Use dynamic label via separate queries per label type (Cypher doesn't allow variable labels)
  const cypher =
    targetLabel === "Skill"
      ? `MATCH (f:ServiceFirm {id: $firmId})
         UNWIND $names AS targetName
         MERGE (t:Skill {name: targetName})
         ON CREATE SET t.level = "L2"
         MERGE (f)-[r:PREFERS]->(t)
         SET r.dimension = $dimension,
             r.weight = $weight,
             r.source = "stated",
             r.updatedAt = datetime()`
      : targetLabel === "Category"
        ? `MATCH (f:ServiceFirm {id: $firmId})
           UNWIND $names AS targetName
           MERGE (t:Category {name: targetName})
           MERGE (f)-[r:PREFERS]->(t)
           SET r.dimension = $dimension,
               r.weight = $weight,
               r.source = "stated",
               r.updatedAt = datetime()`
        : `MATCH (f:ServiceFirm {id: $firmId})
           UNWIND $names AS targetName
           MERGE (t:Market {name: targetName})
           MERGE (f)-[r:PREFERS]->(t)
           SET r.dimension = $dimension,
               r.weight = $weight,
               r.source = "stated",
               r.updatedAt = datetime()`;

  const weightMap: Record<string, number> = {
    skill: 0.9,
    capability_gap_category: 0.9,
    firm_category: 0.8,
    market: 0.7,
  };

  await neo4jWrite(cypher, {
    firmId,
    names: targetNames,
    dimension,
    weight: weightMap[dimension] ?? 0.8,
  });

  return targetNames.length;
}

/**
 * Update preferencesSyncedAt timestamp in PostgreSQL.
 */
async function markSynced(firmId: string): Promise<void> {
  await db
    .update(partnerPreferences)
    .set({ preferencesSyncedAt: new Date() })
    .where(eq(partnerPreferences.firmId, firmId));
}

// ─── Per-Field Sync Functions ────────────────────────────

/**
 * Set partnershipPhilosophy as ServiceFirm node property.
 * Not an edge — controls which matching algorithm variant to use.
 */
export async function syncPartnershipPhilosophy(
  firmId: string,
  philosophy: string
): Promise<{ errors: string[] }> {
  const errors: string[] = [];
  try {
    await neo4jWrite(
      `MERGE (f:ServiceFirm {id: $firmId})
       SET f.partnershipPhilosophy = $philosophy,
           f.updatedAt = datetime()`,
      { firmId, philosophy }
    );
  } catch (err) {
    errors.push(`partnershipPhilosophy: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { errors };
}

/**
 * Write PREFERS edges for capabilityGaps.
 * Each gap is classified as either a Skill (L2) or Category name.
 */
export async function syncCapabilityGaps(
  firmId: string,
  gaps: string[]
): Promise<{ written: number; errors: string[] }> {
  const errors: string[] = [];
  if (!gaps.length) return { written: 0, errors };

  // Build lookup sets for classification
  const skillL2Set = new Map(
    getSkillL2Names().map((s) => [s.toLowerCase(), s])
  );
  const categorySet = new Map(
    getFirmCategories().map((c) => [c.name.toLowerCase(), c.name])
  );

  const skillGaps: string[] = [];
  const categoryGaps: string[] = [];

  for (const gap of gaps) {
    const lower = gap.toLowerCase();
    const canonicalCategory = categorySet.get(lower);
    const canonicalSkill = skillL2Set.get(lower);

    if (canonicalCategory) {
      categoryGaps.push(canonicalCategory);
    } else if (canonicalSkill) {
      skillGaps.push(canonicalSkill);
    } else {
      // Unrecognized — treat as skill (MERGE will create if needed)
      skillGaps.push(gap);
    }
  }

  let written = 0;

  if (skillGaps.length) {
    try {
      written += await replacePreferEdges(firmId, "skill", "Skill", skillGaps);
    } catch (err) {
      errors.push(`skill gaps: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    // No skill gaps — still delete stale edges
    try {
      await neo4jWrite(
        `MATCH (f:ServiceFirm {id: $firmId})-[r:PREFERS]->()
         WHERE r.dimension = "skill" DELETE r`,
        { firmId }
      );
    } catch (_) { /* ignore */ }
  }

  if (categoryGaps.length) {
    try {
      written += await replacePreferEdges(firmId, "capability_gap_category", "Category", categoryGaps);
    } catch (err) {
      errors.push(`category gaps: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    try {
      await neo4jWrite(
        `MATCH (f:ServiceFirm {id: $firmId})-[r:PREFERS]->()
         WHERE r.dimension = "capability_gap_category" DELETE r`,
        { firmId }
      );
    } catch (_) { /* ignore */ }
  }

  return { written, errors };
}

/**
 * Write PREFERS edges for preferredPartnerTypes.
 * These are exact Category names from the 30 COS categories.
 */
export async function syncPreferredPartnerTypes(
  firmId: string,
  types: string[]
): Promise<{ written: number; errors: string[] }> {
  const errors: string[] = [];
  try {
    const written = await replacePreferEdges(firmId, "firm_category", "Category", types);
    return { written, errors };
  } catch (err) {
    errors.push(`preferredPartnerTypes: ${err instanceof Error ? err.message : String(err)}`);
    return { written: 0, errors };
  }
}

/**
 * Store dealBreaker as ServiceFirm node property.
 * Free text — cannot reliably create AVOIDS edges yet.
 */
export async function syncDealBreaker(
  firmId: string,
  dealBreaker: string
): Promise<{ errors: string[] }> {
  const errors: string[] = [];
  try {
    await neo4jWrite(
      `MERGE (f:ServiceFirm {id: $firmId})
       SET f.dealBreaker = $dealBreaker,
           f.updatedAt = datetime()`,
      { firmId, dealBreaker }
    );
  } catch (err) {
    errors.push(`dealBreaker: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { errors };
}

/**
 * Write geographyPreference property + optional PREFERS edge to Market.
 * "Global" = no geographic restriction (no edge, just property).
 */
export async function syncGeographyPreference(
  firmId: string,
  geography: string
): Promise<{ written: number; errors: string[] }> {
  const errors: string[] = [];

  // Always set the property
  try {
    await neo4jWrite(
      `MERGE (f:ServiceFirm {id: $firmId})
       SET f.geographyPreference = $geography,
           f.updatedAt = datetime()`,
      { firmId, geography }
    );
  } catch (err) {
    errors.push(`property: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Delete existing market preference edges
  try {
    await neo4jWrite(
      `MATCH (f:ServiceFirm {id: $firmId})-[r:PREFERS]->()
       WHERE r.dimension = "market"
       DELETE r`,
      { firmId }
    );
  } catch (err) {
    errors.push(`delete: ${err instanceof Error ? err.message : String(err)}`);
  }

  // "Global" = no geographic restriction
  if (geography.toLowerCase() === "global") {
    return { written: 0, errors };
  }

  // Specific market: create PREFERS edge
  try {
    await neo4jWrite(
      `MATCH (f:ServiceFirm {id: $firmId})
       MERGE (m:Market {name: $market})
       MERGE (f)-[r:PREFERS]->(m)
       SET r.dimension = "market",
           r.weight = 0.7,
           r.source = "stated",
           r.updatedAt = datetime()`,
      { firmId, market: geography }
    );
    return { written: 1, errors };
  } catch (err) {
    errors.push(`create: ${err instanceof Error ? err.message : String(err)}`);
    return { written: 0, errors };
  }
}

// ─── Full Sync Orchestrator ──────────────────────────────

/**
 * Sync ALL preference fields from PG rawOnboardingData → Neo4j.
 * Idempotent: uses delete-then-recreate pattern.
 * Called at onboarding completion or admin re-sync.
 */
export async function syncAllPreferencesToGraph(
  firmId: string
): Promise<PreferenceWriteResult> {
  const result: PreferenceWriteResult = {
    firmId,
    prefersWritten: 0,
    propertiesSet: [],
    errors: [],
  };

  // Read current preferences from PG
  const prefs = await readAllPreferences(firmId);
  if (!prefs || Object.keys(prefs).length === 0) {
    result.errors.push("No preference data found");
    return result;
  }

  // 1. Partnership philosophy → property
  if (prefs.partnershipPhilosophy && typeof prefs.partnershipPhilosophy === "string") {
    const r = await syncPartnershipPhilosophy(firmId, prefs.partnershipPhilosophy);
    result.propertiesSet.push("partnershipPhilosophy");
    result.errors.push(...r.errors);
  }

  // 2. Capability gaps → PREFERS edges
  if (prefs.capabilityGaps && Array.isArray(prefs.capabilityGaps)) {
    const r = await syncCapabilityGaps(firmId, prefs.capabilityGaps);
    result.prefersWritten += r.written;
    result.errors.push(...r.errors);
  }

  // 3. Preferred partner types → PREFERS edges
  if (prefs.preferredPartnerTypes && Array.isArray(prefs.preferredPartnerTypes)) {
    const r = await syncPreferredPartnerTypes(firmId, prefs.preferredPartnerTypes);
    result.prefersWritten += r.written;
    result.errors.push(...r.errors);
  }

  // 4. Deal breaker → property
  if (prefs.dealBreaker && typeof prefs.dealBreaker === "string") {
    const r = await syncDealBreaker(firmId, prefs.dealBreaker);
    result.propertiesSet.push("dealBreaker");
    result.errors.push(...r.errors);
  }

  // 5. Geography preference → property + optional edge
  if (prefs.geographyPreference && typeof prefs.geographyPreference === "string") {
    const r = await syncGeographyPreference(firmId, prefs.geographyPreference);
    result.prefersWritten += r.written;
    result.propertiesSet.push("geographyPreference");
    result.errors.push(...r.errors);
  }

  // Mark sync timestamp in PG
  try {
    await markSynced(firmId);
  } catch (err) {
    result.errors.push(`markSynced: ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log(
    `[Preference Writer] Synced ${firmId}: ${result.prefersWritten} PREFERS edges, ` +
    `${result.propertiesSet.length} properties. ${result.errors.length} errors.`
  );

  return result;
}

// ─── Per-Field Dispatcher ────────────────────────────────

/**
 * Dispatch a single preference field to the appropriate Neo4j writer.
 * Called fire-and-forget after PG write succeeds.
 */
export async function syncPreferenceFieldToGraph(
  firmId: string,
  field: string,
  value: string | string[]
): Promise<void> {
  switch (field) {
    case "partnershipPhilosophy":
      await syncPartnershipPhilosophy(firmId, value as string);
      break;
    case "capabilityGaps":
      await syncCapabilityGaps(firmId, value as string[]);
      break;
    case "preferredPartnerTypes":
      await syncPreferredPartnerTypes(firmId, value as string[]);
      break;
    case "dealBreaker":
      await syncDealBreaker(firmId, value as string);
      break;
    case "geographyPreference":
      await syncGeographyPreference(firmId, value as string);
      break;
    default:
      // v1 legacy fields and non-graph fields: no-op
      break;
  }
}
