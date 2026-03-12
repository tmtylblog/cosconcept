import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getNotificationPreferences, updateNotificationPreferences } from "@/lib/customerio";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.CUSTOMERIO_APP_API_KEY) {
    return NextResponse.json({
      preferences: { newMatches: true, partnershipUpdates: true, weeklyDigest: true, productUpdates: true },
      configured: false,
    });
  }

  const { preferences, exists } = await getNotificationPreferences(session.user.email);
  return NextResponse.json({ preferences, exists, configured: true });
}

export async function PATCH(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.CUSTOMERIO_APP_API_KEY) {
    return NextResponse.json({ ok: true, configured: false });
  }

  const body = await req.json();
  const result = await updateNotificationPreferences(session.user.email, body);
  return NextResponse.json(result);
}
