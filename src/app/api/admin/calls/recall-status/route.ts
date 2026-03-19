/**
 * GET /api/admin/calls/recall-status
 *
 * Health check for Recall.ai integration — verifies env vars are set
 * and optionally tests the API key by listing bots.
 */

import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user.role !== "superadmin") {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  const apiKeySet = !!process.env.RECALL_API_KEY;
  const webhookSecretSet = !!process.env.RECALL_WEBHOOK_SECRET;

  let apiReachable = false;

  if (apiKeySet) {
    try {
      const res = await fetch("https://us-west-2.recall.ai/api/v1/bot/?limit=1", {
        headers: { Authorization: `Token ${process.env.RECALL_API_KEY}` },
        signal: AbortSignal.timeout(5000),
      });
      apiReachable = res.ok;
    } catch {
      apiReachable = false;
    }
  }

  return Response.json({
    configured: apiKeySet && webhookSecretSet,
    apiKeySet,
    webhookSecretSet,
    apiReachable,
  });
}
