import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { inngest } from "@/inngest/client";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/run-migration
 * Body: { job: "client-nodes-to-company" | "partnership-prefs-to-edges" }
 *
 * Triggers one-time Neo4j migration jobs via Inngest.
 * Superadmin only.
 */
export async function POST(req: NextRequest) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user || session.user.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { job } = await req.json();

  const eventMap: Record<string, string> = {
    "client-nodes-to-company": "migration/client-nodes-to-company",
    "partnership-prefs-to-edges": "migration/partnership-prefs-to-edges",
  };

  const eventName = eventMap[job];
  if (!eventName) {
    return NextResponse.json({ error: `Unknown job: ${job}` }, { status: 400 });
  }

  await inngest.send({ name: eventName as never, data: {} });

  return NextResponse.json({ ok: true, triggered: eventName });
}
