import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { randomUUID } from "crypto";

/**
 * POST /api/admin/import/migrate-legacy-users
 *
 * Migrates legacy_users records into the standard Better Auth users + members tables.
 * After migration, legacy data is treated the same as any other user.
 *
 * Strategy:
 *   1. For each legacy_user with a firm_id:
 *      - Find the service_firm → organization_id
 *      - Check if a user with this email already exists
 *      - If no: create a new user record (unverified, no password)
 *      - Add them as a member of the organization (role: "member")
 *   2. Mark migrated legacy_users with a migrated_at timestamp
 *   3. Once all are migrated, the legacy_users table can be dropped
 *
 * Query params:
 *   dryRun=true — preview changes without executing (default: true)
 */
export async function POST(req: NextRequest) {
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
  const dryRun = url.searchParams.get("dryRun") !== "false";

  try {
    // 1. Load all legacy users with their firm → org mapping
    const legacyResult = await db.execute(sql`
      SELECT
        lu.id,
        lu.first_name AS "firstName",
        lu.last_name AS "lastName",
        lu.email,
        lu.title,
        lu.legacy_roles AS "legacyRoles",
        lu.firm_id AS "firmId",
        lu.legacy_user_id AS "legacyUserId",
        sf.organization_id AS "orgId",
        sf.name AS "firmName"
      FROM legacy_users lu
      LEFT JOIN service_firms sf ON sf.id = lu.firm_id
      WHERE lu.migrated_at IS NULL
      ORDER BY lu.email ASC
    `);

    const legacyUsers = legacyResult.rows as {
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string | null;
      title: string | null;
      legacyRoles: string[];
      firmId: string | null;
      legacyUserId: string;
      orgId: string | null;
      firmName: string | null;
    }[];

    // 2. Load existing users by email for dedup
    const existingUsersResult = await db.execute(sql`
      SELECT id, email FROM users WHERE email IS NOT NULL
    `);
    const existingByEmail = new Map(
      existingUsersResult.rows.map((r) => [(r.email as string).toLowerCase(), r.id as string])
    );

    // 3. Load existing memberships to avoid duplicates
    const existingMembersResult = await db.execute(sql`
      SELECT user_id AS "userId", organization_id AS "orgId" FROM members
    `);
    const membershipKeys = new Set(
      existingMembersResult.rows.map((r) => `${r.userId}::${r.orgId}`)
    );

    // 4. Plan the migration
    let usersToCreate = 0;
    let membershipsToCreate = 0;
    let skippedNoEmail = 0;
    let skippedNoOrg = 0;
    let existingUserLinked = 0;
    let alreadyMember = 0;

    interface MigrationAction {
      legacyId: string;
      email: string;
      name: string;
      orgId: string;
      action: "create_user_and_member" | "link_existing_user" | "already_member";
      existingUserId?: string;
    }

    const actions: MigrationAction[] = [];
    const skipped: { email: string | null; reason: string }[] = [];

    for (const lu of legacyUsers) {
      // Skip users without email — can't create a user without one
      if (!lu.email) {
        skippedNoEmail++;
        skipped.push({ email: null, reason: "no_email" });
        continue;
      }

      // Skip users not linked to a firm with an org
      if (!lu.firmId || !lu.orgId) {
        skippedNoOrg++;
        skipped.push({ email: lu.email, reason: "no_org" });
        continue;
      }

      const emailLower = lu.email.toLowerCase();
      const name = [lu.firstName, lu.lastName].filter(Boolean).join(" ") || lu.email.split("@")[0];
      const existingUserId = existingByEmail.get(emailLower);

      if (existingUserId) {
        // User already exists — just need membership
        const key = `${existingUserId}::${lu.orgId}`;
        if (membershipKeys.has(key)) {
          alreadyMember++;
          actions.push({
            legacyId: lu.id,
            email: lu.email,
            name,
            orgId: lu.orgId,
            action: "already_member",
            existingUserId,
          });
        } else {
          existingUserLinked++;
          membershipsToCreate++;
          actions.push({
            legacyId: lu.id,
            email: lu.email,
            name,
            orgId: lu.orgId,
            action: "link_existing_user",
            existingUserId,
          });
        }
      } else {
        // Need to create new user + membership
        usersToCreate++;
        membershipsToCreate++;
        actions.push({
          legacyId: lu.id,
          email: lu.email,
          name,
          orgId: lu.orgId,
          action: "create_user_and_member",
        });
      }
    }

    if (dryRun) {
      // Show sample actions
      const sampleActions = actions.slice(0, 30).map((a) => ({
        email: a.email,
        name: a.name,
        action: a.action,
        orgId: a.orgId,
      }));

      return NextResponse.json({
        dryRun: true,
        totalLegacyUsers: legacyUsers.length,
        usersToCreate,
        membershipsToCreate,
        existingUsersToLink: existingUserLinked,
        alreadyMembers: alreadyMember,
        skippedNoEmail,
        skippedNoOrg,
        sampleActions,
        skippedSample: skipped.slice(0, 20),
      });
    }

    // ── EXECUTE MIGRATION ──

    let createdUsers = 0;
    let createdMemberships = 0;
    let migrated = 0;
    const errors: { email: string; error: string }[] = [];

    // Process in batches
    const BATCH = 50;
    for (let i = 0; i < actions.length; i += BATCH) {
      const batch = actions.slice(i, i + BATCH);

      for (const action of batch) {
        try {
          let userId: string;

          if (action.action === "already_member") {
            // Just mark as migrated
            await db.execute(sql`
              UPDATE legacy_users SET migrated_at = NOW() WHERE id = ${action.legacyId}
            `);
            migrated++;
            continue;
          }

          if (action.action === "create_user_and_member") {
            // Create new user record
            userId = randomUUID();
            const now = new Date().toISOString();

            await db.execute(sql`
              INSERT INTO users (id, name, email, email_verified, created_at, updated_at, role)
              VALUES (${userId}, ${action.name}, ${action.email}, false, ${now}, ${now}, 'user')
              ON CONFLICT (email) DO NOTHING
            `);

            // Check if insert succeeded (might have raced with another process)
            const checkResult = await db.execute(sql`
              SELECT id FROM users WHERE email = ${action.email}
            `);
            userId = (checkResult.rows[0]?.id as string) ?? userId;

            createdUsers++;

            // Also add to existingByEmail so subsequent same-email legacy users don't create dupes
            existingByEmail.set(action.email.toLowerCase(), userId);
          } else {
            // link_existing_user
            userId = action.existingUserId!;
          }

          // Create membership
          const memberKey = `${userId}::${action.orgId}`;
          if (!membershipKeys.has(memberKey)) {
            const memberId = randomUUID();
            const now = new Date().toISOString();

            await db.execute(sql`
              INSERT INTO members (id, organization_id, user_id, role, created_at)
              VALUES (${memberId}, ${action.orgId}, ${userId}, 'member', ${now})
              ON CONFLICT DO NOTHING
            `);

            membershipKeys.add(memberKey);
            createdMemberships++;
          }

          // Mark legacy record as migrated
          await db.execute(sql`
            UPDATE legacy_users SET migrated_at = NOW() WHERE id = ${action.legacyId}
          `);
          migrated++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push({ email: action.email, error: msg });
        }
      }
    }

    // Also mark skipped records as migrated (no email / no org — nothing to do)
    for (const lu of legacyUsers) {
      if (!lu.email || !lu.firmId || !lu.orgId) {
        try {
          await db.execute(sql`
            UPDATE legacy_users SET migrated_at = NOW() WHERE id = ${lu.id}
          `);
        } catch { /* ignore */ }
      }
    }

    return NextResponse.json({
      success: true,
      totalProcessed: legacyUsers.length,
      usersCreated: createdUsers,
      membershipsCreated: createdMemberships,
      alreadyMembers: alreadyMember,
      migrated,
      skippedNoEmail,
      skippedNoOrg,
      errors: errors.slice(0, 20),
      errorCount: errors.length,
    });
  } catch (error) {
    console.error("[Admin] Legacy migration error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "Migration failed", detail: message }, { status: 500 });
  }
}
