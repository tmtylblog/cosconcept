import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  importedCaseStudies,
  importedCompanies,
  migrationBatches,
} from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { createHash } from "crypto";

/**
 * POST /api/admin/import/case-studies
 *
 * Receives a batch of case study records from legacy JSON data.
 * Protected by ADMIN_SECRET header.
 *
 * Body: {
 *   batch: Array<LegacyCaseStudy>,
 *   batchNumber: number,
 *   totalBatches: number
 * }
 */

interface LegacyCaseStudy {
  authorId?: string;
  about?: string;
  status?: string;
  summary?: string;
  case_study_companies?: Array<{
    companyID: string;
    company: { name: string };
  }>;
  case_study_industries?: Array<{
    industry: { id: string; name: string };
  }>;
  case_study_skills?: Array<{
    skill: { id: string; name: string };
  }>;
  case_study_links?: Array<{ link: string }>;
  case_study_markets?: Array<{ countryCode: string }>;
  case_study_users?: Array<{
    user?: { id: string; firstName?: string; lastName?: string };
  }>;
  case_study_languages?: unknown[];
  organisation?: {
    id: string;
    organisation_detail?: {
      business_name?: string;
    };
  };
  [key: string]: unknown;
}

function generateSourceId(cs: LegacyCaseStudy): string {
  const parts = [
    cs.authorId || "unknown",
    cs.organisation?.id || "unknown",
    cs.about ? cs.about.substring(0, 100) : "empty",
  ];
  return createHash("sha256").update(parts.join("|")).digest("hex").substring(0, 32);
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
      batch: LegacyCaseStudy[];
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
      entityType: "case_studies",
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

    // Generate sourceIds for dedup
    const batchWithSourceIds = batch.map((row) => ({
      row,
      sourceId: generateSourceId(row),
    }));
    const allSourceIds = batchWithSourceIds.map((b) => b.sourceId);

    // Bulk dedup: fetch all existing sourceIds in one query
    const existingRows = await db
      .select({ sourceId: importedCaseStudies.sourceId })
      .from(importedCaseStudies)
      .where(inArray(importedCaseStudies.sourceId, allSourceIds));
    const existingSet = new Set(existingRows.map((r) => r.sourceId));

    // Prepare insert values for new records
    const toInsert: (typeof importedCaseStudies.$inferInsert)[] = [];
    for (const { row, sourceId } of batchWithSourceIds) {
      if (existingSet.has(sourceId)) {
        skipped++;
        continue;
      }

      try {
        const authorOrgName =
          row.organisation?.organisation_detail?.business_name || null;
        let importedCompanyId: string | null = null;
        if (authorOrgName) {
          importedCompanyId =
            companyNameMap.get(authorOrgName.toLowerCase()) || null;
        }

        const clientCompanies = (row.case_study_companies || []).map((c) => ({
          id: c.companyID,
          name: c.company?.name || "Unknown",
        }));

        const industries = (row.case_study_industries || [])
          .filter((i) => i.industry)
          .map((i) => ({ id: i.industry.id, name: i.industry.name }));

        const skills = (row.case_study_skills || [])
          .filter((s) => s.skill)
          .map((s) => ({ id: s.skill.id, name: s.skill.name }));

        const links = (row.case_study_links || [])
          .filter((l) => l.link)
          .map((l) => l.link);

        const markets = (row.case_study_markets || [])
          .filter((m) => m.countryCode)
          .map((m) => m.countryCode);

        const expertUsers = (row.case_study_users || [])
          .filter((u) => u.user)
          .map((u) => ({
            id: u.user!.id,
            name: [u.user!.firstName, u.user!.lastName].filter(Boolean).join(" "),
          }));

        toInsert.push({
          id: nanoid(),
          sourceId,
          source: "legacy",
          authorOrgSourceId: row.organisation?.id || null,
          authorOrgName,
          content: row.about || null,
          status: row.status || "published",
          clientCompanies,
          industries,
          skills,
          links,
          markets,
          expertUsers,
          importedCompanyId,
          legacyData: row,
          meta: {
            source: "legacy",
            migratedAt: new Date().toISOString(),
            authorId: row.authorId,
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
        await db.insert(importedCaseStudies).values(toInsert);
        imported = toInsert.length;
      } catch (err) {
        console.error("[ImportCaseStudies] Bulk insert failed, falling back:", err);
        for (const val of toInsert) {
          try {
            await db.insert(importedCaseStudies).values(val);
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
    console.error("[ImportCaseStudies] Failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
