/**
 * Skill Taxonomy Matcher — maps PDL self-reported skills to our L3 taxonomy.
 *
 * Our taxonomy has ~18,400 L3 skills grouped into ~247 L2 categories.
 * PDL returns self-reported skills as free-text strings (e.g. "Marketing Strategy").
 * This module matches those strings against our L3 taxonomy to create
 * structured HAS_SKILL edges in the knowledge graph.
 *
 * Matching strategy:
 * 1. Exact case-insensitive match against L3 skill names
 * 2. Normalized match (strip parentheticals, extra whitespace)
 * 3. Contains match — if an L3 skill name is fully contained in the PDL skill
 *    or vice versa (only for multi-word skills to avoid false positives)
 *
 * Cached in-memory after first load — the CSV is ~400KB.
 */

import { readFileSync } from "fs";
import { join } from "path";

export interface SkillMatch {
  pdlSkill: string;
  l3Name: string;
  l2Category: string;
  confidence: number; // 1.0 = exact, 0.95 = normalized, 0.85 = contains
}

interface TaxonomyEntry {
  l3Name: string;
  l2Category: string;
  /** Lowercase version for matching */
  l3Lower: string;
  /** Normalized: lowercase, no parentheticals, trimmed */
  l3Normalized: string;
}

// In-memory cache
let taxonomyCache: TaxonomyEntry[] | null = null;
let exactMap: Map<string, TaxonomyEntry> | null = null;
let normalizedMap: Map<string, TaxonomyEntry> | null = null;

/**
 * Normalize a skill name for fuzzy matching.
 * Strips parentheticals like "(Software)", trims whitespace, lowercases.
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s*\(.*?\)\s*/g, " ") // Remove parenthetical content
    .replace(/[^\w\s-]/g, " ")       // Replace special chars with space
    .replace(/\s+/g, " ")            // Collapse whitespace
    .trim();
}

/**
 * Load the L3 skill taxonomy from CSV into memory.
 * Cached after first call.
 */
function loadTaxonomy(): TaxonomyEntry[] {
  if (taxonomyCache) return taxonomyCache;

  const csvPath = join(process.cwd(), "data", "skills-L3-map.csv");
  const raw = readFileSync(csvPath, "utf-8");
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);

  // Skip header row
  const entries: TaxonomyEntry[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // CSV format: L2,L3 (some L3 names may contain commas in theory, but our data doesn't)
    const commaIdx = line.indexOf(",");
    if (commaIdx === -1) continue;

    const l2 = line.slice(0, commaIdx).trim();
    const l3 = line.slice(commaIdx + 1).trim();
    if (!l2 || !l3) continue;

    entries.push({
      l3Name: l3,
      l2Category: l2,
      l3Lower: l3.toLowerCase(),
      l3Normalized: normalize(l3),
    });
  }

  taxonomyCache = entries;

  // Build lookup maps
  exactMap = new Map();
  normalizedMap = new Map();
  for (const entry of entries) {
    // For exact map, first match wins (some L3 names appear under multiple L2s)
    if (!exactMap.has(entry.l3Lower)) {
      exactMap.set(entry.l3Lower, entry);
    }
    if (entry.l3Normalized && !normalizedMap.has(entry.l3Normalized)) {
      normalizedMap.set(entry.l3Normalized, entry);
    }
  }

  console.log(
    `[SkillMatcher] Loaded ${entries.length} L3 skills, ${exactMap.size} unique exact, ${normalizedMap.size} unique normalized`
  );

  return entries;
}

/**
 * Match an array of PDL self-reported skills against our L3 taxonomy.
 *
 * @param pdlSkills - Array of skill strings from PDL (e.g. ["Marketing Strategy", "Python"])
 * @returns Array of matches with confidence scores. Only returns matches above 0.85 threshold.
 */
export function matchSkillsToTaxonomy(pdlSkills: string[]): SkillMatch[] {
  if (!pdlSkills.length) return [];

  const taxonomy = loadTaxonomy();
  if (!exactMap || !normalizedMap) return [];

  const matches: SkillMatch[] = [];
  const seen = new Set<string>(); // Avoid duplicate L3 matches

  for (const pdlSkill of pdlSkills) {
    if (!pdlSkill || pdlSkill.trim().length === 0) continue;

    const pdlLower = pdlSkill.toLowerCase().trim();
    const pdlNormalized = normalize(pdlSkill);

    // 1. Exact match (confidence 1.0)
    const exactHit = exactMap.get(pdlLower);
    if (exactHit && !seen.has(exactHit.l3Lower)) {
      seen.add(exactHit.l3Lower);
      matches.push({
        pdlSkill,
        l3Name: exactHit.l3Name,
        l2Category: exactHit.l2Category,
        confidence: 1.0,
      });
      continue;
    }

    // 2. Normalized match (confidence 0.95)
    if (pdlNormalized !== pdlLower) {
      const normHit = normalizedMap.get(pdlNormalized);
      if (normHit && !seen.has(normHit.l3Lower)) {
        seen.add(normHit.l3Lower);
        matches.push({
          pdlSkill,
          l3Name: normHit.l3Name,
          l2Category: normHit.l2Category,
          confidence: 0.95,
        });
        continue;
      }
    }

    // 3. Contains match — only for multi-word skills (avoid false "AI" matching "Paid Advertising")
    if (pdlLower.split(/\s+/).length >= 2) {
      let bestContains: TaxonomyEntry | null = null;
      let bestLen = 0;

      for (const entry of taxonomy) {
        // PDL skill contains the L3 name, or L3 name contains the PDL skill
        // Prefer longer matches (more specific)
        if (
          entry.l3Lower.length >= 3 &&
          (pdlLower.includes(entry.l3Lower) || entry.l3Lower.includes(pdlLower))
        ) {
          const matchLen = Math.min(pdlLower.length, entry.l3Lower.length);
          if (matchLen > bestLen && !seen.has(entry.l3Lower)) {
            bestContains = entry;
            bestLen = matchLen;
          }
        }
      }

      if (bestContains) {
        seen.add(bestContains.l3Lower);
        matches.push({
          pdlSkill,
          l3Name: bestContains.l3Name,
          l2Category: bestContains.l2Category,
          confidence: 0.85,
        });
      }
    }
  }

  return matches;
}

/**
 * Get a summary of matched vs unmatched skills for logging.
 */
export function matchSummary(
  pdlSkills: string[],
  matches: SkillMatch[]
): { matched: number; unmatched: number; matchRate: string; unmatchedSkills: string[] } {
  const matchedPdlSkills = new Set(matches.map((m) => m.pdlSkill));
  const unmatched = pdlSkills.filter((s) => !matchedPdlSkills.has(s));

  return {
    matched: matches.length,
    unmatched: unmatched.length,
    matchRate: `${Math.round((matches.length / Math.max(pdlSkills.length, 1)) * 100)}%`,
    unmatchedSkills: unmatched,
  };
}
