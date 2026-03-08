import { db } from "@/lib/db";
import { onboardingEvents } from "@/lib/db/schema";

function uid(): string {
  return `obe_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface LogOnboardingEventParams {
  userId?: string | null;
  organizationId?: string | null;
  firmId?: string | null;
  stage: string;
  event: string;
  domain?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Server-side: insert an onboarding event directly into the DB. Fire-and-forget. */
export async function logOnboardingEvent(
  params: LogOnboardingEventParams
): Promise<void> {
  try {
    await db.insert(onboardingEvents).values({
      id: uid(),
      userId: params.userId ?? null,
      organizationId: params.organizationId ?? null,
      firmId: params.firmId ?? null,
      domain: params.domain ?? null,
      stage: params.stage,
      event: params.event,
      metadata: params.metadata ?? null,
    });
  } catch (err) {
    // Never let logging break the user flow
    console.error("[OnboardingLogger] Failed to log:", err);
  }
}
