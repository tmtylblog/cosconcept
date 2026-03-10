import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { executeSearch } from "@/lib/matching/search";

/**
 * POST /api/admin/search/test
 *
 * Runs the full 3-layer cascading search in debug mode, returning intermediate
 * layer results for admin inspection.
 *
 * Body:
 *   { query, searcherFirmId?, skipLlmRanking? }
 */
export async function POST(req: NextRequest) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user || session.user.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { query?: string; searcherFirmId?: string; skipLlmRanking?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { query, searcherFirmId, skipLlmRanking } = body;
  if (!query || typeof query !== "string" || !query.trim()) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  try {
    const result = await executeSearch({
      rawQuery: query.trim(),
      searcherFirmId,
      skipLlmRanking: skipLlmRanking ?? false,
      debug: true,
    });

    return NextResponse.json({
      query: result.query.rawQuery,
      parsedFilters: result.debugLayers?.parsedFilters ?? result.query.filters,
      layer1: result.debugLayers?.layer1 ?? { count: result.stats.layer1Candidates, topCandidates: [] },
      layer2: result.debugLayers?.layer2 ?? { count: result.stats.layer2Candidates, topCandidates: [] },
      layer3: result.debugLayers?.layer3 ?? { count: result.stats.layer3Ranked, results: result.candidates },
      stats: result.stats,
    });
  } catch (err) {
    console.error("[Admin] Search test error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Search failed" },
      { status: 500 }
    );
  }
}
