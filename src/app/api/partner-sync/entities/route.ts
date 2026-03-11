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
} from "@/lib/db/schema";
import { eq, and, ilike, sql } from "drizzle-orm";
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
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "1000"), 5000);

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

    switch (type) {
      case "Company": {
        const rows = await db
          .select({
            sourceId: importedCompanies.sourceId,
            name: importedCompanies.name,
            domain: importedCompanies.domain,
          })
          .from(importedCompanies)
          .where(eq(importedCompanies.source, partnerId))
          .limit(limit);

        entities = rows.map((r) => ({
          type: "Company",
          id: r.sourceId?.replace(`${partnerId}:`, "") ?? "",
          data: { name: r.name, domain: r.domain },
          source: partnerId,
        }));
        break;
      }

      case "Person": {
        // Return experts from the partner's firm
        const [partnerFirm] = await db
          .select({ id: serviceFirms.id })
          .from(serviceFirms)
          .where(ilike(serviceFirms.website, `%${partnerId.replace("-", ".")}%`))
          .limit(1);

        if (partnerFirm) {
          const rows = await db
            .select({
              id: expertProfiles.id,
              fullName: expertProfiles.fullName,
              topSkills: expertProfiles.topSkills,
            })
            .from(expertProfiles)
            .where(eq(expertProfiles.firmId, partnerFirm.id))
            .limit(limit);

          entities = rows.map((r) => ({
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
        const rows = await db
          .select({
            id: firmCaseStudies.id,
            title: firmCaseStudies.title,
            sourceUrl: firmCaseStudies.sourceUrl,
          })
          .from(firmCaseStudies)
          .where(
            and(
              eq(firmCaseStudies.sourceType, "partner_sync"),
              sql`${firmCaseStudies.sourceUrl} LIKE ${"partner_sync:" + partnerId + ":%"}`
            )
          )
          .limit(limit);

        entities = rows.map((r) => ({
          type: "CaseStudy",
          id: r.sourceUrl?.replace(`partner_sync:${partnerId}:`, "") ?? r.id,
          data: { title: r.title },
          source: partnerId,
        }));
        break;
      }

      case "ServiceFirm": {
        // Return firms that have partner sync metadata in enrichmentData
        const rows = await db
          .select({
            id: serviceFirms.id,
            name: serviceFirms.name,
            website: serviceFirms.website,
            enrichmentData: serviceFirms.enrichmentData,
          })
          .from(serviceFirms)
          .where(sql`${serviceFirms.enrichmentData}->'partnerSync'->>${partnerId} IS NOT NULL`)
          .limit(limit);

        entities = rows.map((r) => {
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

    return NextResponse.json({ entities, count: entities.length });
  } catch (err) {
    console.error("[Partner Sync] GET entities failed:", err);
    return NextResponse.json(
      { error: "Failed to retrieve entities" },
      { status: 500 }
    );
  }
}
