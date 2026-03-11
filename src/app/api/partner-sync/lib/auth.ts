/**
 * Partner Sync API — Authentication Helper
 *
 * Validates x-api-key and x-partner-id headers on all partner-sync requests.
 */

import { NextResponse } from "next/server";

const ALLOWED_PARTNERS = new Set(["chameleon-collective"]);

export interface PartnerAuth {
  valid: true;
  partnerId: string;
}

/**
 * Authenticate a partner-sync request.
 * Returns the validated partnerId or a NextResponse error.
 */
export function authenticatePartner(
  req: Request
): PartnerAuth | NextResponse {
  const apiKey = req.headers.get("x-api-key");
  const partnerId = req.headers.get("x-partner-id");

  const expectedKey = process.env.PARTNER_SYNC_API_KEY;

  if (!expectedKey) {
    console.error("[Partner Sync] PARTNER_SYNC_API_KEY not configured");
    return NextResponse.json(
      { error: "Partner sync not configured" },
      { status: 503 }
    );
  }

  if (!apiKey || apiKey !== expectedKey) {
    return NextResponse.json(
      { error: "Invalid or missing API key" },
      { status: 401 }
    );
  }

  if (!partnerId || !ALLOWED_PARTNERS.has(partnerId)) {
    return NextResponse.json(
      { error: `Unrecognized partner: ${partnerId}` },
      { status: 403 }
    );
  }

  return { valid: true, partnerId };
}
