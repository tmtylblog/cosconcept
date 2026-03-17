/**
 * POST /api/admin/enrich/retry-experts
 *
 * Re-queues expert-linkedin enrichment for all expert profiles that
 * are missing enrichment (pdlEnrichedAt IS NULL, enrichmentStatus != 'enriched').
 *
 * Body: { dryRun?: boolean, firmIds?: string[], limit?: number }
 * Returns: { queued, total, experts[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { expertProfiles, serviceFirms } from "@/lib/db/schema";
import { eq, isNull, sql } from "drizzle-orm";
import { inngest } from "@/inngest/client";

export const dynamic = "force-dynamic";

async function requireAdmin(req: NextRequest) {
  const adminSecret = req.headers.get("x-admin-secret");
  if (adminSecret && adminSecret === process.env.ADMIN_SECRET) {
    return { id: "admin-cli", role: "superadmin" };
  }
  const session = await auth.api.getSession({ headers: await headers() });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!session?.user || !["admin", "superadmin"].includes((session.user as any).role ?? ""))
    return null;
  return session.user;
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const dryRun = body.dryRun === true;
  const firmIds: string[] | undefined = body.firmIds;
  const limit: number = body.limit ?? 1000;

  // Find all expert profiles missing enrichment
  let query = db
    .select({
      id: expertProfiles.id,
      firmId: expertProfiles.firmId,
      fullName: expertProfiles.fullName,
      linkedinUrl: expertProfiles.linkedinUrl,
      importedContactId: expertProfiles.importedContactId,
      enrichmentStatus: expertProfiles.enrichmentStatus,
      firmName: serviceFirms.name,
      firmWebsite: serviceFirms.website,
    })
    .from(expertProfiles)
    .innerJoin(serviceFirms, eq(expertProfiles.firmId, serviceFirms.id))
    .where(isNull(expertProfiles.pdlEnrichedAt))
    .limit(limit)
    .$dynamic();

  if (firmIds && firmIds.length > 0) {
    query = query.where(sql`${expertProfiles.firmId} IN ${firmIds}`);
  }

  const unenriched = await query;

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      total: unenriched.length,
      byFirm: summarizeByFirm(unenriched),
      experts: unenriched.map((e) => ({
        id: e.id,
        fullName: e.fullName,
        firmName: e.firmName,
        linkedinUrl: e.linkedinUrl,
        enrichmentStatus: e.enrichmentStatus,
      })),
    });
  }

  // Queue enrichment events in batches of 20
  let queued = 0;
  const BATCH_SIZE = 20;

  for (let i = 0; i < unenriched.length; i += BATCH_SIZE) {
    const batch = unenriched.slice(i, i + BATCH_SIZE);
    const events = batch.map((expert) => ({
      name: "enrich/expert-linkedin" as const,
      data: {
        expertId: expert.id,
        firmId: expert.firmId,
        fullName: expert.fullName ?? "Unknown",
        linkedinUrl: expert.linkedinUrl ?? undefined,
        companyName: expert.firmName,
        companyWebsite: expert.firmWebsite ?? undefined,
        importedContactId: expert.importedContactId ?? undefined,
      },
    }));

    await inngest.send(events);
    queued += batch.length;
  }

  return NextResponse.json({
    ok: true,
    queued,
    total: unenriched.length,
    byFirm: summarizeByFirm(unenriched),
    message: `Queued ${queued} expert enrichment jobs. They will use EnrichLayer (primary) with PDL fallback.`,
  });
}

function summarizeByFirm(
  experts: { firmId: string; firmName: string | null }[]
): { firmId: string; firmName: string; count: number }[] {
  const map = new Map<string, { firmName: string; count: number }>();
  for (const e of experts) {
    const existing = map.get(e.firmId);
    if (existing) {
      existing.count++;
    } else {
      map.set(e.firmId, { firmName: e.firmName ?? "Unknown", count: 1 });
    }
  }
  return Array.from(map.entries())
    .map(([firmId, { firmName, count }]) => ({ firmId, firmName, count }))
    .sort((a, b) => b.count - a.count);
}
