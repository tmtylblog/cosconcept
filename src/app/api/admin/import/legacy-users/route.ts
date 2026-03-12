import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { readFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

/**
 * POST /api/admin/import/legacy-users
 *
 * Imports users from the legacy user-basic.json file and matches them
 * to existing service_firms by org name (case-insensitive).
 *
 * Query params:
 *   dryRun=true — preview matches without inserting (default: false)
 */

interface LegacyUserRecord {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  title: string | null;
  organisation: {
    id: string;
    organisation_detail: {
      business_name: string;
    };
  } | null;
  user_meta_cos_user_roles: {
    cos_user_role: {
      name: string;
    };
  }[];
}

export async function POST(req: NextRequest) {
  // Auth check
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user || session.user.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "true";

  try {
    // 1. Read legacy data
    const filePath = join(
      process.cwd(),
      "data/legacy/Data Dump (JSON)/Step 3_ Organization Content Data/user-basic.json"
    );

    let rawData: string;
    try {
      rawData = readFileSync(filePath, "utf-8");
    } catch {
      return NextResponse.json(
        { error: "Legacy file not found. This endpoint only works locally." },
        { status: 400 }
      );
    }

    const parsed = JSON.parse(rawData);
    const legacyUsers: LegacyUserRecord[] = parsed.data.user_meta;

    // 2. Load all service_firms for matching
    const firmsResult = await db.execute(sql`
      SELECT id, name, organization_id AS "organizationId"
      FROM service_firms
      ORDER BY name
    `);
    const firms = firmsResult.rows as {
      id: string;
      name: string;
      organizationId: string;
    }[];

    // Build a case-insensitive name lookup
    const firmByNameLower = new Map<string, (typeof firms)[0]>();
    for (const firm of firms) {
      firmByNameLower.set(firm.name.toLowerCase().trim(), firm);
    }

    // 3. Check how many are already imported (avoid duplicates)
    const existingResult = await db.execute(sql`
      SELECT legacy_user_id FROM legacy_users
    `);
    const existingIds = new Set(
      existingResult.rows.map((r) => r.legacy_user_id as string)
    );

    // 4. Process each legacy user
    let matched = 0;
    let unmatched = 0;
    let skippedDupe = 0;
    let inserted = 0;
    const unmatchedOrgs = new Map<string, number>();
    const matchedOrgs = new Map<string, number>();
    const toInsert: {
      id: string;
      legacyUserId: string;
      legacyOrgId: string | null;
      legacyOrgName: string | null;
      firstName: string | null;
      lastName: string | null;
      email: string | null;
      title: string | null;
      legacyRoles: string[];
      firmId: string | null;
    }[] = [];

    for (const user of legacyUsers) {
      // Skip if already imported
      if (existingIds.has(user.id)) {
        skippedDupe++;
        continue;
      }

      const orgName =
        user.organisation?.organisation_detail?.business_name ?? null;
      const orgId = user.organisation?.id ?? null;

      // Extract roles
      const roles = (user.user_meta_cos_user_roles ?? [])
        .map((r) => r.cos_user_role?.name)
        .filter(Boolean);

      // Try to match to a service_firm
      let firmId: string | null = null;
      if (orgName) {
        const firmMatch = firmByNameLower.get(orgName.toLowerCase().trim());
        if (firmMatch) {
          firmId = firmMatch.id;
          matched++;
          matchedOrgs.set(orgName, (matchedOrgs.get(orgName) ?? 0) + 1);
        } else {
          unmatched++;
          unmatchedOrgs.set(orgName, (unmatchedOrgs.get(orgName) ?? 0) + 1);
        }
      } else {
        unmatched++;
      }

      toInsert.push({
        id: randomUUID(),
        legacyUserId: user.id,
        legacyOrgId: orgId,
        legacyOrgName: orgName,
        firstName: user.firstName ?? null,
        lastName: user.lastName ?? null,
        email: user.email ?? null,
        title: user.title ?? null,
        legacyRoles: roles,
        firmId,
      });
    }

    // 5. If dry run, return preview stats
    if (dryRun) {
      // Top unmatched orgs
      const topUnmatched = [...unmatchedOrgs.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([name, count]) => ({ name, count }));

      const topMatched = [...matchedOrgs.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([name, count]) => ({ name, count }));

      return NextResponse.json({
        dryRun: true,
        totalLegacyUsers: legacyUsers.length,
        alreadyImported: skippedDupe,
        toImport: toInsert.length,
        matchedToFirm: matched,
        unmatchedToFirm: unmatched,
        serviceFirmsInDb: firms.length,
        topMatchedOrgs: topMatched,
        topUnmatchedOrgs: topUnmatched,
      });
    }

    // 6. Insert in batches of 100
    const BATCH_SIZE = 100;
    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const batch = toInsert.slice(i, i + BATCH_SIZE);
      const values = batch
        .map(
          (u) =>
            `('${u.id}', '${u.legacyUserId}', ${u.legacyOrgId ? `'${u.legacyOrgId}'` : "NULL"}, ${u.legacyOrgName ? `'${u.legacyOrgName.replace(/'/g, "''")}'` : "NULL"}, ${u.firstName ? `'${u.firstName.replace(/'/g, "''")}'` : "NULL"}, ${u.lastName ? `'${u.lastName.replace(/'/g, "''")}'` : "NULL"}, ${u.email ? `'${u.email.replace(/'/g, "''")}'` : "NULL"}, ${u.title ? `'${u.title.replace(/'/g, "''")}'` : "NULL"}, '${JSON.stringify(u.legacyRoles)}'::jsonb, ${u.firmId ? `'${u.firmId}'` : "NULL"}, NOW())`
        )
        .join(",\n");

      await db.execute(sql.raw(`
        INSERT INTO legacy_users (id, legacy_user_id, legacy_org_id, legacy_org_name, first_name, last_name, email, title, legacy_roles, firm_id, created_at)
        VALUES ${values}
        ON CONFLICT (id) DO NOTHING
      `));

      inserted += batch.length;
    }

    return NextResponse.json({
      success: true,
      totalLegacyUsers: legacyUsers.length,
      alreadyImported: skippedDupe,
      inserted,
      matchedToFirm: matched,
      unmatchedToFirm: unmatched,
      serviceFirmsInDb: firms.length,
    });
  } catch (error) {
    console.error("[Admin] Legacy user import error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Import failed", detail: message },
      { status: 500 }
    );
  }
}
