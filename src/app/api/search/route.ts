/**
 * POST /api/search
 *
 * Cascading partner search endpoint.
 * Accepts natural language queries + optional explicit filters.
 *
 * Returns ranked match candidates with explanations.
 */

import { NextRequest, NextResponse } from "next/server";
import { executeSearch } from "@/lib/matching/search";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query, firmId, filters, skipLlmRanking } = body;

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "query is required (string)" },
        { status: 400 }
      );
    }

    const result = await executeSearch({
      rawQuery: query,
      searcherFirmId: firmId,
      explicitFilters: filters,
      skipLlmRanking,
    });

    return NextResponse.json({
      candidates: result.candidates,
      filters: result.query.filters,
      stats: result.stats,
    });
  } catch (err) {
    console.error("[Search API] Error:", err);
    return NextResponse.json(
      { error: "Search failed" },
      { status: 500 }
    );
  }
}
