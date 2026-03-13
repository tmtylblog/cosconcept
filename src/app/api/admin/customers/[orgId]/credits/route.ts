/**
 * POST /api/admin/customers/[orgId]/credits
 *
 * Admin-only: Grant enrichment credits to an organization.
 * Body: { amount: number, note?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { grantCredits, getOrCreateCreditBalance } from "@/lib/billing/enrichment-credits";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  // Admin auth
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user || !["admin", "superadmin"].includes(session.user.role ?? "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orgId } = await params;
  const body = await req.json().catch(() => ({}));
  const { amount, note } = body as { amount?: number; note?: string };

  if (!amount || typeof amount !== "number" || amount <= 0) {
    return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
  }

  if (amount > 1000) {
    return NextResponse.json({ error: "Maximum 1000 credits per grant" }, { status: 400 });
  }

  const result = await grantCredits(orgId, amount, "manual_grant", { note });

  return NextResponse.json({
    granted: amount,
    totalCredits: result.totalCredits,
    availableCredits: result.availableCredits,
    note: note || null,
  });
}

/**
 * GET /api/admin/customers/[orgId]/credits
 *
 * Admin-only: View credit balance and transactions for an org.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user || !["admin", "superadmin"].includes(session.user.role ?? "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orgId } = await params;

  const balance = await getOrCreateCreditBalance(orgId);
  const { getTransactions } = await import("@/lib/billing/enrichment-credits");
  const transactions = await getTransactions(orgId, 50);

  return NextResponse.json({
    totalCredits: balance.totalCredits,
    usedCredits: balance.usedCredits,
    availableCredits: balance.totalCredits - balance.usedCredits,
    freeAutoUsed: balance.freeAutoUsed,
    proCreditsGranted: balance.proCreditsGranted,
    transactions,
  });
}
