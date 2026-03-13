import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, members, organizations, subscriptions } from "@/lib/db/schema";
import { eq, ilike, or, sql, desc, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function checkSuperadmin() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  if (!session?.user || (session.user as { role?: string }).role !== "superadmin") return null;
  return session;
}

/**
 * GET /api/admin/customers?page=1&limit=100&search=foo
 *
 * Server-side paginated list of customer users (role = "user").
 * Joins org info for each user.
 */
export async function GET(req: NextRequest) {
  if (!await checkSuperadmin()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") ?? "100", 10)));
  const search = searchParams.get("search")?.trim() ?? "";
  const offset = (page - 1) * limit;

  // Build where clause: only "user" role + optional search
  const roleCondition = eq(users.role, "user");
  const searchCondition = search
    ? or(
        ilike(users.name, `%${search}%`),
        ilike(users.email, `%${search}%`),
      )
    : undefined;

  const whereClause = searchCondition
    ? and(roleCondition, searchCondition)
    : roleCondition;

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(whereClause);
  const total = countResult[0]?.count ?? 0;

  // Get paginated users with org info via left join
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      banned: users.banned,
      createdAt: users.createdAt,
      orgId: organizations.id,
      orgName: organizations.name,
      orgSlug: organizations.slug,
      plan: subscriptions.plan,
    })
    .from(users)
    .leftJoin(members, eq(members.userId, users.id))
    .leftJoin(organizations, eq(organizations.id, members.organizationId))
    .leftJoin(subscriptions, eq(subscriptions.organizationId, organizations.id))
    .where(whereClause)
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(offset);

  const customerUsers = rows.map((r) => ({
    id: r.id,
    name: r.name ?? "",
    email: r.email,
    role: r.role ?? "user",
    banned: r.banned ?? false,
    createdAt: r.createdAt?.toISOString() ?? "",
    orgName: r.orgName ?? undefined,
    orgSlug: r.orgSlug ?? undefined,
    orgPlan: r.plan ?? undefined,
  }));

  return NextResponse.json({
    users: customerUsers,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}
