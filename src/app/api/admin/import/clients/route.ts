import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  importedClients,
  importedCompanies,
  migrationBatches,
} from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";

/**
 * @deprecated Track A: imported_clients table was truncated.
 * Client data now comes from firm_case_studies.auto_tags.clientName.
 *
 * POST /api/admin/import/clients
 *
 * Receives a batch of client records from legacy JSON data and imports them
 * into the imported_clients table. Protected by ADMIN_SECRET header.
 *
 * Body: {
 *   batch: Array<LegacyClient>,
 *   batchNumber: number,
 *   totalBatches: number
 * }
 */

interface LegacyClient {
  id: string;
  name: string;
  industry?: { id: string; name: string } | null;
  noOfEmployees?: string | null;
  website?: string | null;
  organisation?: {
    id: string;
    organisation_detail?: {
      business_name?: string;
    };
  };
  [key: string]: unknown;
}

export async function POST(req: NextRequest) {
  // Verify admin secret
  const secret = req.headers.get("x-admin-secret");
  const expectedSecret = process.env.ADMIN_SECRET;
  if (!expectedSecret || secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      batch,
      batchNumber = 1,
      totalBatches = 1,
    } = body as {
      batch: LegacyClient[];
      batchNumber?: number;
      totalBatches?: number;
    };

    if (!Array.isArray(batch) || batch.length === 0) {
      return NextResponse.json(
        { error: "batch must be a non-empty array" },
        { status: 400 }
      );
    }

    // Create batch tracking record
    const batchId = nanoid();
    await db.insert(migrationBatches).values({
      id: batchId,
      source: "legacy",
      entityType: "clients",
      batchNumber,
      totalInBatch: batch.length,
      status: "processing",
      startedAt: new Date(),
    });

    // Pre-load company name → id mapping for FK resolution
    const allCompanies = await db
      .select({
        id: importedCompanies.id,
        name: importedCompanies.name,
      })
      .from(importedCompanies);
    const companyNameMap = new Map<string, string>();
    for (const c of allCompanies) {
      companyNameMap.set(c.name.toLowerCase(), c.id);
    }

    let imported = 0;
    let skipped = 0;
    let errors = 0;
    const errorDetails: Array<{ sourceId: string; error: string }> = [];

    // Bulk dedup: fetch all existing sourceIds in one query
    const batchSourceIds = batch.map((r) => String(r.id));
    const existingRows = await db
      .select({ sourceId: importedClients.sourceId })
      .from(importedClients)
      .where(inArray(importedClients.sourceId, batchSourceIds));
    const existingSet = new Set(existingRows.map((r) => r.sourceId));

    // Prepare insert values for new records
    const toInsert: (typeof importedClients.$inferInsert)[] = [];
    for (const row of batch) {
      const sourceId = String(row.id);

      if (existingSet.has(sourceId)) {
        skipped++;
        continue;
      }

      try {
        const serviceFirmName =
          row.organisation?.organisation_detail?.business_name || null;
        let importedCompanyId: string | null = null;
        if (serviceFirmName) {
          importedCompanyId =
            companyNameMap.get(serviceFirmName.toLowerCase()) || null;
        }

        toInsert.push({
          id: nanoid(),
          sourceId,
          source: "legacy",
          name: row.name,
          industry: row.industry?.name || null,
          website: row.website || null,
          employeeCount: row.noOfEmployees || null,
          serviceFirmSourceId: row.organisation?.id || null,
          serviceFirmName,
          importedCompanyId,
          legacyData: row,
          meta: {
            source: "legacy",
            migratedAt: new Date().toISOString(),
          },
        });
      } catch (err) {
        errors++;
        errorDetails.push({
          sourceId,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    // Bulk insert all new records
    if (toInsert.length > 0) {
      try {
        await db.insert(importedClients).values(toInsert);
        imported = toInsert.length;
      } catch (err) {
        // Fall back to individual inserts on bulk failure
        console.error("[ImportClients] Bulk insert failed, falling back to individual:", err);
        for (const val of toInsert) {
          try {
            await db.insert(importedClients).values(val);
            imported++;
          } catch (innerErr) {
            errors++;
            errorDetails.push({
              sourceId: val.sourceId!,
              error: innerErr instanceof Error ? innerErr.message : "Unknown",
            });
          }
        }
      }
    }

    // Update batch tracking
    await db
      .update(migrationBatches)
      .set({
        imported,
        skipped,
        errors,
        errorDetails: errorDetails.length > 0 ? errorDetails : null,
        status: errors > 0 && imported === 0 ? "failed" : "complete",
        completedAt: new Date(),
      })
      .where(eq(migrationBatches.id, batchId));

    return NextResponse.json({
      success: true,
      batchId,
      batchNumber,
      totalBatches,
      imported,
      skipped,
      errors,
      total: batch.length,
    });
  } catch (error) {
    console.error("[ImportClients] Failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
