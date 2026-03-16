/**
 * GET /api/taxonomy/industries/search?q=<term>
 *
 * Searches the canonical industry hierarchy (L1 + L2 industries).
 * Returns matching industries sorted: prefix matches first, then contains.
 */

import { NextRequest, NextResponse } from "next/server";
import { INDUSTRY_HIERARCHY } from "@/lib/taxonomy-full";

// Build flat list on first request
let allIndustries: string[] | null = null;

function ensureCache() {
  if (allIndustries) return;
  const set = new Set<string>();
  for (const [l1, l2s] of Object.entries(INDUSTRY_HIERARCHY)) {
    set.add(l1);
    for (const l2 of l2s) set.add(l2);
  }
  allIndustries = [...set].sort();
}

export async function GET(req: NextRequest) {
  const query = new URL(req.url).searchParams.get("q")?.trim();
  if (!query || query.length < 1) {
    return NextResponse.json({ results: [] });
  }

  ensureCache();

  const q = query.toLowerCase();
  const prefix: string[] = [];
  const contains: string[] = [];

  for (const ind of allIndustries!) {
    const lower = ind.toLowerCase();
    if (lower.startsWith(q)) prefix.push(ind);
    else if (lower.includes(q)) contains.push(ind);
  }

  return NextResponse.json({
    results: [...prefix, ...contains].slice(0, 15),
  });
}
