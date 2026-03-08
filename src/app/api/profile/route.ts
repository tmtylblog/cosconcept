import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { serviceFirms, partnerPreferences } from "@/lib/db/schema";

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
  const organizationId = searchParams.get("organizationId");

  if (!organizationId) {
    return new Response(JSON.stringify({ error: "Missing organizationId" }), {
      status: 400,
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

    // Get partner preferences
    let prefs: Record<string, unknown> = {};
    if (firm?.id) {
      const [pref] = await db
        .select()
        .from(partnerPreferences)
        .where(eq(partnerPreferences.firmId, firm.id))
        .limit(1);

      if (pref) {
        prefs = {
          preferredPartnerTypes: pref.preferredFirmTypes,
          partnershipModels: pref.partnershipModels,
          dealBreakers: pref.dealBreakers,
          growthGoals: pref.growthGoals,
        };
      }
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
