/**
 * POST /api/settings/network/disconnect
 *
 * Removes the OAuth connection and all scan results for a provider.
 * Body: { provider: "google" | "microsoft" }
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { networkConnections, networkRelationships } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { provider } = await req.json() as { provider?: string };
  if (provider !== "google" && provider !== "microsoft") {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }

  await db
    .delete(networkConnections)
    .where(
      and(
        eq(networkConnections.userId, session.user.id),
        eq(networkConnections.provider, provider)
      )
    );

  await db
    .delete(networkRelationships)
    .where(
      and(
        eq(networkRelationships.userId, session.user.id),
        eq(networkRelationships.provider, provider)
      )
    );

  return NextResponse.json({ ok: true });
}
