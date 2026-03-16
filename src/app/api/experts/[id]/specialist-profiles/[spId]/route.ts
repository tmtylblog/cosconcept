/**
 * GET    /api/experts/[id]/specialist-profiles/[spId]  — fetch one
 * PUT    /api/experts/[id]/specialist-profiles/[spId]  — update
 * DELETE /api/experts/[id]/specialist-profiles/[spId]  — delete
 */

import { headers } from "next/headers";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  expertProfiles,
  specialistProfiles,
  specialistProfileExamples,
  serviceFirms,
  members,
} from "@/lib/db/schema";
import { scoreSpecialistProfile } from "@/lib/expert/quality-score";

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const dynamic = "force-dynamic";

async function authorize(expertId: string, spId: string, userId: string, userRole?: string) {
  const [sp] = await db
    .select()
    .from(specialistProfiles)
    .where(
      and(
        eq(specialistProfiles.id, spId),
        eq(specialistProfiles.expertProfileId, expertId)
      )
    )
    .limit(1);

  if (!sp) return { error: "Not found", status: 404 as const };

  const [expert] = await db
    .select()
    .from(expertProfiles)
    .where(eq(expertProfiles.id, expertId))
    .limit(1);

  if (!expert) return { error: "Expert not found", status: 404 as const };

  // Superadmins bypass org membership check
  if (userRole === "superadmin" || userRole === "admin") return { sp, expert };

  const [firm] = await db
    .select({ organizationId: serviceFirms.organizationId })
    .from(serviceFirms)
    .where(eq(serviceFirms.id, expert.firmId))
    .limit(1);

  if (!firm) return { error: "Firm not found", status: 404 as const };

  const [membership] = await db
    .select({ id: members.id })
    .from(members)
    .where(eq(members.organizationId, firm.organizationId))
    .limit(1);

  const isOwner = expert.userId === userId;
  if (!membership && !isOwner) return { error: "Forbidden", status: 403 as const };

  return { sp, expert };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; spId: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id, spId } = await params;
  const authResult = await authorize(id, spId, session.user.id, session.user.role);
  if ("error" in authResult) return Response.json({ error: authResult.error }, { status: authResult.status });

  const examples = await db
    .select()
    .from(specialistProfileExamples)
    .where(eq(specialistProfileExamples.specialistProfileId, spId));

  return Response.json({
    specialistProfile: {
      ...authResult.sp,
      examples: examples.sort((a, b) => a.position - b.position),
    },
  });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; spId: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id, spId } = await params;
  const authResult = await authorize(id, spId, session.user.id, session.user.role);
  if ("error" in authResult) return Response.json({ error: authResult.error }, { status: authResult.status });

  const body = await req.json();
  const { title, bodyDescription, skills, industries, services, examples = [] } = body;

  // Recompute quality score
  const scored = scoreSpecialistProfile({
    title,
    bodyDescription,
    industries: industries ?? [],
    examples,
  });

  const isSearchable = scored.score >= 80;
  const autoPublish = scored.score >= 80;

  // Update the profile
  await db
    .update(specialistProfiles)
    .set({
      title: title ?? null,
      bodyDescription: bodyDescription ?? null,
      skills: skills ?? [],
      industries: industries ?? [],
      services: services ?? [],
      qualityScore: scored.score,
      qualityStatus: scored.status,
      isSearchable,
      status: autoPublish ? "published" : "draft",
      updatedAt: new Date(),
    })
    .where(eq(specialistProfiles.id, spId));

  // Rebuild isPrimary across all profiles for this expert
  const allSps = await db
    .select({ id: specialistProfiles.id, qualityScore: specialistProfiles.qualityScore })
    .from(specialistProfiles)
    .where(eq(specialistProfiles.expertProfileId, id));

  const maxScore = allSps.reduce((max, s) => Math.max(max, s.qualityScore ?? 0), 0);
  const primaryId = allSps.find((s) => (s.qualityScore ?? 0) === maxScore)?.id;

  for (const s of allSps) {
    await db
      .update(specialistProfiles)
      .set({ isPrimary: s.id === primaryId })
      .where(eq(specialistProfiles.id, s.id));
  }

  // Sync examples: delete existing then re-insert
  await db
    .delete(specialistProfileExamples)
    .where(eq(specialistProfileExamples.specialistProfileId, spId));

  if (examples.length > 0) {
    await db.insert(specialistProfileExamples).values(
      examples.slice(0, 3).map(
        (
          ex: {
            title?: string;
            subject?: string;
            companyName?: string;
            companyIndustry?: string;
            startDate?: string;
            endDate?: string;
            isCurrent?: boolean;
            isPdlSource?: boolean;
            pdlExperienceIndex?: number;
            exampleType?: "project" | "role";
          },
          i: number
        ) => ({
          id: generateId("ex"),
          specialistProfileId: spId,
          exampleType: (ex.exampleType ?? "project") as "project" | "role",
          title: ex.title ?? null,
          subject: ex.subject ?? null,
          companyName: ex.companyName ?? null,
          companyIndustry: ex.companyIndustry ?? null,
          startDate: ex.startDate ?? null,
          endDate: ex.endDate ?? null,
          isCurrent: ex.isCurrent ?? false,
          isPdlSource: ex.isPdlSource ?? false,
          pdlExperienceIndex: ex.pdlExperienceIndex ?? null,
          position: i + 1,
        })
      )
    );
  }

  return Response.json({ ok: true, score: scored });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; spId: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id, spId } = await params;
  const authResult = await authorize(id, spId, session.user.id, session.user.role);
  if ("error" in authResult) return Response.json({ error: authResult.error }, { status: authResult.status });

  await db
    .delete(specialistProfiles)
    .where(eq(specialistProfiles.id, spId));

  // Recalculate isPrimary for remaining profiles
  const remaining = await db
    .select({ id: specialistProfiles.id, qualityScore: specialistProfiles.qualityScore })
    .from(specialistProfiles)
    .where(eq(specialistProfiles.expertProfileId, id));

  if (remaining.length > 0) {
    const maxScore = remaining.reduce((max, s) => Math.max(max, s.qualityScore ?? 0), 0);
    const primaryId = remaining.find((s) => (s.qualityScore ?? 0) === maxScore)?.id;
    for (const s of remaining) {
      await db
        .update(specialistProfiles)
        .set({ isPrimary: s.id === primaryId })
        .where(eq(specialistProfiles.id, s.id));
    }
  }

  return Response.json({ ok: true });
}
