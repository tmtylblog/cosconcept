import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { abstractionProfiles } from "@/lib/db/schema";
import { isNull, sql } from "drizzle-orm";
import { generateQueryEmbedding } from "@/lib/matching/vector-search";

/**
 * POST /api/admin/abstractions/backfill
 *
 * Generates and stores embeddings for abstraction profiles that are missing them.
 * Processes up to `limit` profiles per call (default 50) to avoid timeouts.
 *
 * Safe to run multiple times — only processes profiles where embedding IS NULL.
 * Requires superadmin role.
 *
 * Body: { limit?: number, dryRun?: boolean }
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

  const body = await req.json().catch(() => ({}));
  const limit = Math.min(body.limit ?? 50, 200);
  const dryRun = body.dryRun === true;

  // Find profiles missing embeddings
  const missing = await db
    .select({
      id: abstractionProfiles.id,
      entityId: abstractionProfiles.entityId,
      hiddenNarrative: abstractionProfiles.hiddenNarrative,
    })
    .from(abstractionProfiles)
    .where(isNull(abstractionProfiles.embedding))
    .limit(limit);

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      missingEmbeddings: missing.length,
      profiles: missing.map((p) => ({ id: p.id, entityId: p.entityId })),
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not configured" },
      { status: 500 }
    );
  }

  let embedded = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const profile of missing) {
    if (!profile.hiddenNarrative) {
      skipped++;
      continue;
    }

    try {
      const embedding = await generateQueryEmbedding(profile.hiddenNarrative);
      if (embedding.length === 0) {
        skipped++;
        continue;
      }

      await db
        .update(abstractionProfiles)
        .set({
          embedding,
          updatedAt: new Date(),
        })
        .where(sql`${abstractionProfiles.id} = ${profile.id}`);

      embedded++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${profile.id}: ${msg}`);
    }
  }

  return NextResponse.json({
    ok: true,
    total: missing.length,
    embedded,
    skipped,
    errors: errors.length > 0 ? errors : undefined,
    message: `Embedded ${embedded}/${missing.length} profiles. Run again if more remain.`,
  });
}
