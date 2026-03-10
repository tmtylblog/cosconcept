import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { serviceFirms, partnerPreferences, members } from "@/lib/db/schema";

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

    // Get partner preferences
    let prefs: Record<string, unknown> = {};
    if (firm?.id) {
      const [pref] = await db
        .select()
        .from(partnerPreferences)
        .where(eq(partnerPreferences.firmId, firm.id))
        .limit(1);

      if (pref) {
        const rawData = (pref.rawOnboardingData as Record<string, unknown>) || {};
        prefs = {
          preferredPartnerTypes: pref.preferredFirmTypes,
          preferredPartnerSize: pref.preferredSizeBands,
          requiredPartnerIndustries: pref.preferredIndustries,
          preferredPartnerLocations: pref.preferredMarkets,
          partnershipModels: pref.partnershipModels,
          dealBreakers: pref.dealBreakers,
          growthGoals: pref.growthGoals,
          // Fields from rawOnboardingData
          desiredPartnerServices: rawData.desiredPartnerServices,
          idealPartnerClientSize: rawData.idealPartnerClientSize,
          idealProjectSize: rawData.idealProjectSize,
          typicalHourlyRates: rawData.typicalHourlyRates,
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
