/**
 * GET /api/settings/network/connect/[provider]
 *
 * Initiates OAuth flow for Gmail (google) or Outlook (microsoft) network scanning.
 * Separate from Better Auth login — uses different scopes, stores tokens independently.
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { createHmac, randomBytes } from "crypto";

export const dynamic = "force-dynamic";

const PROVIDER_CONFIG = {
  google: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    scopes: "https://www.googleapis.com/auth/gmail.metadata",
    clientId: process.env.GOOGLE_CLIENT_ID!,
  },
  microsoft: {
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    scopes: "Mail.ReadBasic offline_access",
    clientId: process.env.MICROSOFT_CLIENT_ID!,
  },
} as const;

type Provider = keyof typeof PROVIDER_CONFIG;

function signState(payload: string): string {
  const secret = process.env.NETWORK_SCAN_STATE_SECRET ?? "dev-secret-change-me";
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", process.env.BETTER_AUTH_URL));
  }

  const { provider } = await params;
  if (!(provider in PROVIDER_CONFIG)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }

  const config = PROVIDER_CONFIG[provider as Provider];
  const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const redirectUri = `${baseUrl}/api/settings/network/callback/${provider}`;

  // Build CSRF state: nonce + userId, signed with HMAC
  const nonce = randomBytes(16).toString("hex");
  const statePayload = `${nonce}:${session.user.id}`;
  const sig = signState(statePayload);
  const state = `${statePayload}:${sig}`;

  const authUrl = new URL(config.authUrl);
  authUrl.searchParams.set("client_id", config.clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", config.scopes);
  authUrl.searchParams.set("state", Buffer.from(state).toString("base64url"));
  authUrl.searchParams.set("access_type", "offline"); // Google: get refresh token
  authUrl.searchParams.set("prompt", "consent"); // Google: always show consent to ensure refresh token

  const response = NextResponse.redirect(authUrl.toString());

  // Store state in cookie for callback verification
  response.cookies.set("network_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes
  });

  return response;
}
