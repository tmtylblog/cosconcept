/**
 * POST /api/search
 *
 * Cascading partner search endpoint.
 * Accepts natural language queries + optional explicit filters.
 * Gated by auth + metered search limits (10/month free, unlimited Pro).
 *
 * Returns ranked match candidates with explanations.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { members, serviceFirms } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { executeSearch } from "@/lib/matching/search";
import { requireUsage, FeatureGateError } from "@/lib/billing/gate";
import { logAIUsage } from "@/lib/ai/gateway";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // 1. Require authentication
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { query, firmId, filters, skipLlmRanking } = body;

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "query is required (string)" },
        { status: 400 }
      );
    }

    // 2. Resolve organization
    let organizationId: string | null = null;
    let searcherFirmId: string | undefined = firmId;

    try {
      const [membership] = await db
        .select({ orgId: members.organizationId })
        .from(members)
        .where(eq(members.userId, session.user.id))
        .limit(1);
      if (membership) {
        organizationId = membership.orgId;
      }
    } catch {
      // Non-critical
    }

    // Resolve firmId if not provided
    if (!searcherFirmId && organizationId) {
      try {
        const [firm] = await db
          .select({ id: serviceFirms.id })
          .from(serviceFirms)
          .where(eq(serviceFirms.organizationId, organizationId))
          .limit(1);
        if (firm) searcherFirmId = firm.id;
      } catch {
        // Non-critical
      }
    }

    // 3. Check search quota (metered gate)
    if (organizationId) {
      try {
        await requireUsage(organizationId, "networkSearches");
      } catch (err) {
        if (err instanceof FeatureGateError) {
          return NextResponse.json(
            {
              error: err.message,
              code: err.code,
              requiredPlan: err.requiredPlan,
            },
            { status: 403 }
          );
        }
        throw err;
      }
    }

    // 4. Execute search
    const result = await executeSearch({
      rawQuery: query,
      searcherFirmId,
      explicitFilters: filters,
      skipLlmRanking,
    });

    // 5. Log usage for billing
    if (organizationId) {
      try {
        await logAIUsage({
          organizationId,
          userId: session.user.id,
          model: "cascade_search",
          feature: "network_search",
          inputTokens: 0,
          outputTokens: 0,
          costUsd: result.stats.estimatedCostUsd,
          durationMs: result.stats.totalDurationMs,
        });
      } catch (logErr) {
        console.error("[Search API] Usage logging failed:", logErr);
        // Non-critical — don't fail the search
      }
    }

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
