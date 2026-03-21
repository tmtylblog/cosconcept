/**
 * GET /api/admin/search-debug?q=marketing+agencies&firmId=firm_xxx
 *
 * Diagnostic endpoint that shows exactly what each search layer returns.
 * Helps debug why experts/case studies don't appear in results.
 * Auth: superadmin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { parseSearchQuery } from "@/lib/matching/query-parser";
import { bidirectionalStructuredFilter, toMatchCandidates, expertFilter, caseStudyFilter } from "@/lib/matching/structured-filter";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  // Auth: superadmin only
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user || session.user.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const query = req.nextUrl.searchParams.get("q") ?? "marketing agencies";
  const firmId = req.nextUrl.searchParams.get("firmId") ?? undefined;

  const results: Record<string, unknown> = { query, firmId };

  // Step 1: Parse query
  try {
    const filters = await parseSearchQuery(query);
    results.parsedFilters = {
      skills: filters.skills,
      categories: filters.categories,
      industries: filters.industries,
      markets: filters.markets,
      services: filters.services,
      entityType: filters.entityType,
      searchIntent: filters.searchIntent,
      sizeBand: filters.sizeBand,
    };
  } catch (err) {
    results.parseError = String(err);
    return NextResponse.json(results);
  }

  const filters = results.parsedFilters as Record<string, unknown>;

  // Step 2: Run expertFilter directly
  try {
    const intent = (filters.searchIntent as "partner" | "expertise" | "evidence") ?? "partner";
    const expertResults = await expertFilter(
      filters as Parameters<typeof expertFilter>[0],
      50,
      intent
    );
    results.expertFilter = {
      count: expertResults.length,
      topResults: expertResults.slice(0, 3).map((r) => ({
        entityType: r.entityType,
        entityId: r.entityId,
        displayName: r.displayName,
        firmName: r.firmName,
        structuredScore: r.structuredScore,
        topSkills: r.preview?.topSkills?.slice(0, 3),
      })),
    };
  } catch (err) {
    results.expertFilterError = String(err);
  }

  // Step 3: Run caseStudyFilter directly
  try {
    const intent = (filters.searchIntent as "partner" | "expertise" | "evidence") ?? "partner";
    const csResults = await caseStudyFilter(
      filters as Parameters<typeof caseStudyFilter>[0],
      50,
      intent
    );
    results.caseStudyFilter = {
      count: csResults.length,
      topResults: csResults.slice(0, 3).map((r) => ({
        entityType: r.entityType,
        entityId: r.entityId,
        displayName: r.displayName,
        firmName: r.firmName,
        structuredScore: r.structuredScore,
        summary: r.preview?.summary?.substring(0, 100),
      })),
    };
  } catch (err) {
    results.caseStudyFilterError = String(err);
  }

  // Step 4: Run bidirectionalStructuredFilter (firms) if firmId provided
  if (firmId) {
    try {
      const biResults = await bidirectionalStructuredFilter(
        filters as Parameters<typeof bidirectionalStructuredFilter>[0],
        firmId,
        50
      );
      const firmResults = toMatchCandidates(biResults);
      results.firmFilter = {
        count: firmResults.length,
        topResults: firmResults.slice(0, 3).map((r) => ({
          entityType: r.entityType,
          entityId: r.entityId,
          displayName: r.displayName,
          structuredScore: r.structuredScore,
        })),
      };
    } catch (err) {
      results.firmFilterError = String(err);
    }
  }

  return NextResponse.json(results, { status: 200 });
}
