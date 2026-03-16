/**
 * GET /api/taxonomy/skills/search?q=<term>
 *
 * Smart skill search: searches both L2 skill names and L3 tool/skill names.
 * When an L3 match is found (e.g. "Tableau"), returns its L2 parent
 * (e.g. "Business Intelligence") with context about what matched.
 *
 * Returns: { results: Array<{ name: string, matchedVia?: string }> }
 */

import { NextRequest, NextResponse } from "next/server";
import { getSkillsL1L2, getSkillsL2L3 } from "@/lib/taxonomy";

// In-memory caches built on first request
let l2Names: string[] | null = null;
let l3ToL2Map: Map<string, string> | null = null;
let l3Names: string[] | null = null;

function ensureCaches() {
  if (l2Names && l3ToL2Map && l3Names) return;

  const l1l2 = getSkillsL1L2();
  l2Names = [...new Set(l1l2.map((s) => s.l2))];

  const l2l3 = getSkillsL2L3();
  l3ToL2Map = new Map();
  const l3Set: string[] = [];
  for (const entry of l2l3) {
    // Strip common suffixes like " (Software)" for better matching
    const cleanL3 = entry.l3.replace(/\s*\(.*?\)\s*$/, "").trim();
    l3ToL2Map.set(cleanL3.toLowerCase(), entry.l2);
    l3ToL2Map.set(entry.l3.toLowerCase(), entry.l2);
    l3Set.push(cleanL3);
    if (cleanL3 !== entry.l3) l3Set.push(entry.l3);
  }
  l3Names = l3Set;
}

export async function GET(req: NextRequest) {
  const query = new URL(req.url).searchParams.get("q")?.trim();
  if (!query || query.length < 1) {
    return NextResponse.json({ results: [] });
  }

  ensureCaches();

  const q = query.toLowerCase();
  const results: { name: string; matchedVia?: string }[] = [];
  const seen = new Set<string>();

  // 1. Direct L2 matches (prefix first, then contains)
  for (const l2 of l2Names!) {
    if (l2.toLowerCase().startsWith(q)) {
      if (!seen.has(l2)) { results.push({ name: l2 }); seen.add(l2); }
    }
  }
  for (const l2 of l2Names!) {
    if (!l2.toLowerCase().startsWith(q) && l2.toLowerCase().includes(q)) {
      if (!seen.has(l2)) { results.push({ name: l2 }); seen.add(l2); }
    }
  }

  // 2. L3 → L2 matches (find L3 skills matching query, suggest their L2 parent)
  if (l3Names && l3ToL2Map) {
    // Only search L3 if we haven't already found many L2 matches
    const l3Matches: { l3: string; l2: string }[] = [];

    for (const l3 of l3Names) {
      const l3Lower = l3.toLowerCase();
      if (l3Lower.startsWith(q) || (q.length >= 3 && l3Lower.includes(q))) {
        const parent = l3ToL2Map.get(l3Lower);
        if (parent && !seen.has(parent)) {
          l3Matches.push({ l3, l2: parent });
        }
      }
      if (l3Matches.length >= 20) break; // Cap scanning
    }

    // Deduplicate by L2 parent, keep first L3 as context
    const l2FromL3 = new Map<string, string>();
    for (const m of l3Matches) {
      if (!l2FromL3.has(m.l2)) l2FromL3.set(m.l2, m.l3);
    }

    for (const [l2, via] of l2FromL3) {
      if (!seen.has(l2)) {
        results.push({ name: l2, matchedVia: via });
        seen.add(l2);
      }
    }
  }

  return NextResponse.json({
    results: results.slice(0, 15),
  });
}
