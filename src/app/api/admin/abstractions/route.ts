import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { abstractionProfiles, serviceFirms } from "@/lib/db/schema";
import { eq, isNull, desc, sql } from "drizzle-orm";

/**
 * GET /api/admin/abstractions
 *
 * Returns abstraction profile status across all service firms.
 *
 * Query params:
 *   ?missing=true  — Only return firms WITHOUT an abstraction profile
 *   ?limit=50
 *   ?offset=0
 */
export async function GET(req: NextRequest) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user || session.user.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const missing = req.nextUrl.searchParams.get("missing") === "true";
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10), 200);
  const offset = parseInt(req.nextUrl.searchParams.get("offset") ?? "0", 10);

  // Aggregate stats
  const [stats] = await db
    .select({
      totalFirms: sql<number>`COUNT(DISTINCT ${serviceFirms.id})`,
      profilesGenerated: sql<number>`COUNT(DISTINCT ${abstractionProfiles.id})`,
      avgConfidence: sql<number>`AVG((${abstractionProfiles.confidenceScores}->>'overall')::float)`,
    })
    .from(serviceFirms)
    .leftJoin(abstractionProfiles, eq(abstractionProfiles.entityId, serviceFirms.id));

  const missingCount = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(serviceFirms)
    .leftJoin(abstractionProfiles, eq(abstractionProfiles.entityId, serviceFirms.id))
    .where(isNull(abstractionProfiles.id))
    .then((r) => Number(r[0]?.count ?? 0));

  // Firm list query
  type FirmRow = {
    firmId: string;
    firmName: string;
    entityType: string | null;
    confidenceScores: unknown;
    lastEnrichedAt: Date | null;
    hasProfile: boolean;
  };

  let rows: FirmRow[];

  if (missing) {
    // Firms with NO abstraction profile
    rows = await db
      .select({
        firmId: serviceFirms.id,
        firmName: serviceFirms.name,
        entityType: sql<string>`null`,
        confidenceScores: sql<unknown>`null`,
        lastEnrichedAt: sql<Date | null>`null`,
        hasProfile: sql<boolean>`false`,
      })
      .from(serviceFirms)
      .leftJoin(abstractionProfiles, eq(abstractionProfiles.entityId, serviceFirms.id))
      .where(isNull(abstractionProfiles.id))
      .orderBy(serviceFirms.name)
      .limit(limit)
      .offset(offset);
  } else {
    // All firms with their profiles (profile may be null)
    rows = await db
      .select({
        firmId: serviceFirms.id,
        firmName: serviceFirms.name,
        entityType: abstractionProfiles.entityType,
        confidenceScores: abstractionProfiles.confidenceScores,
        lastEnrichedAt: abstractionProfiles.lastEnrichedAt,
        hasProfile: sql<boolean>`${abstractionProfiles.id} IS NOT NULL`,
      })
      .from(serviceFirms)
      .leftJoin(abstractionProfiles, eq(abstractionProfiles.entityId, serviceFirms.id))
      .orderBy(desc(abstractionProfiles.lastEnrichedAt))
      .limit(limit)
      .offset(offset);
  }

  return NextResponse.json({
    stats: {
      totalFirms: Number(stats.totalFirms),
      profilesGenerated: Number(stats.profilesGenerated),
      missingProfiles: missingCount,
      avgConfidence: stats.avgConfidence ? Number(stats.avgConfidence) : null,
    },
    firms: rows.map((row) => ({
      firmId: row.firmId,
      firmName: row.firmName,
      hasProfile: Boolean(row.hasProfile),
      confidenceScores: row.confidenceScores as Record<string, number> | null,
      lastEnrichedAt: row.lastEnrichedAt ? row.lastEnrichedAt.toISOString() : null,
    })),
  });
}
