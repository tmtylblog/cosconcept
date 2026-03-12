/**
 * POST /api/experts/[id]/invite-link
 *
 * Generates a claim URL without sending an email.
 * Useful for admins who want to copy/paste the link.
 * Requires superadmin role.
 */

import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { expertProfiles } from "@/lib/db/schema";
import { generateClaimToken } from "@/lib/experts/invite-utils";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "superadmin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  // Load expert
  const [expert] = await db
    .select({ id: expertProfiles.id, userId: expertProfiles.userId, email: expertProfiles.email })
    .from(expertProfiles)
    .where(eq(expertProfiles.id, id))
    .limit(1);

  if (!expert) return Response.json({ error: "Expert not found" }, { status: 404 });
  if (expert.userId) return Response.json({ error: "Expert already claimed" }, { status: 409 });

  const { claimUrl, expiresAt } = await generateClaimToken(id);

  return Response.json({ claimUrl, expiresAt });
}
