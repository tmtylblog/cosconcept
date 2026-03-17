/**
 * POST /api/admin/data-quality/delete
 *
 * Queues org deletion as an Inngest background job to avoid Vercel timeout.
 * The actual deletion happens in the delete-organization Inngest function.
 *
 * Body: { orgIds: string[] }
 * Returns immediately with { queued: true }
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { inngest } from "@/inngest/client";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const orgIds: string[] = body.orgIds;

  if (!orgIds || !Array.isArray(orgIds) || orgIds.length === 0) {
    return NextResponse.json({ error: "orgIds array required" }, { status: 400 });
  }

  if (orgIds.length > 50) {
    return NextResponse.json({ error: "Max 50 organizations per request" }, { status: 400 });
  }

  // Queue each deletion as a separate Inngest event
  const events = orgIds.map((orgId) => ({
    name: "admin/delete-organization" as const,
    data: { orgId },
  }));

  await inngest.send(events);

  return NextResponse.json({
    ok: true,
    queued: orgIds.length,
    message: `Queued ${orgIds.length} organization(s) for deletion. Processing in background.`,
  });
}
