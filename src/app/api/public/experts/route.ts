/**
 * Public Experts API
 *
 * GET /api/public/experts — Returns enriched expert profiles
 *
 * No authentication required. Designed for third-party integrations.
 * Returns experts with their skills, industries, and firm affiliations.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { abstractionProfiles, serviceFirms } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

interface ExpertProfile {
  id: string;
  entityId: string;
  narrative: string | null;
  confidenceScores: Record<string, number> | null;
  evidenceSources: string[] | null;
  lastEnrichedAt: string | null;
  firm?: {
    id: string;
    name: string;
    website: string | null;
  } | null;
}

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  const requiredKey = process.env.PUBLIC_API_KEY;

  if (requiredKey && apiKey !== requiredKey) {
    return NextResponse.json(
      { error: "Invalid or missing API key" },
      { status: 401 }
    );
  }

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 200);
  const offset = parseInt(url.searchParams.get("offset") ?? "0");
  const firmId = url.searchParams.get("firmId");

  try {
    // Get expert abstraction profiles
    let query = db
      .select()
      .from(abstractionProfiles)
      .where(eq(abstractionProfiles.entityType, "expert"))
      .orderBy(desc(abstractionProfiles.updatedAt))
      .limit(limit)
      .offset(offset);

    const experts = await query;

    // Enrich with firm data
    const enriched: ExpertProfile[] = await Promise.all(
      experts.map(async (expert) => {
        // entityId for experts is usually formatted as "firmId:expertIdentifier"
        const firmIdFromEntity = expert.entityId.split(":")[0];
        let firm = null;

        if (firmIdFromEntity) {
          firm = await db.query.serviceFirms.findFirst({
            where: eq(serviceFirms.id, firmIdFromEntity),
            columns: { id: true, name: true, website: true },
          });
        }

        return {
          id: expert.id,
          entityId: expert.entityId,
          narrative: expert.hiddenNarrative,
          confidenceScores: expert.confidenceScores as Record<string, number> | null,
          evidenceSources: expert.evidenceSources as string[] | null,
          lastEnrichedAt: expert.lastEnrichedAt?.toISOString() ?? null,
          firm,
        };
      })
    );

    // Filter by firmId if provided
    const filtered = firmId
      ? enriched.filter((e) => e.firm?.id === firmId)
      : enriched;

    return NextResponse.json(
      {
        experts: filtered,
        meta: {
          count: filtered.length,
          limit,
          offset,
          total: experts.length,
        },
      },
      { headers: corsHeaders() }
    );
  } catch (err) {
    console.error("[Public Experts API] Error:", err);
    return NextResponse.json(
      { error: "Failed to load expert data" },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-api-key",
    "Cache-Control": "public, max-age=300", // 5 minutes
  };
}
