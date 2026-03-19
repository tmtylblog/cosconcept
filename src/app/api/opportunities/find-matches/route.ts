/**
 * POST /api/opportunities/find-matches
 *
 * Given a list of opportunity IDs and a search scope, returns matching
 * specialist profiles (expertise) and specialist profile examples (case studies)
 * from the firm's own team and/or accepted partner firms.
 *
 * Scope:
 *   "own"      — search this firm's own profiles only
 *   "partners" — search accepted partner firms only
 *   "both"     — search own + partners
 */

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { serviceFirms, members } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { findOpportunityMatches } from "@/lib/matching/opportunity-matcher";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { opportunityIds, scope, organizationId } = (await req.json()) as {
    opportunityIds: string[];
    scope: "own" | "partners" | "both";
    organizationId?: string;
  };

  if (!opportunityIds?.length) {
    return new Response(JSON.stringify({ error: "No opportunity IDs provided" }), { status: 400 });
  }

  // Resolve firm
  let firmId: string | null = null;
  const orgId = organizationId ?? (await db
    .select({ orgId: members.organizationId })
    .from(members)
    .where(eq(members.userId, session.user.id))
    .limit(1)
    .then((r) => r[0]?.orgId ?? null));

  if (orgId) {
    const firm = await db
      .select({ id: serviceFirms.id })
      .from(serviceFirms)
      .where(eq(serviceFirms.organizationId, orgId))
      .limit(1);
    firmId = firm[0]?.id ?? null;
  }

  if (!firmId) {
    return new Response(JSON.stringify({ error: "No firm found" }), { status: 400 });
  }

  const matches = await findOpportunityMatches(opportunityIds, firmId, scope);

  return Response.json({ matches, scope, firmId });
}
