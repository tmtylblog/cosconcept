/**
 * POST /api/experts/[id]/specialist-profiles/generate-description
 *
 * AI-generates a specialist profile description based on:
 * - Specialist title
 * - Three work examples
 * - Expert's bio (hidden context)
 */

import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { expertProfiles } from "@/lib/db/schema";
import { generateSpDescription } from "@/lib/ai/generate-sp-description";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { title, examples } = body;

  if (!title || !examples?.length) {
    return Response.json({ error: "Title and examples are required" }, { status: 400 });
  }

  // Fetch expert for bio context
  const [expert] = await db
    .select({
      bio: expertProfiles.bio,
      fullName: expertProfiles.fullName,
      firstName: expertProfiles.firstName,
      lastName: expertProfiles.lastName,
      pdlData: expertProfiles.pdlData,
    })
    .from(expertProfiles)
    .where(eq(expertProfiles.id, id))
    .limit(1);

  const pdlData = expert?.pdlData as Record<string, unknown> | null;
  const bio = (expert?.bio as string) || (pdlData?.summary as string) || undefined;
  const name = expert?.fullName ?? [expert?.firstName, expert?.lastName].filter(Boolean).join(" ") ?? undefined;

  const description = await generateSpDescription({
    specialistTitle: title,
    examples,
    expertBio: bio,
    expertName: name,
  });

  if (!description) {
    return Response.json({ error: "Generation failed" }, { status: 500 });
  }

  return Response.json({ description });
}
