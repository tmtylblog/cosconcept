import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getCioCampaigns, getCioWorkspaceMessages } from "@/lib/customerio";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["superadmin", "customer_success"];

export async function GET() {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user || !ALLOWED_ROLES.includes(session.user.role ?? "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.CUSTOMERIO_APP_API_KEY) {
    return NextResponse.json({ configured: false, campaigns: [], messages: [] });
  }

  const [campaigns, messages] = await Promise.all([
    getCioCampaigns(),
    getCioWorkspaceMessages(50),
  ]);

  return NextResponse.json({ configured: true, campaigns, messages });
}
