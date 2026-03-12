import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

/**
 * POST /api/admin/organizations/merge
 *
 * Merges multiple organizations into one target org.
 * Reparents ALL child data (members, firms, conversations, etc.)
 * then deletes the now-empty source orgs.
 *
 * Body:
 *   targetOrgId: string — the org to keep (receives all data)
 *   sourceOrgIds: string[] — orgs to merge into target (will be deleted)
 *   newSlug?: string — optional new slug for the target org
 *   newName?: string — optional new name for the target org
 *   dryRun?: boolean — preview changes without executing (default: true)
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

  try {
    const body = await req.json();
    const {
      targetOrgId,
      sourceOrgIds,
      newSlug,
      newName,
      dryRun = true,
    } = body as {
      targetOrgId: string;
      sourceOrgIds: string[];
      newSlug?: string;
      newName?: string;
      dryRun?: boolean;
    };

    if (!targetOrgId || !sourceOrgIds?.length) {
      return NextResponse.json(
        { error: "targetOrgId and sourceOrgIds[] are required" },
        { status: 400 }
      );
    }

    // Make sure target isn't in sources
    const sources = sourceOrgIds.filter((id) => id !== targetOrgId);
    if (sources.length === 0) {
      return NextResponse.json(
        { error: "No source orgs to merge (all matched targetOrgId)" },
        { status: 400 }
      );
    }

    // Validate all orgs exist
    const allIds = [targetOrgId, ...sources];
    const orgsResult = await db.execute(sql`
      SELECT id, name, slug FROM organizations WHERE id = ANY(${allIds})
    `);
    const orgsMap = new Map(orgsResult.rows.map((r) => [r.id as string, r]));

    if (!orgsMap.has(targetOrgId)) {
      return NextResponse.json({ error: `Target org ${targetOrgId} not found` }, { status: 404 });
    }

    const missingSources = sources.filter((id) => !orgsMap.has(id));
    if (missingSources.length > 0) {
      return NextResponse.json(
        { error: `Source org(s) not found: ${missingSources.join(", ")}` },
        { status: 404 }
      );
    }

    // Audit: count what will be moved per table
    const audit: Record<string, number> = {};

    // All tables with organization_id that need reparenting
    const orgTables = [
      "members",
      "invitations",
      "subscriptions",
      "subscription_events",
      "service_firms",
      "conversations",
      "ai_usage_log",
      "onboarding_events",
      "memory_entries",
      "memory_themes",
    ];

    for (const table of orgTables) {
      try {
        const countResult = await db.execute(
          sql.raw(
            `SELECT COUNT(*)::int AS count FROM "${table}" WHERE "organization_id" = ANY($1::text[])`,
          ),
          // Drizzle raw SQL doesn't support $1, use a different approach
        );
        audit[table] = Number(countResult.rows[0]?.count ?? 0);
      } catch {
        // Table might not exist yet, skip
        audit[table] = -1;
      }
    }

    // Better approach: count each table individually
    const counts: Record<string, number> = {};

    for (const table of orgTables) {
      try {
        const result = await db.execute(
          sql`SELECT COUNT(*)::int AS count FROM ${sql.raw(`"${table}"`)} WHERE "organization_id" IN ${sql`(${sql.join(sources.map(s => sql`${s}`), sql`, `)})`}`
        );
        counts[table] = Number(result.rows[0]?.count ?? 0);
      } catch {
        counts[table] = -1; // table doesn't exist or error
      }
    }

    // Also count service_firms per source to audit firm-level data
    const sourceFirmsResult = await db.execute(
      sql`SELECT id, name, organization_id AS "orgId" FROM service_firms
          WHERE organization_id IN ${sql`(${sql.join(sources.map(s => sql`${s}`), sql`, `)})`}`
    );
    const sourceFirms = sourceFirmsResult.rows;

    // Count target's existing firms
    const targetFirmsResult = await db.execute(
      sql`SELECT id, name FROM service_firms WHERE organization_id = ${targetOrgId}`
    );

    // Count legacy_users linked to source firms
    const sourceFirmIds = sourceFirms.map((f) => f.id as string);
    let legacyUserCount = 0;
    if (sourceFirmIds.length > 0) {
      const luResult = await db.execute(
        sql`SELECT COUNT(*)::int AS count FROM legacy_users
            WHERE firm_id IN ${sql`(${sql.join(sourceFirmIds.map(id => sql`${id}`), sql`, `)})`}`
      );
      legacyUserCount = Number(luResult.rows[0]?.count ?? 0);
    }

    // Check for duplicate members (same user in both target and source)
    const dupMembersResult = await db.execute(
      sql`SELECT m1.user_id, m1.organization_id AS "sourceOrgId"
          FROM members m1
          WHERE m1.organization_id IN ${sql`(${sql.join(sources.map(s => sql`${s}`), sql`, `)})`}
            AND m1.user_id IN (
              SELECT user_id FROM members WHERE organization_id = ${targetOrgId}
            )`
    );
    const duplicateMembers = dupMembersResult.rows;

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        target: orgsMap.get(targetOrgId),
        sources: sources.map((id) => orgsMap.get(id)),
        newSlug: newSlug ?? null,
        newName: newName ?? null,
        recordsToMove: counts,
        sourceFirms: sourceFirms.map((f) => ({ id: f.id, name: f.name, orgId: f.orgId })),
        targetFirms: targetFirmsResult.rows.map((f) => ({ id: f.id, name: f.name })),
        legacyUsersLinkedToSourceFirms: legacyUserCount,
        duplicateMembers: duplicateMembers.length,
        duplicateMemberDetails: duplicateMembers,
        warning: duplicateMembers.length > 0
          ? "Some users are members of both source and target orgs. Source duplicates will be deleted."
          : null,
      });
    }

    // ── EXECUTE MERGE ──

    // Step 1: Remove duplicate members (users already in target)
    if (duplicateMembers.length > 0) {
      await db.execute(
        sql`DELETE FROM members
            WHERE organization_id IN ${sql`(${sql.join(sources.map(s => sql`${s}`), sql`, `)})`}
              AND user_id IN (
                SELECT user_id FROM members WHERE organization_id = ${targetOrgId}
              )`
      );
    }

    // Step 2: Reparent all org-level data
    let totalMoved = 0;
    for (const table of orgTables) {
      try {
        // For subscriptions, we need special handling — can't have duplicates
        if (table === "subscriptions") {
          // Delete source subscriptions (target keeps its own)
          await db.execute(
            sql`DELETE FROM ${sql.raw(`"${table}"`)}
                WHERE "organization_id" IN ${sql`(${sql.join(sources.map(s => sql`${s}`), sql`, `)})`}`
          );
          continue;
        }

        const result = await db.execute(
          sql`UPDATE ${sql.raw(`"${table}"`)}
              SET "organization_id" = ${targetOrgId}
              WHERE "organization_id" IN ${sql`(${sql.join(sources.map(s => sql`${s}`), sql`, `)})`}`
        );
        totalMoved += result.rowCount ?? 0;
      } catch {
        // Table might not exist — skip
      }
    }

    // Step 3: Update slug and name if requested
    if (newSlug || newName) {
      const updates: string[] = [];
      if (newSlug) updates.push(`"slug" = '${newSlug.replace(/'/g, "''")}'`);
      if (newName) updates.push(`"name" = '${newName.replace(/'/g, "''")}'`);
      await db.execute(
        sql.raw(`UPDATE "organizations" SET ${updates.join(", ")} WHERE "id" = '${targetOrgId}'`)
      );
    }

    // Step 4: Delete empty source orgs
    await db.execute(
      sql`DELETE FROM organizations
          WHERE id IN ${sql`(${sql.join(sources.map(s => sql`${s}`), sql`, `)})`}`
    );

    return NextResponse.json({
      success: true,
      target: { id: targetOrgId, slug: newSlug ?? orgsMap.get(targetOrgId)?.slug },
      sourcesDeleted: sources.length,
      totalRecordsMoved: totalMoved,
      duplicateMembersRemoved: duplicateMembers.length,
    });
  } catch (error) {
    console.error("[Admin] Org merge error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "Merge failed", detail: message }, { status: 500 });
  }
}
