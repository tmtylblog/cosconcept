import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { serviceFirms, members } from "@/lib/db/schema";
import { readAllPreferences } from "@/lib/profile/update-profile-field";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { searchParams } = new URL(req.url);
  let organizationId = searchParams.get("organizationId");

  // Server-side fallback: resolve org from user's membership if not provided
  if (!organizationId && session.user.id) {
    try {
      const [membership] = await db
        .select({ orgId: members.organizationId })
        .from(members)
        .where(eq(members.userId, session.user.id))
        .limit(1);
      if (membership) {
        organizationId = membership.orgId;
      }
    } catch {
      // Non-critical
    }
  }

  if (!organizationId) {
    // No org found — return empty profile
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Get confirmed data from serviceFirms.enrichmentData.confirmed
    const [firm] = await db
      .select({
        id: serviceFirms.id,
        enrichmentData: serviceFirms.enrichmentData,
      })
      .from(serviceFirms)
      .where(eq(serviceFirms.organizationId, organizationId))
      .limit(1);

    const enrichmentData = (firm?.enrichmentData as Record<string, unknown>) || {};
    const confirmed = (enrichmentData.confirmed as Record<string, unknown>) || {};

    // Get partner preferences (reads from JSONB with legacy column fallback)
    let prefs: Record<string, string | string[]> = {};
    if (firm?.id) {
      prefs = await readAllPreferences(firm.id);
    }

    // Merge confirmed firm data + partner preferences
    const profile = {
      ...confirmed,
      ...Object.fromEntries(
        Object.entries(prefs).filter(([, v]) => v != null)
      ),
    };

    return new Response(JSON.stringify(profile), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[Profile API] Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
