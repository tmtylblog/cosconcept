/**
 * POST /api/admin/import/populate-graph
 *
 * Syncs service_firms rows to Neo4j as full ServiceFirm nodes.
 * Uses writeFirmToGraph() for canonical graph writes with all classification edges.
 *
 * Modes:
 * - sync:    Write enriched service_firms that aren't yet in Neo4j
 * - promote: Convert imported_companies (ICP=true) → service_firms stubs
 * - classify: Re-enrich firms that have website but no classification (uses cache)
 *
 * Protected by ADMIN_SECRET header.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  serviceFirms,
  importedCompanies,
  enrichmentCache,
  migrationBatches,
} from "@/lib/db/schema";
import { eq, and, isNull, isNotNull, sql, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { writeFirmToGraph, type GraphFirmData } from "@/lib/enrichment/graph-writer";
import type { FirmClassification } from "@/lib/enrichment/ai-classifier";
import type { FirmGroundTruth } from "@/lib/enrichment/jina-scraper";
import type { PdlCompany } from "@/lib/enrichment/pdl";

const BATCH_SIZE = 25;

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-admin-secret");
  const expectedSecret = process.env.ADMIN_SECRET;
  if (!expectedSecret || secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const mode: string = body.mode ?? "sync";
    const limit: number = body.limit ?? 100;
    const firmIds: string[] | undefined = body.firmIds;

    switch (mode) {
      case "sync":
        return NextResponse.json(await syncServiceFirmsToGraph(limit, firmIds));
      case "promote":
        return NextResponse.json(await promoteImportedCompanies(limit));
      case "classify":
        return NextResponse.json(await classifyFromCache(limit));
      default:
        return NextResponse.json(
          { error: `Unknown mode: ${mode}. Use sync, promote, or classify.` },
          { status: 400 }
        );
    }
  } catch (err) {
    console.error("[populate-graph] Error:", err);
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}

// ─── Mode: sync ──────────────────────────────────────────
// Write enriched service_firms → Neo4j ServiceFirm nodes

async function syncServiceFirmsToGraph(limit: number, firmIds?: string[]) {
  const conditions = [isNotNull(serviceFirms.enrichmentData)];
  if (firmIds?.length) {
    conditions.push(inArray(serviceFirms.id, firmIds));
  }

  const firms = await db
    .select()
    .from(serviceFirms)
    .where(and(...conditions))
    .limit(limit);

  let synced = 0;
  let errors = 0;
  const errorDetails: string[] = [];

  // Track batch
  const batchId = nanoid();
  await db.insert(migrationBatches).values({
    id: batchId,
    source: "populate-graph",
    entityType: "service_firms",
    batchNumber: 1,
    totalInBatch: firms.length,
    status: "processing",
    startedAt: new Date(),
  });

  for (let i = 0; i < firms.length; i += BATCH_SIZE) {
    const batch = firms.slice(i, i + BATCH_SIZE);

    for (const firm of batch) {
      const ed = firm.enrichmentData as Record<string, unknown> | null;
      if (!ed) {
        errors++;
        errorDetails.push(`${firm.name}: no enrichment data`);
        continue;
      }

      // Extract domain from website
      let domain: string | undefined;
      if (firm.website) {
        try {
          domain = new URL(
            firm.website.startsWith("http") ? firm.website : `https://${firm.website}`
          ).hostname.replace(/^www\./, "");
        } catch { /* ignore */ }
      }

      const graphData: GraphFirmData = {
        firmId: firm.id,
        organizationId: firm.organizationId,
        name: firm.name,
        website: firm.website ?? undefined,
        domain,
        description: firm.description ?? undefined,
        foundedYear: firm.foundedYear ?? undefined,
        pdl: (ed.companyData as PdlCompany) ?? null,
        groundTruth: ed.extracted
          ? ({ extracted: ed.extracted } as FirmGroundTruth)
          : null,
        classification: (ed.classification as FirmClassification) ?? null,
      };

      try {
        const result = await writeFirmToGraph(graphData);
        if (result.firmNode) {
          await db
            .update(serviceFirms)
            .set({ graphNodeId: firm.id, updatedAt: new Date() })
            .where(eq(serviceFirms.id, firm.id));
          synced++;
        } else {
          errors++;
          errorDetails.push(`${firm.name}: ${result.errors.join(", ")}`);
        }
      } catch (err) {
        errors++;
        errorDetails.push(`${firm.name}: ${String(err)}`);
      }
    }
  }

  // Update batch
  await db
    .update(migrationBatches)
    .set({
      imported: synced,
      errors,
      errorDetails: errorDetails.length > 0 ? errorDetails : undefined,
      status: errors > 0 && synced === 0 ? "failed" : "complete",
      completedAt: new Date(),
    })
    .where(eq(migrationBatches.id, batchId));

  return { mode: "sync", synced, errors, total: firms.length, errorDetails };
}

// ─── Mode: promote ───────────────────────────────────────
// Convert imported_companies → service_firms stubs

async function promoteImportedCompanies(limit: number) {
  const companies = await db
    .select()
    .from(importedCompanies)
    .where(
      and(
        eq(importedCompanies.isIcp, true),
        isNull(importedCompanies.serviceFirmId)
      )
    )
    .limit(limit);

  let promoted = 0;
  let skipped = 0;
  const errorDetails: string[] = [];

  for (const co of companies) {
    // Dedup by domain — skip if service_firm already exists for this domain
    const website = co.websiteUrl ?? (co.domain ? `https://${co.domain}` : null);
    if (website) {
      const [existing] = await db
        .select({ id: serviceFirms.id })
        .from(serviceFirms)
        .where(
          sql`${serviceFirms.website} ILIKE ${`%${co.domain}%`}`
        )
        .limit(1);

      if (existing) {
        // Link the imported company to existing firm
        await db
          .update(importedCompanies)
          .set({ serviceFirmId: existing.id })
          .where(eq(importedCompanies.id, co.id));
        skipped++;
        continue;
      }
    }

    try {
      const firmId = nanoid();
      await db.insert(serviceFirms).values({
        id: firmId,
        organizationId: "system",
        name: co.name,
        website,
        description: co.description,
        foundedYear: co.foundedYear,
        enrichmentStatus: "pending",
      });

      await db
        .update(importedCompanies)
        .set({ serviceFirmId: firmId })
        .where(eq(importedCompanies.id, co.id));

      promoted++;
    } catch (err) {
      errorDetails.push(`${co.name}: ${String(err)}`);
    }
  }

  return {
    mode: "promote",
    promoted,
    skipped,
    errors: errorDetails.length,
    total: companies.length,
    errorDetails,
  };
}

// ─── Mode: classify ──────────────────────────────────────
// Apply cached enrichment data to pending service_firms

async function classifyFromCache(limit: number) {
  const firms = await db
    .select()
    .from(serviceFirms)
    .where(
      and(
        eq(serviceFirms.enrichmentStatus, "pending"),
        isNotNull(serviceFirms.website)
      )
    )
    .limit(limit);

  let enriched = 0;
  let noCache = 0;
  const errorDetails: string[] = [];

  for (const firm of firms) {
    // Extract domain
    let domain: string | undefined;
    if (firm.website) {
      try {
        domain = new URL(
          firm.website.startsWith("http") ? firm.website : `https://${firm.website}`
        ).hostname.replace(/^www\./, "");
      } catch { /* ignore */ }
    }

    if (!domain) {
      noCache++;
      continue;
    }

    // Check cache
    const [cached] = await db
      .select()
      .from(enrichmentCache)
      .where(eq(enrichmentCache.domain, domain))
      .limit(1);

    if (!cached || !cached.hasClassify) {
      noCache++;
      continue;
    }

    try {
      await db
        .update(serviceFirms)
        .set({
          enrichmentData: cached.enrichmentData,
          enrichmentStatus: "enriched",
          updatedAt: new Date(),
        })
        .where(eq(serviceFirms.id, firm.id));
      enriched++;
    } catch (err) {
      errorDetails.push(`${firm.name}: ${String(err)}`);
    }
  }

  return {
    mode: "classify",
    enriched,
    noCache,
    errors: errorDetails.length,
    total: firms.length,
    errorDetails,
  };
}
