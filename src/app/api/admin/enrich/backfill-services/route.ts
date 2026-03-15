/**
 * POST /api/admin/enrich/backfill-services
 *
 * One-time backfill: for any service_firms row that has enrichment data
 * (extracted.services / extracted.caseStudyUrls) but no firmServices rows,
 * seed the services and queue case study ingestion.
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { serviceFirms, firmServices, firmCaseStudies } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { inngest } from "@/inngest/client";

export const dynamic = "force-dynamic";

async function checkAdmin() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  if (!session?.user || session.user.role !== "superadmin") return null;
  return session;
}

export async function POST(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({})) as { orgId?: string; dryRun?: boolean };
  const dryRun = body.dryRun ?? false;

  // Fetch firms with enrichment data
  const conditions = [];
  if (body.orgId) {
    conditions.push(eq(serviceFirms.organizationId, body.orgId));
  }

  const firms = await db
    .select({
      id: serviceFirms.id,
      organizationId: serviceFirms.organizationId,
      name: serviceFirms.name,
      website: serviceFirms.website,
      enrichmentData: serviceFirms.enrichmentData,
    })
    .from(serviceFirms)
    .where(conditions.length > 0 ? conditions[0] : undefined as never);

  const results: { firmId: string; name: string; servicesSeeded: number; caseStudiesQueued: number; skipped?: string }[] = [];
  let totalServicesSeeded = 0;
  let totalCsQueued = 0;

  for (const firm of firms) {
    const ed = firm.enrichmentData as Record<string, unknown> | null;
    if (!ed) {
      results.push({ firmId: firm.id, name: firm.name, servicesSeeded: 0, caseStudiesQueued: 0, skipped: "no enrichment data" });
      continue;
    }

    const extracted = ed.extracted as Record<string, unknown> | null;
    const discoveredServices = (extracted?.services as string[] | undefined) ?? [];
    const discoveredCsUrls = (extracted?.caseStudyUrls as string[] | undefined) ?? [];

    let servicesSeeded = 0;
    let csQueued = 0;

    // ── Seed services ──────────────────────────────────────
    if (discoveredServices.length > 0) {
      const [existingService] = await db
        .select({ id: firmServices.id })
        .from(firmServices)
        .where(eq(firmServices.firmId, firm.id))
        .limit(1);

      if (!existingService) {
        if (!dryRun) {
          const now = new Date();
          await db.insert(firmServices).values(
            discoveredServices.map((name, i) => ({
              id: `svc_${Date.now().toString(36)}_${i.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
              firmId: firm.id,
              organizationId: firm.organizationId,
              name: name.trim(),
              description: null,
              sourceUrl: firm.website || null,
              sourcePageTitle: "Auto-discovered from website",
              subServices: [] as string[],
              isHidden: false,
              displayOrder: i,
              createdAt: now,
              updatedAt: now,
            }))
          ).onConflictDoNothing();
        }
        servicesSeeded = discoveredServices.length;
        totalServicesSeeded += servicesSeeded;
      }
    }

    // ── Queue case studies ─────────────────────────────────
    for (const csUrl of discoveredCsUrls.slice(0, 30)) {
      const [existing] = await db
        .select({ id: firmCaseStudies.id })
        .from(firmCaseStudies)
        .where(and(eq(firmCaseStudies.firmId, firm.id), eq(firmCaseStudies.sourceUrl, csUrl)))
        .limit(1);

      if (existing) continue;

      if (!dryRun) {
        const csId = `cs_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
        await db.insert(firmCaseStudies).values({
          id: csId,
          firmId: firm.id,
          organizationId: firm.organizationId,
          sourceUrl: csUrl,
          sourceType: "url",
          status: "pending",
        });
        await inngest.send({
          name: "enrich/firm-case-study-ingest",
          data: {
            caseStudyId: csId,
            firmId: firm.id,
            organizationId: firm.organizationId,
            sourceUrl: csUrl,
            sourceType: "url",
          },
        });
      }
      csQueued++;
      totalCsQueued++;
    }

    results.push({ firmId: firm.id, name: firm.name, servicesSeeded, caseStudiesQueued: csQueued });
  }

  return NextResponse.json({
    dryRun,
    firmsProcessed: firms.length,
    totalServicesSeeded,
    totalCsQueued,
    results,
  });
}
