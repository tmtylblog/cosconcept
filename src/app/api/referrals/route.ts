/**
 * Referral Tracking API
 *
 * GET  /api/referrals — List referrals for user's firm
 * POST /api/referrals — Create a new referral
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { referrals, serviceFirms } from "@/lib/db/schema";
import { eq, or, desc } from "drizzle-orm";
import type { CreateReferralInput } from "@/types/partnerships";

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * GET — List referrals for a firm (given + received).
 * Query: ?firmId=xxx
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const firmId = url.searchParams.get("firmId");

  if (!firmId) {
    return NextResponse.json({ error: "firmId is required" }, { status: 400 });
  }

  const allReferrals = await db
    .select()
    .from(referrals)
    .where(
      or(
        eq(referrals.referringFirmId, firmId),
        eq(referrals.receivingFirmId, firmId)
      )
    )
    .orderBy(desc(referrals.createdAt));

  // Enrich with firm names
  const enriched = await Promise.all(
    allReferrals.map(async (ref) => {
      const [referringFirm, receivingFirm] = await Promise.all([
        db.query.serviceFirms.findFirst({
          where: eq(serviceFirms.id, ref.referringFirmId),
          columns: { id: true, name: true },
        }),
        db.query.serviceFirms.findFirst({
          where: eq(serviceFirms.id, ref.receivingFirmId),
          columns: { id: true, name: true },
        }),
      ]);

      return {
        ...ref,
        referringFirm: referringFirm ?? { id: ref.referringFirmId, name: "Unknown" },
        receivingFirm: receivingFirm ?? { id: ref.receivingFirmId, name: "Unknown" },
        direction: ref.referringFirmId === firmId ? "given" : "received",
      };
    })
  );

  // Compute summary stats
  const given = enriched.filter((r) => r.direction === "given");
  const received = enriched.filter((r) => r.direction === "received");

  const parseValue = (v: string | null): number => {
    if (!v) return 0;
    const match = v.match(/(\d[\d,]*)/);
    return match ? parseInt(match[1].replace(/,/g, ""), 10) : 0;
  };

  const stats = {
    totalGiven: given.length,
    totalReceived: received.length,
    convertedGiven: given.filter((r) => r.status === "converted").length,
    convertedReceived: received.filter((r) => r.status === "converted").length,
    estimatedValueGiven: given.reduce((sum, r) => sum + parseValue(r.estimatedValue), 0),
    estimatedValueReceived: received.reduce((sum, r) => sum + parseValue(r.estimatedValue), 0),
    actualValueConverted: enriched
      .filter((r) => r.status === "converted")
      .reduce((sum, r) => sum + parseValue(r.actualValue), 0),
  };

  return NextResponse.json({ referrals: enriched, stats });
}

/**
 * POST — Create a new referral.
 * Body: { firmId, receivingFirmId, partnershipId?, opportunityId?, estimatedValue? }
 */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as CreateReferralInput & { firmId: string };
  const { firmId, receivingFirmId, partnershipId, opportunityId, estimatedValue } = body;

  if (!firmId || !receivingFirmId) {
    return NextResponse.json(
      { error: "firmId and receivingFirmId are required" },
      { status: 400 }
    );
  }

  const refId = generateId("ref");

  await db.insert(referrals).values({
    id: refId,
    referringFirmId: firmId,
    receivingFirmId,
    partnershipId: partnershipId ?? null,
    opportunityId: opportunityId ?? null,
    estimatedValue: estimatedValue ?? null,
    status: "pending",
  });

  return NextResponse.json(
    { referral: { id: refId, status: "pending" } },
    { status: 201 }
  );
}
