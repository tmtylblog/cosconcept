/**
 * POST /api/settings/network/scan
 *
 * Enqueues a network-scan job for the given provider.
 * Body: { provider: "google" | "microsoft" }
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { networkConnections, members } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import { handleNetworkScan } from "@/lib/jobs/handlers/network-scan";

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

  const [connection] = await db
    .select()
    .from(networkConnections)
    .where(
      and(
        eq(networkConnections.userId, session.user.id),
        eq(networkConnections.provider, provider)
      )
    )
    .limit(1);

  if (!connection) {
    return NextResponse.json({ error: "Provider not connected" }, { status: 404 });
  }

  if (connection.scanStatus === "scanning") {
    return NextResponse.json({ error: "Scan already in progress" }, { status: 409 });
  }

  // Get org
  const [member] = await db
    .select({ organizationId: members.organizationId })
    .from(members)
    .where(eq(members.userId, session.user.id))
    .limit(1);

  const payload = {
    userId: session.user.id,
    organizationId: member?.organizationId ?? connection.organizationId,
    provider,
    connectionId: connection.id,
  };

  // Immediately mark as scanning so the UI updates
  await db
    .update(networkConnections)
    .set({ scanStatus: "scanning", updatedAt: new Date() })
    .where(eq(networkConnections.id, connection.id));

  // Run inline in dev (Inngest unreliable in local Next.js dev server).
  // In production, send to Inngest.
  if (process.env.NODE_ENV === "development") {
    handleNetworkScan(payload).catch((err) => {
      console.error("[NetworkScan] inline run failed:", err);
    });
    return NextResponse.json({ status: "scanning" });
  }

  const jobId = `netscan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  await inngest.send({ name: "network/scan", data: payload });
  return NextResponse.json({ jobId, status: "scanning" });
}
