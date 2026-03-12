/**
 * POST /api/admin/enrich/backfill-firm-types
 *
 * Retroactively derives firmType and sizeBand for all firms that have
 * enrichmentData but null firmType/sizeBand. This fills in the gap for
 * firms that were enriched before the auto-derivation logic was added.
 *
 * Safe to re-run — only updates firms where firmType or sizeBand is null.
 * Pass { force: true } to overwrite existing values.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { serviceFirms } from "@/lib/db/schema";
import { isNotNull, isNull, or, eq } from "drizzle-orm";

async function requireAdmin(req: NextRequest) {
  // Allow ADMIN_SECRET header for CLI/script access
  const adminSecret = req.headers.get("x-admin-secret");
  if (adminSecret && adminSecret === process.env.ADMIN_SECRET) {
    return { id: "admin-cli", role: "superadmin" };
  }
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || !["admin", "superadmin"].includes(session.user.role ?? ""))
    return null;
  return session.user;
}

/**
 * Map PDL employee count → sizeBand enum value.
 */
function deriveSizeBand(employeeCount: number | null | undefined): string | null {
  if (!employeeCount || employeeCount <= 0) return null;
  if (employeeCount === 1) return "individual";
  if (employeeCount <= 10) return "micro_1_10";
  if (employeeCount <= 50) return "small_11_50";
  if (employeeCount <= 200) return "emerging_51_200";
  if (employeeCount <= 500) return "mid_201_500";
  if (employeeCount <= 1000) return "upper_mid_501_1000";
  if (employeeCount <= 5000) return "large_1001_5000";
  if (employeeCount <= 10000) return "major_5001_10000";
  return "global_10000_plus";
}

/**
 * Map classification categories → best-fit firmType enum value.
 */
function deriveFirmType(
  categories: string[],
  employeeCount: number | null | undefined,
): string | null {
  const cats = new Set(categories.map((c) => c.toLowerCase()));

  if (cats.has("fractional & interim executives")) return "fractional_interim";
  if (cats.has("freelancer networks & talent platforms")) return "freelancer_network";
  if (cats.has("agency collectives & holding companies")) return "agency_collective";
  if (cats.has("managed service providers")) return "managed_service_provider";
  if (cats.has("staff augmentation & talent placement")) return "staff_augmentation";
  if (cats.has("embedded teams & pods")) return "embedded_teams";

  if (cats.has("management consulting") || cats.has("strategy consulting")) {
    if (employeeCount && employeeCount > 200) return "global_consulting";
    return "advisory";
  }

  if (cats.has("innovation & r&d consulting") || cats.has("transformation & change management")) {
    return "project_consulting";
  }

  const agencySignals = [
    "creative & branding agencies", "digital marketing agencies",
    "performance marketing agencies", "pr & communications agencies",
    "social media agencies", "content & media agencies",
    "seo & sem agencies", "web & app development agencies",
    "data & analytics consultancies", "product & ux design studios",
    "ecommerce & marketplace consultancies", "crm & marketing automation",
    "ai & machine learning consultancies", "video & motion studios",
    "experiential & events agencies", "employer branding & recruitment marketing",
  ];
  for (const signal of agencySignals) {
    if (cats.has(signal)) {
      if (employeeCount && employeeCount > 1000) return "global_consulting";
      return "boutique_agency";
    }
  }

  if (employeeCount && employeeCount > 500) return "global_consulting";
  return "boutique_agency";
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const force = body.force === true;

  // Get firms with enrichmentData
  const firms = await db
    .select({
      id: serviceFirms.id,
      name: serviceFirms.name,
      firmType: serviceFirms.firmType,
      sizeBand: serviceFirms.sizeBand,
      enrichmentData: serviceFirms.enrichmentData,
    })
    .from(serviceFirms)
    .where(isNotNull(serviceFirms.enrichmentData));

  let updated = 0;
  let skipped = 0;
  const results: { id: string; name: string; firmType: string | null; sizeBand: string | null }[] = [];

  for (const firm of firms) {
    // Skip if both already set (unless force)
    if (!force && firm.firmType && firm.sizeBand) {
      skipped++;
      continue;
    }

    const data = firm.enrichmentData as Record<string, unknown> | null;
    if (!data) { skipped++; continue; }

    const pdl = data.pdl as Record<string, unknown> | null;
    const companyData = data.companyData as Record<string, unknown> | null;
    const classification = data.classification as Record<string, unknown> | null;

    // Check both pdl.employeeCount (deep-crawl format) and companyData.employeeCount (legacy format)
    const employeeCount = (pdl?.employeeCount as number)
      ?? (companyData?.employeeCount as number)
      ?? null;
    const categories = (classification?.categories as string[]) ?? [];

    const newSizeBand = deriveSizeBand(employeeCount);
    const newFirmType = deriveFirmType(categories, employeeCount);

    // Only update fields that are null (unless force)
    const updateFields: Record<string, unknown> = {};
    if ((force || !firm.firmType) && newFirmType) updateFields.firmType = newFirmType;
    if ((force || !firm.sizeBand) && newSizeBand) updateFields.sizeBand = newSizeBand;

    if (Object.keys(updateFields).length === 0) {
      skipped++;
      continue;
    }

    await db.update(serviceFirms).set(updateFields).where(eq(serviceFirms.id, firm.id));
    updated++;
    results.push({
      id: firm.id,
      name: firm.name,
      firmType: (updateFields.firmType as string) ?? firm.firmType,
      sizeBand: (updateFields.sizeBand as string) ?? firm.sizeBand,
    });
  }

  return NextResponse.json({
    ok: true,
    totalWithEnrichmentData: firms.length,
    updated,
    skipped,
    results: results.slice(0, 50), // Show first 50 for visibility
  });
}
