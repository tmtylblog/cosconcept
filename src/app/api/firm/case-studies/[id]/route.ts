/**
 * DELETE /api/firm/case-studies/[id] — Soft-delete a case study
 */

import { headers } from "next/headers";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { firmCaseStudies, members } from "@/lib/db/schema";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Look up the case study
  const [cs] = await db
    .select({
      id: firmCaseStudies.id,
      firmId: firmCaseStudies.firmId,
      organizationId: firmCaseStudies.organizationId,
    })
    .from(firmCaseStudies)
    .where(eq(firmCaseStudies.id, id))
    .limit(1);

  if (!cs) {
    return Response.json({ error: "Case study not found" }, { status: 404 });
  }

  // Verify the user belongs to the firm's org
  const [membership] = await db
    .select({ id: members.id })
    .from(members)
    .where(
      and(
        eq(members.userId, session.user.id),
        eq(members.organizationId, cs.organizationId)
      )
    )
    .limit(1);

  if (!membership) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Soft-delete
  await db
    .update(firmCaseStudies)
    .set({ status: "deleted", updatedAt: new Date() })
    .where(eq(firmCaseStudies.id, id));

  return Response.json({ success: true });
}
