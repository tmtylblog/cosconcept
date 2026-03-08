import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { importedCompanies, migrationBatches } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

/**
 * POST /api/admin/import/companies
 *
 * Receives a batch of companies from an n8n workflow and imports them
 * into the imported_companies table. Protected by ADMIN_SECRET header.
 *
 * Body: {
 *   batch: Array<n8nCompanyRow>,
 *   batchNumber: number,
 *   totalBatches: number
 * }
 *
 * Each n8nCompanyRow is the full row from n8n's public.companies table,
 * optionally joined with company_research, company_status, organization_service,
 * organization_selling_point, and company_prior_work data.
 */

interface N8nCompanyRow {
  id: number | string;
  company?: string;
  domain?: string;
  description?: string;
  industry?: string;
  size?: string;
  location?: string;
  location_city?: string;
  location_state?: string;
  location_street?: string;
  location_postal_code?: string;
  location_address?: string;
  country?: string;
  founded?: string | number;
  linkedin?: string;
  revenue?: string;
  headline?: string;
  facebook_url?: string;
  twitter_url?: string;
  company_keywords?: unknown;
  company_technologies?: unknown;
  notes?: string;
  research_flag?: string;
  investor_type?: string;
  company_normalized?: string;
  google_place_id?: string;
  created_at?: string;
  // Joined from company_research
  exec_summary?: string;
  investment_thesis_insight?: string;
  activity_insight?: string;
  portfolio_support_insight?: string;
  key_markets?: string;
  key_leadership?: string[];
  is_eu?: boolean;
  is_icp_investor?: boolean;
  // Joined from company_status
  research_company?: boolean;
  research_team?: boolean;
  research_news?: boolean;
  research_team_enrich?: boolean;
  research_linkedin?: boolean;
  research_basic_info?: boolean;
  investor_profiling?: boolean;
  general_profiling?: boolean;
  basic_info?: boolean;
  // Sub-arrays
  services?: Array<{ service_name: string; service_description?: string }>;
  selling_points?: Array<{
    selling_point_name: string;
    selling_point_description?: string;
  }>;
  prior_work?: Array<{
    type?: string;
    prior_work_description?: string;
    domain?: string;
  }>;
  [key: string]: unknown;
}

/** Investor detection keywords */
const INVESTOR_SIGNALS = [
  "investor",
  "venture",
  "capital",
  "private equity",
  "pe firm",
  "vc ",
  "angel",
  "fund",
  "investment",
  "hedge",
  "family office",
];

function detectInvestor(row: N8nCompanyRow): boolean {
  // Explicit investor_type field
  if (row.investor_type && row.investor_type.trim() !== "") return true;

  // is_icp_investor flag from research
  if (row.is_icp_investor === true) return true;

  // Check research_flag
  if (row.research_flag) {
    const flag = row.research_flag.toLowerCase();
    if (INVESTOR_SIGNALS.some((s) => flag.includes(s))) return true;
  }

  // Check industry field
  if (row.industry) {
    const ind = row.industry.toLowerCase();
    if (
      ind.includes("venture capital") ||
      ind.includes("private equity") ||
      ind.includes("investment management")
    )
      return true;
  }

  return false;
}

function buildLocation(row: N8nCompanyRow): string | null {
  const parts = [
    row.location_city,
    row.location_state,
    row.country || row.location,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : row.location || null;
}

function computeLastResearched(row: N8nCompanyRow): string | null {
  // Build researchFlags and find the most recent research timestamp
  const flags: Record<string, boolean> = {};
  if (row.research_company !== undefined)
    flags.research_company = !!row.research_company;
  if (row.research_team !== undefined)
    flags.research_team = !!row.research_team;
  if (row.research_news !== undefined)
    flags.research_news = !!row.research_news;
  if (row.research_linkedin !== undefined)
    flags.research_linkedin = !!row.research_linkedin;
  if (row.research_basic_info !== undefined)
    flags.research_basic_info = !!row.research_basic_info;
  if (row.investor_profiling !== undefined)
    flags.investor_profiling = !!row.investor_profiling;
  if (row.general_profiling !== undefined)
    flags.general_profiling = !!row.general_profiling;
  if (row.basic_info !== undefined) flags.basic_info = !!row.basic_info;

  // If any research has been done, use the created_at as proxy for last researched
  const anyResearched = Object.values(flags).some((v) => v);
  if (anyResearched && row.created_at) {
    return row.created_at;
  }
  return null;
}

function parseFoundedYear(value: string | number | undefined): number | null {
  if (!value) return null;
  const num = typeof value === "string" ? parseInt(value, 10) : value;
  if (isNaN(num) || num < 1800 || num > 2030) return null;
  return num;
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
      batch: N8nCompanyRow[];
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
      entityType: "companies",
      batchNumber,
      totalInBatch: batch.length,
      status: "processing",
      startedAt: new Date(),
    });

    let imported = 0;
    let skipped = 0;
    let errors = 0;
    const errorDetails: Array<{ sourceId: string; error: string }> = [];

    for (const row of batch) {
      const sourceId = String(row.id);

      try {
        // Check if already imported (idempotent)
        const existing = await db
          .select({ id: importedCompanies.id })
          .from(importedCompanies)
          .where(eq(importedCompanies.sourceId, sourceId))
          .limit(1);

        if (existing.length > 0) {
          skipped++;
          continue;
        }

        // Detect investor
        const isInvestor = detectInvestor(row);
        const reviewTags: string[] = [];
        if (isInvestor) reviewTags.push("investor_carry_over");

        // Determine ICP classification
        let icpClassification: string | null = null;
        if (isInvestor) {
          icpClassification = "investor";
        } else if (row.is_icp_investor === false && row.general_profiling) {
          // Has been profiled but not an investor
          icpClassification = row.industry || null;
        }

        // Build research flags
        const researchFlags: Record<string, boolean> = {};
        if (row.research_company !== undefined)
          researchFlags.research_company = !!row.research_company;
        if (row.research_team !== undefined)
          researchFlags.research_team = !!row.research_team;
        if (row.research_news !== undefined)
          researchFlags.research_news = !!row.research_news;
        if (row.research_linkedin !== undefined)
          researchFlags.research_linkedin = !!row.research_linkedin;
        if (row.research_basic_info !== undefined)
          researchFlags.research_basic_info = !!row.research_basic_info;

        const lastResearched = computeLastResearched(row);

        // Build legacy data (preserve EVERYTHING)
        const legacyData: Record<string, unknown> = { ...row };
        // Add sub-arrays if present
        if (row.services) legacyData.services = row.services;
        if (row.selling_points) legacyData.sellingPoints = row.selling_points;
        if (row.prior_work) legacyData.priorWork = row.prior_work;
        // Add research data
        if (row.exec_summary || row.key_markets || row.key_leadership) {
          legacyData.research = {
            exec_summary: row.exec_summary,
            investment_thesis_insight: row.investment_thesis_insight,
            activity_insight: row.activity_insight,
            portfolio_support_insight: row.portfolio_support_insight,
            key_markets: row.key_markets,
            key_leadership: row.key_leadership,
            is_eu: row.is_eu,
            is_icp_investor: row.is_icp_investor,
          };
        }

        await db.insert(importedCompanies).values({
          id: nanoid(),
          sourceId,
          source: "n8n",
          name: row.company || row.company_normalized || `Unknown (${sourceId})`,
          domain: row.domain || null,
          description: row.exec_summary || row.description || null,
          industry: row.industry || null,
          location: buildLocation(row),
          country: row.country || null,
          size: row.size || null,
          foundedYear: parseFoundedYear(row.founded),
          linkedinUrl: row.linkedin || null,
          websiteUrl: row.domain ? `https://${row.domain}` : null,
          revenue: row.revenue || null,
          isIcp: row.is_icp_investor === false ? true : null, // If explicitly NOT an investor, likely ICP
          icpClassification,
          reviewTags,
          meta: {
            source: "n8n",
            migratedAt: new Date().toISOString(),
            originalCreatedAt: row.created_at || undefined,
            lastResearchedAt: lastResearched || undefined,
            researchFlags:
              Object.keys(researchFlags).length > 0
                ? researchFlags
                : undefined,
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
          `[ImportCompanies] Error importing company ${sourceId}:`,
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
    console.error("[ImportCompanies] Failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
