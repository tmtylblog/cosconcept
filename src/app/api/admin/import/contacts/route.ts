import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  importedCompanies,
  importedContacts,
  migrationBatches,
} from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { classifyTitle } from "@/lib/enrichment/expert-classifier";

/**
 * @deprecated Track A: imported_contacts table was truncated.
 * Contact/expert data now comes from expert_profiles table.
 *
 * POST /api/admin/import/contacts
 *
 * Receives a batch of contacts from an n8n workflow and imports them
 * into the imported_contacts table. Protected by ADMIN_SECRET header.
 *
 * FILTERS OUT:
 * - Contacts linked to investor-flagged companies
 * - Contacts with investment_specialties_general or investment_specialties_sector populated
 *
 * Body: {
 *   batch: Array<n8nContactRow>,
 *   batchNumber: number,
 *   totalBatches: number
 * }
 */

interface N8nContactRow {
  id: number | string;
  company_id?: number | string;
  apollo_id?: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  email?: string;
  email_status?: string;
  title?: string;
  linkedin_url?: string;
  photo_url?: string;
  headline?: string;
  short_bio?: string;
  city?: string;
  state?: string;
  country?: string;
  organization?: string;
  profile_url?: string;
  is_partner?: boolean;
  is_value_creation?: boolean;
  is_icp?: boolean;
  profile_match?: string;
  profile_match_justification?: string;
  investment_specialties_general?: string;
  investment_specialties_sector?: string;
  twitter_url?: string;
  github_url?: string;
  facebook_url?: string;
  employment_history?: unknown;
  portfolio_support_function?: string;
  fk_contact_profile?: string;
  created_at?: string;
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
      batch: N8nContactRow[];
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
      source: "n8n",
      entityType: "contacts",
      batchNumber,
      totalInBatch: batch.length,
      status: "processing",
      startedAt: new Date(),
    });

    // Pre-load investor company source IDs for filtering
    const investorCompanies = await db
      .select({
        sourceId: importedCompanies.sourceId,
      })
      .from(importedCompanies)
      .where(
        sql`${importedCompanies.reviewTags}::jsonb @> '"investor_carry_over"'::jsonb`
      );
    const investorCompanySourceIds = new Set(
      investorCompanies.map((c) => c.sourceId)
    );

    let imported = 0;
    let skipped = 0;
    let filteredInvestorContacts = 0;
    let errors = 0;
    const errorDetails: Array<{ sourceId: string; error: string }> = [];

    for (const row of batch) {
      const sourceId = String(row.id);

      try {
        // Check if already imported (idempotent)
        const existing = await db
          .select({ id: importedContacts.id })
          .from(importedContacts)
          .where(eq(importedContacts.sourceId, sourceId))
          .limit(1);

        if (existing.length > 0) {
          skipped++;
          continue;
        }

        // Filter 1: Skip contacts linked to investor companies
        if (row.company_id) {
          const companySourceId = String(row.company_id);
          if (investorCompanySourceIds.has(companySourceId)) {
            filteredInvestorContacts++;
            skipped++;
            continue;
          }
        }

        // Filter 2: Skip contacts with investment specialties (investor contacts from other biz)
        if (
          (row.investment_specialties_general &&
            row.investment_specialties_general.trim() !== "") ||
          (row.investment_specialties_sector &&
            row.investment_specialties_sector.trim() !== "")
        ) {
          filteredInvestorContacts++;
          skipped++;
          continue;
        }

        // Look up the imported company to link
        let companyId: string | null = null;
        if (row.company_id) {
          const companyMatch = await db
            .select({ id: importedCompanies.id })
            .from(importedCompanies)
            .where(eq(importedCompanies.sourceId, String(row.company_id)))
            .limit(1);
          if (companyMatch.length > 0) {
            companyId = companyMatch[0].id;
          }
        }

        // Classify expert status based on title
        let expertClassification: string | null = null;
        if (row.title) {
          expertClassification = classifyTitle(row.title);
        }

        // Build name
        const name =
          row.name ||
          [row.first_name, row.last_name].filter(Boolean).join(" ") ||
          null;

        // Build legacy data (preserve EVERYTHING)
        const legacyData: Record<string, unknown> = { ...row };

        await db.insert(importedContacts).values({
          id: nanoid(),
          sourceId,
          source: "n8n",
          companyId,
          firstName: row.first_name || null,
          lastName: row.last_name || null,
          name,
          email: row.email || null,
          title: row.title || null,
          linkedinUrl: row.linkedin_url || null,
          photoUrl: row.photo_url || null,
          headline: row.headline || null,
          shortBio: row.short_bio || null,
          city: row.city || null,
          state: row.state || null,
          country: row.country || null,
          isPartner: row.is_partner ?? null,
          isIcp: row.is_icp ?? null,
          profileMatch: row.profile_match || null,
          profileMatchJustification:
            row.profile_match_justification || null,
          expertClassification,
          reviewTags: [],
          meta: {
            source: "n8n",
            migratedAt: new Date().toISOString(),
            originalCreatedAt: row.created_at || undefined,
          },
          legacyData,
        });

        imported++;
      } catch (err) {
        errors++;
        errorDetails.push({
          sourceId,
          error: err instanceof Error ? err.message : "Unknown error",
        });
        console.error(
          `[ImportContacts] Error importing contact ${sourceId}:`,
          err
        );
      }
    }

    // Update batch tracking
    await db
      .update(migrationBatches)
      .set({
        imported,
        skipped,
        errors,
        errorDetails:
          errorDetails.length > 0
            ? [...errorDetails, { sourceId: "_summary", error: `${filteredInvestorContacts} investor contacts filtered` }]
            : filteredInvestorContacts > 0
              ? [{ sourceId: "_summary", error: `${filteredInvestorContacts} investor contacts filtered` }]
              : null,
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
      filteredInvestorContacts,
      errors,
      total: batch.length,
    });
  } catch (error) {
    console.error("[ImportContacts] Failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
