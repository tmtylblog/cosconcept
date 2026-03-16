/**
 * POST /api/experts/[id]/normalize-bio
 *
 * Normalizes an expert's bio to third person, paragraph form.
 * Reads current bio or pdlData.summary, normalizes via AI, saves back.
 */

import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { expertProfiles } from "@/lib/db/schema";
import { normalizeBio } from "@/lib/ai/normalize-bio";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [expert] = await db
    .select()
    .from(expertProfiles)
    .where(eq(expertProfiles.id, id))
    .limit(1);

  if (!expert) return Response.json({ error: "Not found" }, { status: 404 });

  const pdlData = expert.pdlData as Record<string, unknown> | null;
  const rawBio = (expert.bio as string) || (pdlData?.summary as string) || "";

  if (!rawBio || rawBio.length < 20) {
    return Response.json({ error: "No bio available to normalize" }, { status: 400 });
  }

  const fullName = expert.fullName ?? [expert.firstName, expert.lastName].filter(Boolean).join(" ") ?? "Unknown";

  const normalized = await normalizeBio({
    rawBio,
    fullName,
    title: expert.title ?? undefined,
  });

  // Save back
  await db
    .update(expertProfiles)
    .set({ bio: normalized, updatedAt: new Date() })
    .where(eq(expertProfiles.id, id));

  return Response.json({ bio: normalized });
}
