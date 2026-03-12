/**
 * POST /api/admin/enrich/backfill-deep-crawl
 *
 * Queues deep-crawl jobs for all firms that have a website
 * but no classifier entry in the audit log (i.e., never actually enriched).
 *
 * Safe to re-run — only targets firms with no enrichment audit log entry.
 * Pass { force: true } in body to re-crawl even enriched firms.
 * Pass { limit: N } to cap the number of jobs queued (default 50, max 500).
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { serviceFirms, enrichmentAuditLog } from "@/lib/db/schema";
import { eq, isNotNull } from "drizzle-orm";
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
  const limit = Math.min(Number(body.limit ?? 50), 500); // max 500 at once

  // Get ALL firms with websites (no limit on the query itself — we filter then cap)
  const allFirms = await db
    .select({
      id: serviceFirms.id,
      organizationId: serviceFirms.organizationId,
      name: serviceFirms.name,
      website: serviceFirms.website,
    })
    .from(serviceFirms)
    .where(isNotNull(serviceFirms.website));

  const firmsWithWebsite = allFirms.filter((f) => f.website);
  let firmsToProcess = firmsWithWebsite;

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

  // Cap to the requested limit
  const totalNeedingEnrichment = firmsToProcess.length;
  firmsToProcess = firmsToProcess.slice(0, limit);

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
    totalFirmsWithWebsite: firmsWithWebsite.length,
    totalNeedingEnrichment,
    queued,
    skipped: firmsWithWebsite.length - totalNeedingEnrichment,
    remaining: totalNeedingEnrichment - queued,
    estimatedDurationMinutes: Math.ceil((queued * 30) / 60),
    message: `Queued ${queued} deep-crawl jobs (${totalNeedingEnrichment - queued} remaining). Staggered at 30s intervals (~${Math.ceil((queued * 30) / 60)} min total).`,
  });
}
