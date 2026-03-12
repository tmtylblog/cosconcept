/**
 * POST /api/enrich/deep-crawl
 *
 * Trigger a deep website crawl for a firm.
 * Can be called manually by admin or auto-triggered on onboarding completion.
 *
 * Accepts EITHER:
 * - { firmId, website, firmName, organizationId? } — explicit params
 * - { organizationId } — resolves firmId/website/firmName from DB
 *
 * This queues an Inngest job for background processing.
 */

import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { after } from "next/server";
import { auth } from "@/lib/auth";
import { enqueue } from "@/lib/jobs/queue";
import { runNextJob } from "@/lib/jobs/runner";
import { db } from "@/lib/db";
import { serviceFirms } from "@/lib/db/schema";

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    let { firmId, website, firmName } = body;
    const { organizationId } = body;

    // If only organizationId provided, resolve the rest from DB
    if (!firmId && organizationId) {
      const [firm] = await db
        .select({
          id: serviceFirms.id,
          name: serviceFirms.name,
          website: serviceFirms.website,
          enrichmentData: serviceFirms.enrichmentData,
        })
        .from(serviceFirms)
        .where(eq(serviceFirms.organizationId, organizationId))
        .limit(1);

      if (!firm) {
        return NextResponse.json(
          { error: "Firm not found for this organization" },
          { status: 404 }
        );
      }

      firmId = firm.id;
      firmName = firmName || firm.name;

      // Resolve website: from firm record, or from enrichment data
      if (!website) {
        website = firm.website;
        if (!website) {
          const enrichment = firm.enrichmentData as Record<string, unknown> | null;
          website = enrichment?.domain as string | undefined;
        }
      }
    }

    if (!firmId || !website || !firmName) {
      return NextResponse.json(
        { error: "Could not resolve firmId, website, or firmName. Provide them explicitly or ensure the firm record has a website." },
        { status: 400 }
      );
    }

    // Queue the deep crawl
    await enqueue("deep-crawl", {
      firmId,
      organizationId: organizationId ?? firmId,
      website,
      firmName,
    });
    after(runNextJob().catch(() => {}));

    return NextResponse.json({
      status: "queued",
      message: `Deep crawl queued for ${firmName} (${website})`,
      firmId,
    });
  } catch (err) {
    console.error("[DeepCrawl API] Error:", err);
    return NextResponse.json(
      { error: "Failed to queue deep crawl" },
      { status: 500 }
    );
  }
}
