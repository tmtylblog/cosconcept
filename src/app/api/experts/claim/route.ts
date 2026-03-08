/**
 * GET /api/experts/claim?token=...&id=...
 *
 * Validates a claim token and links the current user's account
 * to the expert profile. Redirects to the edit page on success.
 *
 * Flow:
 *   1. Expert receives invite email with signed link
 *   2. They click → this endpoint validates the token
 *   3. If not signed in → redirect to sign-in with returnUrl
 *   4. If signed in → link userId to expertProfile → redirect to /experts/[id]/edit
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq, and, gt } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { expertProfiles, verifications } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  const expertId = searchParams.get("id");

  if (!token || !expertId) {
    redirect("/dashboard?error=invalid-claim-link");
  }

  // Validate token
  const identifier = `expert-claim:${expertId}`;
  const [verification] = await db
    .select()
    .from(verifications)
    .where(
      and(
        eq(verifications.identifier, identifier),
        eq(verifications.value, token),
        gt(verifications.expiresAt, new Date())
      )
    )
    .limit(1);

  if (!verification) {
    redirect("/dashboard?error=expired-claim-link");
  }

  // Check if user is signed in
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    // Redirect to sign-in, come back here after
    const returnUrl = encodeURIComponent(`/api/experts/claim?token=${token}&id=${expertId}`);
    redirect(`/sign-in?returnUrl=${returnUrl}`);
  }

  // Load expert profile
  const [expert] = await db
    .select({ id: expertProfiles.id, userId: expertProfiles.userId })
    .from(expertProfiles)
    .where(eq(expertProfiles.id, expertId))
    .limit(1);

  if (!expert) {
    redirect("/dashboard?error=expert-not-found");
  }

  // If already claimed by someone else, error
  if (expert.userId && expert.userId !== session.user.id) {
    redirect("/dashboard?error=profile-already-claimed");
  }

  // Link the userId
  await db
    .update(expertProfiles)
    .set({ userId: session.user.id, updatedAt: new Date() })
    .where(eq(expertProfiles.id, expertId));

  // Consume the token
  await db
    .delete(verifications)
    .where(eq(verifications.identifier, identifier));

  redirect(`/experts/${expertId}/edit?claimed=1`);
}
