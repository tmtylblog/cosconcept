/**
 * GET /api/taxonomy/categories/search?q=<term>
 *
 * Searches the 30 firm categories.
 * Returns matching categories sorted: prefix matches first, then contains.
 */

import { NextRequest, NextResponse } from "next/server";
import { getFirmCategories } from "@/lib/taxonomy";

let categoryNames: string[] | null = null;

function ensureCache() {
  if (categoryNames) return;
  categoryNames = getFirmCategories().map((c) => c.name).sort();
}

export async function GET(req: NextRequest) {
  const query = new URL(req.url).searchParams.get("q")?.trim();
  if (!query || query.length < 1) {
    return NextResponse.json({ results: [] });
  }

  ensureCache();

  const q = query.toLowerCase();
  const prefix: { name: string }[] = [];
  const contains: { name: string }[] = [];

  for (const name of categoryNames!) {
    const lower = name.toLowerCase();
    if (lower.startsWith(q)) prefix.push({ name });
    else if (lower.includes(q)) contains.push({ name });
  }

  return NextResponse.json({
    results: [...prefix, ...contains].slice(0, 15),
  });
}
