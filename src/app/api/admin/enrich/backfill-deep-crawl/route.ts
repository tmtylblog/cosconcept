/**
 * POST /api/admin/enrich/backfill-deep-crawl
 *
 * Queues deep-crawl jobs for all firms that have a website
 * but no classifier entry in the audit log (i.e., never actually enriched).
 *
 * Safe to re-run — only targets firms with no enrichment audit log entry.
 * Pass { force: true } in body to re-crawl even enriched firms.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { serviceFirms, enrichmentAuditLog } from "@/lib/db/schema";
import { eq, isNotNull, inArray, notInArray } from "drizzle-orm";
import { enqueue } from "@/lib/jobs/queue";

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || !["admin", "superadmin"].includes(session.user.role ?? ""))
    return null;
  return session.user;
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const force = body.force === true;
  const limit = Math.min(Number(body.limit ?? 50), 200); // max 200 at once

  // Get firms with websites
  const allFirms = await db
    .select({
      id: serviceFirms.id,
      organizationId: serviceFirms.organizationId,
      name: serviceFirms.name,
      website: serviceFirms.website,
    })
    .from(serviceFirms)
    .where(isNotNull(serviceFirms.website))
    .limit(limit);

  let firmsToProcess = allFirms.filter((f) => f.website);

  if (!force) {
    // Skip firms that already have a classifier audit log entry
    const alreadyEnriched = await db
      .selectDistinct({ firmId: enrichmentAuditLog.firmId })
      .from(enrichmentAuditLog)
      .where(eq(enrichmentAuditLog.phase, "classifier"));

    const enrichedSet = new Set(
      alreadyEnriched.map((r) => r.firmId).filter(Boolean) as string[]
    );
    firmsToProcess = firmsToProcess.filter((f) => !enrichedSet.has(f.id));
  }

  // Enqueue with stagger to avoid hammering Jina
  let queued = 0;
  for (const firm of firmsToProcess) {
    await enqueue(
      "deep-crawl",
      {
        firmId: firm.id,
        organizationId: firm.organizationId,
        website: firm.website!,
        firmName: firm.name,
      },
      { delayMs: queued * 30_000 } // 30s between crawls — Jina rate limit friendly
    );
    queued++;
  }

  return NextResponse.json({
    ok: true,
    totalFirmsWithWebsite: allFirms.filter((f) => f.website).length,
    queued,
    skipped: allFirms.filter((f) => f.website).length - queued,
    estimatedDurationMinutes: Math.ceil((queued * 30) / 60),
    message: `Queued ${queued} deep-crawl jobs. Staggered at 30s intervals (~${Math.ceil((queued * 30) / 60)} min total). Abstractions will auto-generate 5 min after each crawl completes.`,
  });
}
