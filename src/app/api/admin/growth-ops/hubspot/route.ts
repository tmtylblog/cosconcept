import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { HubSpotClient } from "@/lib/growth-ops/HubSpotClient";
import { handleHubSpotSync } from "@/lib/jobs/handlers/hubspot-sync";

export const dynamic = "force-dynamic";

async function checkAdmin() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  if (!session?.user || session.user.role !== "superadmin") return null;
  return session;
}

export async function GET(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const action = req.nextUrl.searchParams.get("action");
  try {
    if (action === "listPipelines") {
      const data = await HubSpotClient.listPipelines();
      return NextResponse.json(data);
    }
    if (action === "getAllDeals") {
      const pipelineId = req.nextUrl.searchParams.get("pipelineId") ?? "";
      const deals = await HubSpotClient.getAllDeals(pipelineId);
      return NextResponse.json({ deals });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json() as { action: string; dealId?: string; stageId?: string };
  try {
    if (body.action === "updateDealStage") {
      const data = await HubSpotClient.updateDealStage(body.dealId!, body.stageId!);
      return NextResponse.json(data);
    }
    if (body.action === "runSync") {
      const result = await handleHubSpotSync({});
      return NextResponse.json(result);
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
