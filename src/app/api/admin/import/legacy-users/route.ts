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
 * to existing service_firms by email domain → firm website domain.
 * Falls back to org name match if no domain match found.
 *
 * Query params:
 *   dryRun=true — preview matches without inserting (default: false)
 *   rematch=true — re-match existing records that have no firm_id (or all if force=true)
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

/** Extract bare domain from a URL or email domain: "https://www.foo.com/bar" → "foo.com" */
function extractDomain(input: string): string | null {
  try {
    let host = input.trim().toLowerCase();
    // If it looks like a URL, parse it
    if (host.includes("://")) {
      host = new URL(host).hostname;
    } else if (host.includes("/")) {
      // e.g. "www.foo.com/bar"
      host = host.split("/")[0];
    }
    // Strip www. prefix
    host = host.replace(/^www\./, "");
    // Basic validation — must have at least one dot
    if (!host.includes(".")) return null;
    return host;
  } catch {
    return null;
  }
}

/** Extract domain from an email address */
function emailDomain(email: string): string | null {
  const at = email.indexOf("@");
  if (at < 0) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  if (!domain.includes(".")) return null;
  return domain;
}

// Common free email providers — users with these domains can't be matched by domain
const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com",
  "icloud.com", "mail.com", "protonmail.com", "zoho.com", "yandex.com",
  "live.com", "msn.com", "me.com", "mac.com", "comcast.net",
  "verizon.net", "att.net", "sbcglobal.net", "cox.net", "charter.net",
  "earthlink.net", "optonline.net", "frontier.com", "windstream.net",
  "googlemail.com", "pm.me", "proton.me", "tutanota.com",
]);

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
  const rematch = url.searchParams.get("rematch") === "true";

  try {
    // ── Re-match mode: update existing records with domain-based matching ──
    if (rematch) {
      return await handleRematch(dryRun);
    }

    // ── Normal import mode ──

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
      SELECT id, name, website, organization_id AS "organizationId"
      FROM service_firms
      ORDER BY name
    `);
    const firms = firmsResult.rows as {
      id: string;
      name: string;
      website: string | null;
      organizationId: string;
    }[];

    // Build domain → firm lookup (primary matching strategy)
    const firmByDomain = new Map<string, (typeof firms)[0]>();
    // Build name → firm lookup (fallback)
    const firmByNameLower = new Map<string, (typeof firms)[0]>();

    for (const firm of firms) {
      // Domain lookup from website
      if (firm.website) {
        const domain = extractDomain(firm.website);
        if (domain && !FREE_EMAIL_DOMAINS.has(domain)) {
          firmByDomain.set(domain, firm);
        }
      }
      // Name lookup
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
    let matchedByDomain = 0;
    let matchedByName = 0;
    let unmatched = 0;
    let skippedDupe = 0;
    let inserted = 0;
    const unmatchedOrgs = new Map<string, number>();
    const matchedOrgs = new Map<string, { count: number; method: string }>();
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

      // ── Match to service_firm: domain first, then name ──
      let firmId: string | null = null;
      let matchMethod: string | null = null;

      // Strategy 1: Match by email domain → firm website domain
      if (user.email) {
        const domain = emailDomain(user.email);
        if (domain && !FREE_EMAIL_DOMAINS.has(domain)) {
          const firmMatch = firmByDomain.get(domain);
          if (firmMatch) {
            firmId = firmMatch.id;
            matchMethod = "domain";
            matchedByDomain++;
          }
        }
      }

      // Strategy 2: Fall back to org name match
      if (!firmId && orgName) {
        const firmMatch = firmByNameLower.get(orgName.toLowerCase().trim());
        if (firmMatch) {
          firmId = firmMatch.id;
          matchMethod = "name";
          matchedByName++;
        }
      }

      if (firmId && matchMethod) {
        const label = orgName ?? user.email ?? "unknown";
        const existing = matchedOrgs.get(label);
        if (existing) {
          existing.count++;
        } else {
          matchedOrgs.set(label, { count: 1, method: matchMethod });
        }
      } else {
        unmatched++;
        if (orgName) {
          unmatchedOrgs.set(orgName, (unmatchedOrgs.get(orgName) ?? 0) + 1);
        }
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
      const topUnmatched = [...unmatchedOrgs.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([name, count]) => ({ name, count }));

      const topMatched = [...matchedOrgs.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 30)
        .map(([name, info]) => ({ name, count: info.count, method: info.method }));

      return NextResponse.json({
        dryRun: true,
        totalLegacyUsers: legacyUsers.length,
        alreadyImported: skippedDupe,
        toImport: toInsert.length,
        matchedByDomain: matchedByDomain,
        matchedByName: matchedByName,
        totalMatched: matchedByDomain + matchedByName,
        unmatchedToFirm: unmatched,
        serviceFirmsInDb: firms.length,
        firmsWithDomain: firmByDomain.size,
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
      matchedByDomain,
      matchedByName,
      totalMatched: matchedByDomain + matchedByName,
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

/**
 * Re-match existing legacy_users to service_firms using domain-based matching.
 * Updates firm_id on records that were previously unmatched (or all records).
 */
async function handleRematch(dryRun: boolean) {
  // Load all legacy users
  const usersResult = await db.execute(sql`
    SELECT id, email, legacy_org_name, firm_id
    FROM legacy_users
  `);
  const legacyUsers = usersResult.rows as {
    id: string;
    email: string | null;
    legacy_org_name: string | null;
    firm_id: string | null;
  }[];

  // Load all service_firms
  const firmsResult = await db.execute(sql`
    SELECT id, name, website
    FROM service_firms
    ORDER BY name
  `);
  const firms = firmsResult.rows as {
    id: string;
    name: string;
    website: string | null;
  }[];

  // Build lookups
  const firmByDomain = new Map<string, (typeof firms)[0]>();
  const firmByNameLower = new Map<string, (typeof firms)[0]>();

  for (const firm of firms) {
    if (firm.website) {
      const domain = extractDomain(firm.website);
      if (domain && !FREE_EMAIL_DOMAINS.has(domain)) {
        firmByDomain.set(domain, firm);
      }
    }
    firmByNameLower.set(firm.name.toLowerCase().trim(), firm);
  }

  // Process each legacy user
  let newDomainMatches = 0;
  let newNameMatches = 0;
  let alreadyMatched = 0;
  let stillUnmatched = 0;
  const updates: { id: string; firmId: string }[] = [];

  for (const user of legacyUsers) {
    // Try domain match
    let newFirmId: string | null = null;

    if (user.email) {
      const domain = emailDomain(user.email);
      if (domain && !FREE_EMAIL_DOMAINS.has(domain)) {
        const firmMatch = firmByDomain.get(domain);
        if (firmMatch) {
          newFirmId = firmMatch.id;
        }
      }
    }

    // Fallback: name match
    if (!newFirmId && user.legacy_org_name) {
      const firmMatch = firmByNameLower.get(user.legacy_org_name.toLowerCase().trim());
      if (firmMatch) {
        newFirmId = firmMatch.id;
      }
    }

    if (newFirmId) {
      if (user.firm_id === newFirmId) {
        alreadyMatched++;
      } else {
        // New match (or better match)
        if (user.firm_id) {
          // Had a different match before — still update to domain-based
          newDomainMatches++;
        } else {
          // Was unmatched, now matched
          if (user.email) {
            const domain = emailDomain(user.email);
            if (domain && !FREE_EMAIL_DOMAINS.has(domain) && firmByDomain.has(domain)) {
              newDomainMatches++;
            } else {
              newNameMatches++;
            }
          } else {
            newNameMatches++;
          }
        }
        updates.push({ id: user.id, firmId: newFirmId });
      }
    } else {
      if (user.firm_id) {
        alreadyMatched++; // Keep existing match
      } else {
        stillUnmatched++;
      }
    }
  }

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      rematch: true,
      totalLegacyUsers: legacyUsers.length,
      alreadyCorrectlyMatched: alreadyMatched,
      newMatchesFound: updates.length,
      newDomainMatches,
      newNameMatches,
      stillUnmatched,
      firmsWithDomain: firmByDomain.size,
    });
  }

  // Apply updates in batches
  let updated = 0;
  const BATCH = 50;
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    for (const u of batch) {
      await db.execute(sql`
        UPDATE legacy_users SET firm_id = ${u.firmId} WHERE id = ${u.id}
      `);
    }
    updated += batch.length;
  }

  return NextResponse.json({
    success: true,
    rematch: true,
    totalLegacyUsers: legacyUsers.length,
    alreadyCorrectlyMatched: alreadyMatched,
    updated,
    newDomainMatches,
    newNameMatches,
    stillUnmatched,
  });
}
