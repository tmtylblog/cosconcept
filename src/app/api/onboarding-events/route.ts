import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { logOnboardingEvent } from "@/lib/onboarding/event-logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/onboarding-events
 *
 * Ingestion endpoint for client-side onboarding events.
 * Works for both authenticated users and guests (userId/orgId will be null for guests).
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { stage, event, domain, metadata } = body;

    if (!stage || !event) {
      return NextResponse.json({ error: "stage and event required" }, { status: 400 });
    }

    // Try to resolve user/org from session (best-effort, guests won't have one)
    let userId: string | null = null;
    let organizationId: string | null = null;
    try {
      const session = await auth.api.getSession({ headers: await headers() });
      userId = session?.user?.id ?? null;
      // Get active org from session if available
      if (session?.session) {
        organizationId = (session.session as Record<string, unknown>).activeOrganizationId as string ?? null;
      }
    } catch {
      // Guest user — no session
    }

    await logOnboardingEvent({
      userId,
      organizationId,
      stage,
      event,
      domain: domain ?? null,
      metadata: metadata ?? null,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[OnboardingEvents] Ingestion error:", error);
    return NextResponse.json({ ok: true }); // Still return OK — don't break the client
  }
}
