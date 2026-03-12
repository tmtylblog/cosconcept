/**
 * POST /api/admin/enrich/team-ingest
 *
 * Queue PDL team roster ingestion jobs for one or more firms.
 * Each job pulls current employees from PDL Person Search and upserts
 * them into expert_profiles with role classification.
 *
 * Cost: 1 PDL credit per person returned.
 *
 * Body params:
 *   firmIds?: string[]   — specific firms to process (omit = all enriched firms)
 *   limit?: number       — max people per firm (default: 5 for testing)
 *   force?: boolean      — re-run even if recently ingested (default: false)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { serviceFirms, enrichmentAuditLog } from "@/lib/db/schema";
import { eq, isNotNull, inArray } from "drizzle-orm";
import { enqueue } from "@/lib/jobs/queue";

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || !["admin", "superadmin"].includes(session.user.role ?? ""))
    return null;
  return session.user;
}

function extractDomain(website: string): string {
  return website
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .toLowerCase();
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { firmIds, limit = 5, force = false } = body as {
    firmIds?: string[];
    limit?: number;
    force?: boolean;
  };

  // Get firms to process
  const allFirms = firmIds?.length
    ? await db
        .select({ id: serviceFirms.id, website: serviceFirms.website })
        .from(serviceFirms)
        .where(inArray(serviceFirms.id, firmIds))
    : await db
        .select({ id: serviceFirms.id, website: serviceFirms.website })
        .from(serviceFirms)
        .where(isNotNull(serviceFirms.website));

  // Skip firms already ingested (unless force=true)
  let firms = allFirms.filter((f) => f.website);

  if (!force) {
    // Find firms that have a recent team-ingest audit log entry (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentlyIngested = await db
      .select({ firmId: enrichmentAuditLog.firmId })
      .from(enrichmentAuditLog)
      .where(
        eq(enrichmentAuditLog.phase, "team-ingest")
      );
    const recentIds = new Set(recentlyIngested.map((r) => r.firmId));
    firms = firms.filter((f) => !recentIds.has(f.id));
  }

  if (firms.length === 0) {
    return NextResponse.json({ queued: 0, message: "No firms to process" });
  }

  // Queue jobs with 5-second stagger to avoid hammering PDL
  const STAGGER_MS = 5_000;
  let queued = 0;
  const errors: string[] = [];

  for (let i = 0; i < firms.length; i++) {
    const firm = firms[i];
    const domain = extractDomain(firm.website!);
    if (!domain) continue;

    try {
      await enqueue(
        "team-ingest",
        { firmId: firm.id, domain, limit },
        { delayMs: i * STAGGER_MS }
      );
      queued++;
    } catch (err) {
      errors.push(`${firm.id}: ${err}`);
    }
  }

  const estimatedMinutes = Math.ceil((firms.length * STAGGER_MS) / 60_000);

  return NextResponse.json({
    queued,
    total: allFirms.length,
    skipped: allFirms.length - firms.length,
    errors: errors.length,
    limit,
    estimatedCredits: queued * limit,
    note: `Jobs staggered ${STAGGER_MS / 1000}s apart — all released in ~${estimatedMinutes} min`,
  });
}
