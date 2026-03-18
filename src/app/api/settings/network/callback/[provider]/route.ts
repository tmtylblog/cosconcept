/**
 * GET /api/settings/network/callback/[provider]
 *
 * OAuth callback for Gmail/Outlook network scanning.
 * Exchanges code for tokens, stores in network_connections table.
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { networkConnections } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { createHmac } from "crypto";

export const dynamic = "force-dynamic";

type Provider = "google" | "microsoft";

const TOKEN_ENDPOINTS: Record<Provider, string> = {
  google: "https://oauth2.googleapis.com/token",
  microsoft: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
};

function verifyState(state: string): boolean {
  const secret = process.env.NETWORK_SCAN_STATE_SECRET ?? "dev-secret-change-me";
  const parts = state.split(":");
  if (parts.length < 3) return false;
  const sig = parts.pop()!;
  const payload = parts.join(":");
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  return sig === expected;
}

async function getProviderEmail(provider: Provider, accessToken: string): Promise<string | null> {
  try {
    if (provider === "google") {
      const res = await fetch("https://www.googleapis.com/oauth2/v1/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return null;
      const data = await res.json() as { email?: string };
      return data.email ?? null;
    } else {
      const res = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return null;
      const data = await res.json() as { mail?: string; userPrincipalName?: string };
      return data.mail ?? data.userPrincipalName ?? null;
    }
  } catch {
    return null;
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

  if (!session?.user) {
    return NextResponse.redirect(`${baseUrl}/login`);
  }

  const { provider } = await params;
  if (provider !== "google" && provider !== "microsoft") {
    return NextResponse.redirect(`${baseUrl}/settings/network?error=unknown_provider`);
  }

  const code = req.nextUrl.searchParams.get("code");
  const stateParam = req.nextUrl.searchParams.get("state");
  const cookieState = req.cookies.get("network_oauth_state")?.value;

  if (!code || !stateParam || !cookieState) {
    return NextResponse.redirect(`${baseUrl}/settings/network?error=missing_params`);
  }

  // Decode and verify state
  let decodedState: string;
  try {
    decodedState = Buffer.from(stateParam, "base64url").toString();
  } catch {
    return NextResponse.redirect(`${baseUrl}/settings/network?error=invalid_state`);
  }

  if (decodedState !== cookieState || !verifyState(decodedState)) {
    return NextResponse.redirect(`${baseUrl}/settings/network?error=state_mismatch`);
  }

  // Exchange code for tokens
  const redirectUri = `${baseUrl}/api/settings/network/callback/${provider}`;
  const clientId = provider === "google"
    ? (process.env.NETWORK_GOOGLE_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID)!
    : process.env.NETWORK_MICROSOFT_CLIENT_ID!;
  const clientSecret = provider === "google"
    ? (process.env.NETWORK_GOOGLE_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET)!
    : process.env.NETWORK_MICROSOFT_CLIENT_SECRET!;

  const tokenRes = await fetch(TOKEN_ENDPOINTS[provider], {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!tokenRes.ok) {
    console.error(`[NetworkScan] Token exchange failed for ${provider}:`, await tokenRes.text());
    return NextResponse.redirect(`${baseUrl}/settings/network?error=token_exchange`);
  }

  const tokenData = await tokenRes.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };

  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + tokenData.expires_in * 1000)
    : null;

  // Get the email address for the connected account
  const providerEmail = await getProviderEmail(provider, tokenData.access_token);

  // Get current org from session
  const [member] = await db
    .select({ organizationId: (await import("@/lib/db/schema")).members.organizationId })
    .from((await import("@/lib/db/schema")).members)
    .where(eq((await import("@/lib/db/schema")).members.userId, session.user.id))
    .limit(1);

  const organizationId = member?.organizationId ?? "";

  // Upsert network connection
  const existing = await db
    .select({ id: networkConnections.id })
    .from(networkConnections)
    .where(
      and(
        eq(networkConnections.userId, session.user.id),
        eq(networkConnections.provider, provider)
      )
    )
    .limit(1);

  const now = new Date();

  if (existing[0]) {
    // Update existing connection
    await db
      .update(networkConnections)
      .set({
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token ?? null,
        expiresAt: expiresAt,
        scope: tokenData.scope ?? null,
        providerEmail,
        scanStatus: "idle",
        scanError: null,
        updatedAt: now,
      })
      .where(eq(networkConnections.id, existing[0].id));
  } else {
    // Insert new connection
    const id = `nc_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
    await db
      .insert(networkConnections)
      .values({
        id,
        userId: session.user.id,
        organizationId,
        provider,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token ?? null,
        expiresAt: expiresAt,
        scope: tokenData.scope ?? null,
        providerEmail,
        scanStatus: "idle",
        createdAt: now,
        updatedAt: now,
      });
  }

  const response = NextResponse.redirect(`${baseUrl}/settings/network?connected=${provider}`);
  // Clear state cookie
  response.cookies.set("network_oauth_state", "", { maxAge: 0, path: "/" });
  return response;
}
