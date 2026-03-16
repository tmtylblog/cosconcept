/**
 * POST /api/experts/[id]/work-history
 *
 * Appends a custom work example to the expert's pdlData.experience array.
 * This makes it available in "Select from Work History" picker next time.
 */

import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { expertProfiles, serviceFirms, members } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Auth: must be the expert, an org member, or a superadmin
  const [expert] = await db
    .select()
    .from(expertProfiles)
    .where(eq(expertProfiles.id, id))
    .limit(1);

  if (!expert) return Response.json({ error: "Not found" }, { status: 404 });

  const isSuperadmin = session.user.role === "superadmin" || session.user.role === "admin";
  const isOwner = expert.userId === session.user.id;

  if (!isSuperadmin && !isOwner) {
    // Check org membership
    const [firm] = await db
      .select({ organizationId: serviceFirms.organizationId })
      .from(serviceFirms)
      .where(eq(serviceFirms.id, expert.firmId))
      .limit(1);

    if (!firm) return Response.json({ error: "Firm not found" }, { status: 404 });

    const [membership] = await db
      .select({ id: members.id })
      .from(members)
      .where(eq(members.organizationId, firm.organizationId))
      .limit(1);

    if (!membership) return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { title, companyName, companyIndustry, startDate, endDate, isCurrent, subject } = body;

  if (!title || !companyName) {
    return Response.json({ error: "Title and company name are required" }, { status: 400 });
  }

  // Append to pdlData.experience
  const currentPdlData = (expert.pdlData ?? {}) as Record<string, unknown>;
  const currentExperience = Array.isArray(currentPdlData.experience)
    ? (currentPdlData.experience as unknown[])
    : [];

  const newEntry = {
    company: {
      name: companyName,
      industry: companyIndustry || null,
    },
    title,
    startDate: startDate || null,
    endDate: endDate || null,
    isCurrent: isCurrent ?? false,
    summary: subject || null,
    source: "user_added",
  };

  const updatedPdlData = {
    ...currentPdlData,
    experience: [...currentExperience, newEntry],
  };

  await db
    .update(expertProfiles)
    .set({
      pdlData: updatedPdlData,
      updatedAt: new Date(),
    })
    .where(eq(expertProfiles.id, id));

  return Response.json({ ok: true, experienceCount: currentExperience.length + 1 });
}
