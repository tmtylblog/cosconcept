import { NextRequest, NextResponse } from "next/server";
import { getOrgUsage } from "@/lib/billing/usage-checker";

export const dynamic = "force-dynamic";

/**
 * GET /api/billing/usage?organizationId=xxx
 * Returns plan info and current usage for the org.
 */
export async function GET(req: NextRequest) {
  const organizationId = req.nextUrl.searchParams.get("organizationId");

  if (!organizationId) {
    return NextResponse.json(
      { error: "Missing organizationId" },
      { status: 400 }
    );
  }

  try {
    const data = await getOrgUsage(organizationId);
    return NextResponse.json(data);
  } catch (error) {
    console.error("[Billing] Usage fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch usage" },
      { status: 500 }
    );
  }
}
