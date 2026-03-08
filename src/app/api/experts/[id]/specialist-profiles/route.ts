/**
 * GET  /api/experts/[id]/specialist-profiles    — list profiles for expert
 * POST /api/experts/[id]/specialist-profiles    — create new specialist profile
 */

import { headers } from "next/headers";
import { eq } from "drizzle-orm";
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

async function authorizeExpert(expertId: string, userId: string) {
  const [expert] = await db
    .select()
    .from(expertProfiles)
    .where(eq(expertProfiles.id, expertId))
    .limit(1);

  if (!expert) return { error: "Not found", status: 404 as const };

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

  return { expert };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const authResult = await authorizeExpert(id, session.user.id);
  if ("error" in authResult) return Response.json({ error: authResult.error }, { status: authResult.status });

  const sps = await db
    .select()
    .from(specialistProfiles)
    .where(eq(specialistProfiles.expertProfileId, id));

  // Load examples for each sp
  const enriched = await Promise.all(
    sps.map(async (sp) => {
      const examples = await db
        .select()
        .from(specialistProfileExamples)
        .where(eq(specialistProfileExamples.specialistProfileId, sp.id));
      return {
        ...sp,
        examples: examples.sort((a, b) => a.position - b.position),
      };
    })
  );

  return Response.json({
    specialistProfiles: enriched.sort((a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0)),
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const authResult = await authorizeExpert(id, session.user.id);
  if ("error" in authResult) return Response.json({ error: authResult.error }, { status: authResult.status });

  const { expert } = authResult;
  const body = await req.json();

  const { title, bodyDescription, skills, industries, services, source, examples = [] } = body;

  // Compute quality score
  const scored = scoreSpecialistProfile({
    title,
    bodyDescription,
    industries: industries ?? [],
    examples,
  });

  const spId = generateId("sp");
  const isSearchable = scored.score >= 80;
  const autoPublish = scored.score >= 80;

  // Check if any existing strong profiles exist — if so, we'll handle isPrimary below
  const existing = await db
    .select({ id: specialistProfiles.id, qualityScore: specialistProfiles.qualityScore })
    .from(specialistProfiles)
    .where(eq(specialistProfiles.expertProfileId, id));

  const bestExistingScore = existing.reduce((max, s) => Math.max(max, s.qualityScore ?? 0), 0);
  const isPrimary = scored.score > bestExistingScore;

  // If this becomes primary, demote others
  if (isPrimary && existing.length > 0) {
    await db
      .update(specialistProfiles)
      .set({ isPrimary: false })
      .where(eq(specialistProfiles.expertProfileId, id));
  }

  await db.insert(specialistProfiles).values({
    id: spId,
    expertProfileId: id,
    firmId: expert.firmId,
    title: title ?? null,
    bodyDescription: bodyDescription ?? null,
    skills: skills ?? [],
    industries: industries ?? [],
    services: services ?? [],
    qualityScore: scored.score,
    qualityStatus: scored.status,
    source: source ?? "user_created",
    isSearchable,
    isPrimary,
    status: autoPublish ? "published" : "draft",
  });

  // Insert examples
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

  const [created] = await db
    .select()
    .from(specialistProfiles)
    .where(eq(specialistProfiles.id, spId))
    .limit(1);

  return Response.json(
    { specialistProfile: created, score: scored },
    { status: 201 }
  );
}
