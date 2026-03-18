/**
 * POST /api/partner-sync/entities — Accept entity pushes from partner
 * GET  /api/partner-sync/entities — Serve shared entities back to partner
 *
 * Supports Company, Person, CaseStudy, ServiceFirm entity types.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  importedCompanies,
  expertProfiles,
  firmCaseStudies,
  serviceFirms,
  migrationBatches,
  companyResearch,
} from "@/lib/db/schema";
import { eq, and, gt, ilike, sql, asc } from "drizzle-orm";
import { authenticatePartner } from "../lib/auth";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = new Set(["Company", "Person", "CaseStudy", "ServiceFirm"]);

// ─── POST: Accept entity pushes ──────────────────────────

interface InboundEntity {
  type: string;
  id: string;
  data: Record<string, unknown>;
  source: string;
}

export async function POST(req: Request) {
  const auth = authenticatePartner(req);
  if (auth instanceof NextResponse) return auth;

  let body: { partnerId?: string; entities?: InboundEntity[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const entities = body.entities;
  if (!Array.isArray(entities) || entities.length === 0) {
    return NextResponse.json(
      { error: "entities array required" },
      { status: 400 }
    );
  }

  // Validate types
  for (const e of entities) {
    if (!ALLOWED_TYPES.has(e.type)) {
      return NextResponse.json(
        { error: `Invalid entity type: ${e.type}. Allowed: ${[...ALLOWED_TYPES].join(", ")}` },
        { status: 400 }
      );
    }
  }

  const errors: string[] = [];
  let synced = 0;

  // Log batch
  const batchId = `ps_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const [batch] = await db
    .insert(migrationBatches)
    .values({
      id: batchId,
      source: "partner_sync",
      entityType: "mixed",
      batchNumber: 1,
      totalInBatch: entities.length,
      status: "processing",
      imported: 0,
      skipped: 0,
      errors: 0,
      startedAt: new Date(),
    })
    .returning({ id: migrationBatches.id });

  for (const entity of entities) {
    try {
      switch (entity.type) {
        case "Company":
          await upsertCompany(entity, auth.partnerId);
          break;
        case "Person":
          await upsertPerson(entity, auth.partnerId);
          break;
        case "CaseStudy":
          await upsertCaseStudy(entity, auth.partnerId);
          break;
        case "ServiceFirm":
          await upsertServiceFirm(entity, auth.partnerId);
          break;
      }
      synced++;
    } catch (err) {
      errors.push(`${entity.type}:${entity.id} — ${String(err)}`);
    }
  }

  // Update batch
  if (batch) {
    await db
      .update(migrationBatches)
      .set({
        status: "complete",
        imported: synced,
        errors: errors.length,
        errorDetails: errors.length > 0 ? errors : null,
        completedAt: new Date(),
      })
      .where(eq(migrationBatches.id, batch.id));
  }

  return NextResponse.json({ success: true, synced, errors });
}

// ─── Upsert helpers ──────────────────────────────────────

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function upsertCompany(entity: InboundEntity, partnerId: string) {
  const sourceId = `${partnerId}:${entity.id}`;
  const data = entity.data;

  // Check if exists
  const [existing] = await db
    .select({ id: importedCompanies.id })
    .from(importedCompanies)
    .where(
      and(
        eq(importedCompanies.sourceId, sourceId),
        eq(importedCompanies.source, partnerId)
      )
    )
    .limit(1);

  if (existing) {
    await db
      .update(importedCompanies)
      .set({
        name: (data.name as string) ?? undefined,
        domain: (data.domain as string) ?? undefined,
        legacyData: { partnerData: data, syncedAt: new Date().toISOString() },
        updatedAt: new Date(),
      })
      .where(eq(importedCompanies.id, existing.id));
  } else {
    await db.insert(importedCompanies).values({
      id: uid("ic"),
      sourceId,
      source: partnerId,
      name: (data.name as string) ?? "Unknown",
      domain: (data.domain as string) ?? null,
      legacyData: { partnerData: data, syncedAt: new Date().toISOString() },
    });
  }
}

async function upsertPerson(entity: InboundEntity, partnerId: string) {
  const cosExpertId = entity.data.cosExpertId as string | undefined;

  // Only accept persons with a cosExpertId (COS-registered experts)
  if (!cosExpertId) {
    throw new Error("Person entity missing cosExpertId — only COS-registered experts accepted");
  }

  // Find the expert profile
  const [expert] = await db
    .select({ id: expertProfiles.id })
    .from(expertProfiles)
    .where(eq(expertProfiles.id, cosExpertId))
    .limit(1);

  if (!expert) {
    throw new Error(`No expert found with id ${cosExpertId}`);
  }

  // Tag the expert with partner sync data via the headline field
  // (expert_profiles has no general-purpose meta column)
  await db
    .update(expertProfiles)
    .set({ updatedAt: new Date() })
    .where(eq(expertProfiles.id, cosExpertId));
}

async function upsertCaseStudy(entity: InboundEntity, partnerId: string) {
  const data = entity.data;
  const title = (data.title as string) ?? "Untitled";

  // Find Chameleon Collective's firm for attribution
  const [firm] = await db
    .select({ id: serviceFirms.id, orgId: serviceFirms.organizationId })
    .from(serviceFirms)
    .where(ilike(serviceFirms.name, "%chameleon%"))
    .limit(1);

  if (!firm) {
    throw new Error("Could not find Chameleon Collective firm for case study attribution");
  }

  // Check for existing case study with this partner source
  const sourceKey = `partner_sync:${partnerId}:${entity.id}`;
  const [existing] = await db
    .select({ id: firmCaseStudies.id })
    .from(firmCaseStudies)
    .where(eq(firmCaseStudies.sourceUrl, sourceKey))
    .limit(1);

  if (existing) {
    await db
      .update(firmCaseStudies)
      .set({
        title,
        updatedAt: new Date(),
      })
      .where(eq(firmCaseStudies.id, existing.id));
  } else {
    await db.insert(firmCaseStudies).values({
      id: uid("cs"),
      firmId: firm.id,
      organizationId: firm.orgId,
      title,
      sourceUrl: sourceKey,
      sourceType: "partner_sync",
      status: "active",
    });
  }
}

async function upsertServiceFirm(entity: InboundEntity, partnerId: string) {
  const data = entity.data;
  const domain = (data.domain as string) ?? "";

  if (!domain) {
    throw new Error("ServiceFirm entity requires domain");
  }

  // Find by domain match
  const [existing] = await db
    .select({ id: serviceFirms.id, enrichmentData: serviceFirms.enrichmentData })
    .from(serviceFirms)
    .where(ilike(serviceFirms.website, `%${domain}%`))
    .limit(1);

  if (existing) {
    // Store partner sync info in enrichmentData JSONB
    const ed = (existing.enrichmentData as Record<string, unknown>) ?? {};
    const partnerSync = (ed.partnerSync as Record<string, unknown>) ?? {};
    partnerSync[partnerId] = {
      partnerId: entity.id,
      syncedAt: new Date().toISOString(),
    };
    await db
      .update(serviceFirms)
      .set({
        enrichmentData: { ...ed, partnerSync },
        updatedAt: new Date(),
      })
      .where(eq(serviceFirms.id, existing.id));
  }
  // If not found, we don't create a new firm — ServiceFirm entities are
  // created through COS registration, not partner push
}

// ─── GET: Serve shared entities ──────────────────────────

export async function GET(req: Request) {
  const auth = authenticatePartner(req);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const partnerId = url.searchParams.get("partnerId");
  const cursor = url.searchParams.get("cursor") ?? null;
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "500") || 500, 2000);

  if (!type || !ALLOWED_TYPES.has(type)) {
    return NextResponse.json(
      { error: `type required. Allowed: ${[...ALLOWED_TYPES].join(", ")}` },
      { status: 400 }
    );
  }

  if (!partnerId) {
    return NextResponse.json(
      { error: "partnerId query param required" },
      { status: 400 }
    );
  }

  try {
    let entities: { type: string; id: string; data: Record<string, unknown>; source: string }[] = [];
    let nextCursor: string | null = null;
    let total: number | null = null;

    switch (type) {
      case "Company": {
        // Cursor-based pagination using the id column (text PK, ordered)
        // CORE sends limit=1000 and processes up to 50 pages per sync run.
        const conditions = cursor
          ? gt(importedCompanies.id, cursor)
          : undefined;

        const rows = await db
          .select({
            id: importedCompanies.id,
            name: importedCompanies.name,
            domain: importedCompanies.domain,
            websiteUrl: importedCompanies.websiteUrl,
            description: importedCompanies.description,
            employeeCountExact: importedCompanies.employeeCountExact,
            // Research fields (10 shared fields, excludes buyingIntentInsight which is CC-proprietary)
            executiveSummary: companyResearch.executiveSummary,
            interestingHighlights: companyResearch.interestingHighlights,
            offeringSummary: companyResearch.offeringSummary,
            industryInsight: companyResearch.industryInsight,
            stageInsight: companyResearch.stageInsight,
            customerInsight: companyResearch.customerInsight,
            growthChallenges: companyResearch.growthChallenges,
            keyMarkets: companyResearch.keyMarkets,
            competitorsInsight: companyResearch.competitorsInsight,
            industryTrends: companyResearch.industryTrends,
            researchedAt: companyResearch.researchedAt,
          })
          .from(importedCompanies)
          .leftJoin(
            companyResearch,
            eq(importedCompanies.domain, companyResearch.domain)
          )
          .where(conditions)
          .orderBy(asc(importedCompanies.id))
          .limit(limit + 1); // fetch one extra to detect if there are more pages

        // If we got limit+1 rows, there are more pages
        const hasMore = rows.length > limit;
        const pageRows = hasMore ? rows.slice(0, limit) : rows;

        if (hasMore && pageRows.length > 0) {
          nextCursor = pageRows[pageRows.length - 1].id;
        }

        // Get total count (only on first page to avoid repeated counting)
        if (!cursor) {
          const [countResult] = await db
            .select({ count: sql<number>`COUNT(*)::int` })
            .from(importedCompanies);
          total = countResult?.count ?? 0;
        }

        entities = pageRows.map((r) => ({
          type: "Company",
          id: r.id,
          data: {
            name: r.name,
            domain: r.domain,
            website: r.websiteUrl,
            description: r.description,
            employeeCount: r.employeeCountExact,
            // Research fields — only included when present
            ...(r.executiveSummary && { executiveSummary: r.executiveSummary }),
            ...(r.interestingHighlights && { interestingHighlights: r.interestingHighlights }),
            ...(r.offeringSummary && { offeringSummary: r.offeringSummary }),
            ...(r.industryInsight && { industryInsight: r.industryInsight }),
            ...(r.stageInsight && { stageInsight: r.stageInsight }),
            ...(r.customerInsight && { customerInsight: r.customerInsight }),
            ...(r.growthChallenges && { growthChallenges: r.growthChallenges }),
            ...(r.keyMarkets && { keyMarkets: r.keyMarkets }),
            ...(r.competitorsInsight && { competitorsInsight: r.competitorsInsight }),
            ...(r.industryTrends && { industryTrends: r.industryTrends }),
            ...(r.researchedAt && { researchedAt: r.researchedAt.toISOString() }),
          },
          source: "cos",
        }));
        break;
      }

      case "Person": {
        // Return experts from the partner's firm, with cursor pagination
        const [partnerFirm] = await db
          .select({ id: serviceFirms.id })
          .from(serviceFirms)
          .where(ilike(serviceFirms.website, `%${partnerId.replace("-", ".")}%`))
          .limit(1);

        if (partnerFirm) {
          const personConditions = cursor
            ? and(eq(expertProfiles.firmId, partnerFirm.id), gt(expertProfiles.id, cursor))
            : eq(expertProfiles.firmId, partnerFirm.id);

          const rows = await db
            .select({
              id: expertProfiles.id,
              fullName: expertProfiles.fullName,
              topSkills: expertProfiles.topSkills,
            })
            .from(expertProfiles)
            .where(personConditions)
            .orderBy(asc(expertProfiles.id))
            .limit(limit + 1);

          const hasMore = rows.length > limit;
          const pageRows = hasMore ? rows.slice(0, limit) : rows;
          if (hasMore && pageRows.length > 0) {
            nextCursor = pageRows[pageRows.length - 1].id;
          }

          entities = pageRows.map((r) => ({
            type: "Person",
            id: r.id,
            data: {
              name: r.fullName,
              skills: r.topSkills,
              cosExpertId: r.id,
            },
            source: partnerId,
          }));
        }
        break;
      }

      case "CaseStudy": {
        const csConditions = cursor
          ? and(
              eq(firmCaseStudies.sourceType, "partner_sync"),
              sql`${firmCaseStudies.sourceUrl} LIKE ${"partner_sync:" + partnerId + ":%"}`,
              gt(firmCaseStudies.id, cursor)
            )
          : and(
              eq(firmCaseStudies.sourceType, "partner_sync"),
              sql`${firmCaseStudies.sourceUrl} LIKE ${"partner_sync:" + partnerId + ":%"}`
            );

        const rows = await db
          .select({
            id: firmCaseStudies.id,
            title: firmCaseStudies.title,
            sourceUrl: firmCaseStudies.sourceUrl,
          })
          .from(firmCaseStudies)
          .where(csConditions)
          .orderBy(asc(firmCaseStudies.id))
          .limit(limit + 1);

        const hasMore = rows.length > limit;
        const pageRows = hasMore ? rows.slice(0, limit) : rows;
        if (hasMore && pageRows.length > 0) {
          nextCursor = pageRows[pageRows.length - 1].id;
        }

        entities = pageRows.map((r) => ({
          type: "CaseStudy",
          id: r.sourceUrl?.replace(`partner_sync:${partnerId}:`, "") ?? r.id,
          data: { title: r.title },
          source: partnerId,
        }));
        break;
      }

      case "ServiceFirm": {
        // Return firms that have partner sync metadata in enrichmentData, with cursor pagination
        const sfConditions = cursor
          ? and(
              sql`${serviceFirms.enrichmentData}->'partnerSync'->>${partnerId} IS NOT NULL`,
              gt(serviceFirms.id, cursor)
            )
          : sql`${serviceFirms.enrichmentData}->'partnerSync'->>${partnerId} IS NOT NULL`;

        const rows = await db
          .select({
            id: serviceFirms.id,
            name: serviceFirms.name,
            website: serviceFirms.website,
            enrichmentData: serviceFirms.enrichmentData,
          })
          .from(serviceFirms)
          .where(sfConditions)
          .orderBy(asc(serviceFirms.id))
          .limit(limit + 1);

        const hasMore = rows.length > limit;
        const pageRows = hasMore ? rows.slice(0, limit) : rows;
        if (hasMore && pageRows.length > 0) {
          nextCursor = pageRows[pageRows.length - 1].id;
        }

        entities = pageRows.map((r) => {
          const ed = (r.enrichmentData as Record<string, unknown>) ?? {};
          const ps = (ed.partnerSync as Record<string, Record<string, unknown>>) ?? {};
          return {
            type: "ServiceFirm",
            id: (ps[partnerId]?.partnerId as string) ?? r.id,
            data: { name: r.name, domain: r.website },
            source: partnerId,
          };
        });
        break;
      }
    }

    return NextResponse.json({
      entities,
      cursor: nextCursor,
      hasMore: nextCursor !== null,
      // Backward-compat fields
      nextCursor,
      ...(total !== null ? { total } : {}),
      count: entities.length,
    });
  } catch (err) {
    console.error("[Partner Sync] GET entities failed:", err);
    return NextResponse.json(
      { error: "Failed to retrieve entities" },
      { status: 500 }
    );
  }
}
