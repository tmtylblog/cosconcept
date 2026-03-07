/**
 * Public Case Studies API
 *
 * GET /api/public/case-studies — Returns enriched case study profiles
 *
 * No authentication required. Designed for third-party integrations.
 * Returns case studies with skills, industries, and firm affiliations.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { abstractionProfiles, serviceFirms } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

interface CaseStudyProfile {
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
    const caseStudies = await db
      .select()
      .from(abstractionProfiles)
      .where(eq(abstractionProfiles.entityType, "case_study"))
      .orderBy(desc(abstractionProfiles.updatedAt))
      .limit(limit)
      .offset(offset);

    const enriched: CaseStudyProfile[] = await Promise.all(
      caseStudies.map(async (cs) => {
        const firmIdFromEntity = cs.entityId.split(":")[0];
        let firm = null;

        if (firmIdFromEntity) {
          firm = await db.query.serviceFirms.findFirst({
            where: eq(serviceFirms.id, firmIdFromEntity),
            columns: { id: true, name: true, website: true },
          });
        }

        return {
          id: cs.id,
          entityId: cs.entityId,
          narrative: cs.hiddenNarrative,
          confidenceScores: cs.confidenceScores as Record<string, number> | null,
          evidenceSources: cs.evidenceSources as string[] | null,
          lastEnrichedAt: cs.lastEnrichedAt?.toISOString() ?? null,
          firm,
        };
      })
    );

    const filtered = firmId
      ? enriched.filter((e) => e.firm?.id === firmId)
      : enriched;

    return NextResponse.json(
      {
        caseStudies: filtered,
        meta: {
          count: filtered.length,
          limit,
          offset,
          total: caseStudies.length,
        },
      },
      { headers: corsHeaders() }
    );
  } catch (err) {
    console.error("[Public Case Studies API] Error:", err);
    return NextResponse.json(
      { error: "Failed to load case study data" },
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
    "Cache-Control": "public, max-age=300",
  };
}
