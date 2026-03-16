/**
 * GET /api/experts/[id]  — fetch a single expert profile
 * PUT /api/experts/[id]  — update expert overview fields
 */

import { headers } from "next/headers";
import { eq, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  expertProfiles,
  specialistProfiles,
  specialistProfileExamples,
  serviceFirms,
  members,
} from "@/lib/db/schema";

export const dynamic = "force-dynamic";

async function authorizeExpert(
  expertId: string,
  userId: string,
  userRole?: string
): Promise<{ expert: typeof expertProfiles.$inferSelect } | { error: string; status: number }> {
  const [expert] = await db
    .select()
    .from(expertProfiles)
    .where(eq(expertProfiles.id, expertId))
    .limit(1);

  if (!expert) return { error: "Not found", status: 404 };

  // Superadmins bypass org membership check
  if (userRole === "superadmin" || userRole === "admin") return { expert };

  // Must be org member OR the expert themselves
  const [firm] = await db
    .select({ organizationId: serviceFirms.organizationId })
    .from(serviceFirms)
    .where(eq(serviceFirms.id, expert.firmId))
    .limit(1);

  if (!firm) return { error: "Firm not found", status: 404 };

  const [membership] = await db
    .select({ id: members.id })
    .from(members)
    .where(eq(members.organizationId, firm.organizationId))
    .limit(1);

  const isOwner = expert.userId === userId;
  if (!membership && !isOwner) return { error: "Forbidden", status: 403 };

  return { expert };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const authResult = await authorizeExpert(id, session.user.id, session.user.role);
  if ("error" in authResult) return Response.json({ error: authResult.error }, { status: authResult.status });

  const { expert } = authResult;

  // Load specialist profiles
  const sps = await db
    .select()
    .from(specialistProfiles)
    .where(eq(specialistProfiles.expertProfileId, id));

  // Load all examples for all specialist profiles in one query
  const exampleRows =
    sps.length > 0
      ? await db
          .select()
          .from(specialistProfileExamples)
          .where(inArray(specialistProfileExamples.specialistProfileId, sps.map((s) => s.id)))
      : [];

  // Group examples by specialistProfileId
  const examplesBySp: Record<string, typeof exampleRows> = {};
  for (const ex of exampleRows) {
    if (!examplesBySp[ex.specialistProfileId]) examplesBySp[ex.specialistProfileId] = [];
    examplesBySp[ex.specialistProfileId].push(ex);
  }

  const enrichedSps = sps.map((sp) => ({
    ...sp,
    examples: (examplesBySp[sp.id] ?? []).sort((a, b) => a.position - b.position),
  }));

  return Response.json({
    expert,
    specialistProfiles: enrichedSps.sort((a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0)),
  });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const authResult = await authorizeExpert(id, session.user.id, session.user.role);
  if ("error" in authResult) return Response.json({ error: authResult.error }, { status: authResult.status });

  const body = await req.json();
  const allowedFields = [
    "firstName", "lastName", "fullName", "title", "headline",
    "bio", "location", "linkedinUrl", "photoUrl", "isPublic",
  ] as const;

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const field of allowedFields) {
    if (field in body) updates[field] = body[field];
  }

  await db
    .update(expertProfiles)
    .set(updates as Partial<typeof expertProfiles.$inferInsert>)
    .where(eq(expertProfiles.id, id));

  return Response.json({ ok: true });
}

/**
 * PATCH /api/experts/[id] — Admin-only: link/unlink userId
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "superadmin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();

  const [expert] = await db
    .select({ id: expertProfiles.id })
    .from(expertProfiles)
    .where(eq(expertProfiles.id, id))
    .limit(1);

  if (!expert) return Response.json({ error: "Not found" }, { status: 404 });

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if ("userId" in body) updates.userId = body.userId || null;

  await db
    .update(expertProfiles)
    .set(updates as Partial<typeof expertProfiles.$inferInsert>)
    .where(eq(expertProfiles.id, id));

  return Response.json({ ok: true });
}
