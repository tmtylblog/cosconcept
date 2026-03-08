/** Client-side: POST an onboarding event to the ingestion API. Fire-and-forget. */
export function logOnboardingEventClient(params: {
  stage: string;
  event: string;
  domain?: string;
  metadata?: Record<string, unknown>;
}): void {
  try {
    fetch("/api/onboarding-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    }).catch(() => {
      // Best-effort, never block UI
    });
  } catch {
    // Ignore
  }
}
