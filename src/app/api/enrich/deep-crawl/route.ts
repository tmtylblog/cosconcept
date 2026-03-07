/**
 * POST /api/enrich/deep-crawl
 *
 * Trigger a deep website crawl for a firm.
 * Can be called manually by admin or auto-triggered on signup.
 *
 * This queues an Inngest job for background processing.
 */

import { NextRequest, NextResponse } from "next/server";
import { inngest } from "@/inngest/client";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { firmId, organizationId, website, firmName } = body;

    if (!firmId || !website || !firmName) {
      return NextResponse.json(
        { error: "firmId, website, and firmName are required" },
        { status: 400 }
      );
    }

    // Queue the deep crawl via Inngest
    await inngest.send({
      name: "enrich/deep-crawl",
      data: {
        firmId,
        organizationId: organizationId ?? firmId,
        website,
        firmName,
      },
    });

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
