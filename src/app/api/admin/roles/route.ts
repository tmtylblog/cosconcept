import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { adminRoles, users } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { BUILT_IN_ROLES } from "@/lib/admin/permissions";

export const dynamic = "force-dynamic";

async function checkSuperadmin() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  if (!session?.user || (session.user as { role?: string }).role !== "superadmin") return null;
  return session;
}

// GET /api/admin/roles — list all roles with member counts
export async function GET() {
  if (!await checkSuperadmin()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Ensure built-in roles exist (idempotent upsert)
  await seedBuiltInRoles();

  const roles = await db
    .select({
      id: adminRoles.id,
      slug: adminRoles.slug,
      name: adminRoles.name,
      description: adminRoles.description,
      icon: adminRoles.icon,
      color: adminRoles.color,
      permissions: adminRoles.permissions,
      isBuiltIn: adminRoles.isBuiltIn,
      createdAt: adminRoles.createdAt,
      memberCount: sql<number>`(SELECT COUNT(*) FROM users WHERE users.role = ${adminRoles.slug})::int`,
    })
    .from(adminRoles)
    .orderBy(adminRoles.createdAt);

  return NextResponse.json({ roles });
}

// POST /api/admin/roles — create a custom role
export async function POST(req: NextRequest) {
  if (!await checkSuperadmin()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as {
    name: string;
    slug: string;
    description?: string;
    icon?: string;
    color?: string;
    permissions: string[];
  };

  if (!body.name || !body.slug || !body.permissions) {
    return NextResponse.json({ error: "name, slug, and permissions are required" }, { status: 400 });
  }

  // Validate slug format
  if (!/^[a-z][a-z0-9_]*$/.test(body.slug)) {
    return NextResponse.json({ error: "Slug must be lowercase alphanumeric with underscores" }, { status: 400 });
  }

  // Check uniqueness
  const existing = await db.select({ id: adminRoles.id }).from(adminRoles).where(eq(adminRoles.slug, body.slug)).limit(1);
  if (existing.length > 0) {
    return NextResponse.json({ error: "A role with this slug already exists" }, { status: 409 });
  }

  const id = `role_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  await db.insert(adminRoles).values({
    id,
    slug: body.slug,
    name: body.name,
    description: body.description || null,
    icon: body.icon || null,
    color: body.color || null,
    permissions: body.permissions,
    isBuiltIn: false,
  });

  return NextResponse.json({ id, slug: body.slug, message: "Role created" });
}

// PATCH /api/admin/roles — update a role
export async function PATCH(req: NextRequest) {
  if (!await checkSuperadmin()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as {
    id: string;
    name?: string;
    description?: string;
    icon?: string;
    color?: string;
    permissions?: string[];
  };

  if (!body.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const existing = await db.select().from(adminRoles).where(eq(adminRoles.id, body.id)).limit(1);
  if (existing.length === 0) {
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  }

  const role = existing[0];

  // Superadmin role always has all permissions
  if (role.slug === "superadmin" && body.permissions) {
    return NextResponse.json({ error: "Cannot modify superadmin permissions" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.icon !== undefined) updates.icon = body.icon;
  if (body.color !== undefined) updates.color = body.color;
  if (body.permissions !== undefined) updates.permissions = body.permissions;

  await db.update(adminRoles).set(updates).where(eq(adminRoles.id, body.id));

  return NextResponse.json({ message: "Role updated" });
}

// DELETE /api/admin/roles — delete a custom role
export async function DELETE(req: NextRequest) {
  if (!await checkSuperadmin()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const reassignTo = searchParams.get("reassignTo") ?? "user";

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const existing = await db.select().from(adminRoles).where(eq(adminRoles.id, id)).limit(1);
  if (existing.length === 0) {
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  }

  if (existing[0].isBuiltIn) {
    return NextResponse.json({ error: "Cannot delete built-in roles" }, { status: 400 });
  }

  // Reassign users with this role
  await db.update(users).set({ role: reassignTo }).where(eq(users.role, existing[0].slug));

  // Delete the role
  await db.delete(adminRoles).where(eq(adminRoles.id, id));

  return NextResponse.json({ message: "Role deleted" });
}

/** Ensure built-in roles exist in the database */
async function seedBuiltInRoles() {
  for (const role of BUILT_IN_ROLES) {
    const existing = await db.select({ id: adminRoles.id }).from(adminRoles).where(eq(adminRoles.slug, role.slug)).limit(1);
    if (existing.length === 0) {
      await db.insert(adminRoles).values({
        id: role.id,
        slug: role.slug,
        name: role.name,
        description: role.description,
        icon: role.icon,
        color: role.color,
        permissions: role.permissions as unknown as string[],
        isBuiltIn: role.isBuiltIn,
      });
    }
  }
}
