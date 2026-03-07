/**
 * Public Firms API
 *
 * GET /api/public/firms — Returns public firm directory
 *
 * No authentication required. Designed for third-party integrations.
 * Returns firms that have opted into the public directory.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serviceFirms, abstractionProfiles } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

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
  const firmType = url.searchParams.get("firmType");

  try {
    const firms = await db
      .select()
      .from(serviceFirms)
      .where(eq(serviceFirms.isPlatformMember, true))
      .orderBy(desc(serviceFirms.createdAt))
      .limit(limit)
      .offset(offset);

    const enriched = await Promise.all(
      firms.map(async (firm) => {
        // Get abstraction profile if available
        const profile = await db.query.abstractionProfiles.findFirst({
          where: eq(abstractionProfiles.entityId, firm.id),
        });

        return {
          id: firm.id,
          name: firm.name,
          website: firm.website,
          description: firm.description,
          foundedYear: firm.foundedYear,
          sizeBand: firm.sizeBand,
          firmType: firm.firmType,
          profileCompleteness: firm.profileCompleteness,
          partnershipReadinessScore: firm.partnershipReadinessScore,
          narrative: profile?.hiddenNarrative ?? null,
          lastEnriched: profile?.lastEnrichedAt?.toISOString() ?? null,
        };
      })
    );

    const filtered = firmType
      ? enriched.filter((f) => f.firmType === firmType)
      : enriched;

    return NextResponse.json(
      {
        firms: filtered,
        meta: {
          count: filtered.length,
          limit,
          offset,
        },
      },
      { headers: corsHeaders() }
    );
  } catch (err) {
    console.error("[Public Firms API] Error:", err);
    return NextResponse.json(
      { error: "Failed to load firm data" },
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
