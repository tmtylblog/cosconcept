/**
 * GET /api/settings/network/status
 *
 * Returns current connection status for both providers + relationship results.
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { networkConnections, networkRelationships } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connections = await db
    .select({
      id: networkConnections.id,
      provider: networkConnections.provider,
      providerEmail: networkConnections.providerEmail,
      lastScanAt: networkConnections.lastScanAt,
      scanStatus: networkConnections.scanStatus,
      scanError: networkConnections.scanError,
      emailsProcessed: networkConnections.emailsProcessed,
    })
    .from(networkConnections)
    .where(eq(networkConnections.userId, session.user.id));

  const relationships = await db
    .select()
    .from(networkRelationships)
    .where(eq(networkRelationships.userId, session.user.id))
    .orderBy(desc(networkRelationships.strength));

  return NextResponse.json({ connections, relationships });
}
