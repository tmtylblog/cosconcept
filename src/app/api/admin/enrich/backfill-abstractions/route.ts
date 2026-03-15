/**
 * POST /api/admin/enrich/backfill-abstractions
 *
 * Queues firm-abstraction jobs for all firms that don't have
 * an abstraction profile yet (or have a stale one).
 *
 * Safe to run multiple times — skips firms already in the queue
 * or recently enriched.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { serviceFirms, abstractionProfiles } from "@/lib/db/schema";
import { eq, notInArray } from "drizzle-orm";
import { inngest } from "@/inngest/client";

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
  const force = body.force === true; // re-process even if profile exists

  // Get all firms with websites (no website = no crawl data = low-quality abstraction)
  const allFirms = await db
    .select({ id: serviceFirms.id, organizationId: serviceFirms.organizationId, name: serviceFirms.name })
    .from(serviceFirms)
    .where(eq(serviceFirms.enrichmentStatus, "enriched"));

  let firmsToProcess = allFirms;

  if (!force) {
    // Skip firms that already have an abstraction profile
    const existingIds = await db
      .select({ entityId: abstractionProfiles.entityId })
      .from(abstractionProfiles)
      .where(eq(abstractionProfiles.entityType, "firm"));

    const existingSet = new Set(existingIds.map((r) => r.entityId));
    firmsToProcess = allFirms.filter((f) => !existingSet.has(f.id));
  }

  // Enqueue with staggered delays to avoid overloading the queue
  let queued = 0;
  for (const firm of firmsToProcess) {
    await inngest.send({ name: "enrich/firm-abstraction", data: {
      firmId: firm.id, organizationId: firm.organizationId,
    } });
    queued++;
  }

  return NextResponse.json({
    ok: true,
    total: allFirms.length,
    queued,
    skipped: allFirms.length - queued,
    message: force
      ? `Re-queued ${queued} firms for abstraction`
      : `Queued ${queued} firms missing abstraction profiles (${allFirms.length - queued} already have one)`,
  });
}
