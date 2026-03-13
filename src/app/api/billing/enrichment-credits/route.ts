/**
 * GET /api/billing/enrichment-credits
 *
 * Returns the current org's enrichment credit balance and recent transactions.
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
  getOrCreateCreditBalance,
  getTransactions,
} from "@/lib/billing/enrichment-credits";

export const dynamic = "force-dynamic";

export async function GET() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = session.session.activeOrganizationId;
  if (!orgId) {
    return NextResponse.json({ error: "No active organization" }, { status: 400 });
  }

  const balance = await getOrCreateCreditBalance(orgId);
  const transactions = await getTransactions(orgId, 20);

  return NextResponse.json({
    totalCredits: balance.totalCredits,
    usedCredits: balance.usedCredits,
    availableCredits: balance.totalCredits - balance.usedCredits,
    freeAutoUsed: balance.freeAutoUsed,
    proCreditsGranted: balance.proCreditsGranted,
    transactions,
  });
}
