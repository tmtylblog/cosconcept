import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

/**
 * PATCH /api/admin/organizations/[orgId]/plan
 * Update an organization's subscription plan.
 * Body: { plan: "free" | "pro" | "enterprise" }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  // Verify superadmin role
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user || session.user.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orgId } = await params;
  const body = await req.json();
  const plan = body.plan;

  if (!["free", "pro", "enterprise"].includes(plan)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  try {
    await db
      .update(subscriptions)
      .set({ plan, updatedAt: new Date() })
      .where(eq(subscriptions.organizationId, orgId));

    return NextResponse.json({ success: true, plan });
  } catch (error) {
    console.error("[Admin] Plan update error:", error);
    return NextResponse.json(
      { error: "Failed to update plan" },
      { status: 500 }
    );
  }
}
