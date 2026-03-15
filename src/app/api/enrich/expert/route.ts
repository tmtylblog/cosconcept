/**
 * POST /api/enrich/expert
 *
 * Trigger expert enrichment (PDL lookup + specialist profile generation).
 * Accepts: name + company, LinkedIn URL, or email.
 */

import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { inngest } from "@/inngest/client";

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { firmId, fullName, linkedinUrl, companyName, companyWebsite, email } =
      body;

    if (!firmId || !fullName) {
      return NextResponse.json(
        { error: "firmId and fullName are required" },
        { status: 400 }
      );
    }

    const expertId =
      body.expertId ??
      `${firmId}:${fullName.toLowerCase().replace(/\s+/g, "-")}`;

    await inngest.send({
      name: "enrich/expert-linkedin",
      data: {
        expertId,
        firmId,
        fullName,
        linkedinUrl,
        email,
        companyName,
        companyWebsite,
      },
    });

    return NextResponse.json({
      status: "queued",
      message: `Expert enrichment queued for ${fullName}`,
      expertId,
    });
  } catch (err) {
    console.error("[Expert API] Error:", err);
    return NextResponse.json(
      { error: "Failed to queue expert enrichment" },
      { status: 500 }
    );
  }
}
