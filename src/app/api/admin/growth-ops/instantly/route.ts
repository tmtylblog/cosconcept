import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { InstantlyClient } from "@/lib/growth-ops/InstantlyClient";

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
    if (action === "listCampaigns") {
      const data = await InstantlyClient.listCampaigns();
      return NextResponse.json(data);
    }
    if (action === "getCampaign") {
      const id = req.nextUrl.searchParams.get("id") ?? "";
      const data = await InstantlyClient.getCampaign(id);
      return NextResponse.json(data);
    }
    if (action === "listAccounts") {
      const data = await InstantlyClient.listEmailAccounts();
      return NextResponse.json(data);
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json() as { action: string; [key: string]: unknown };
  try {
    if (body.action === "getAnalytics") {
      const data = await InstantlyClient.getCampaignAnalytics(body.campaignIds as string[]);
      return NextResponse.json(data);
    }
    if (body.action === "listLeads") {
      const data = await InstantlyClient.listCampaignLeads(body.campaignId as string);
      return NextResponse.json(data);
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
