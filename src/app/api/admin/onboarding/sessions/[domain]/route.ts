import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  onboardingEvents,
  enrichmentAuditLog,
  serviceFirms,
  partnerPreferences,
} from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { readAllPreferences } from "@/lib/profile/update-profile-field";

/**
 * GET /api/admin/onboarding/sessions/[domain]
 *
 * [domain] is the URL-encoded domain string (e.g. "acme.com").
 *
 * Returns full onboarding session detail:
 * - All events from onboarding_events for this domain (ordered ASC)
 * - Enrichment audit log entries (if firmId resolved)
 * - Current firm enrichment snapshot (if firmId resolved)
 * - Interview answers / partner preferences (if firmId resolved)
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ domain: string }> }
) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user || session.user.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { domain: domainParam } = await params;
  const domain = decodeURIComponent(domainParam);

  // 1. Full event timeline from onboarding_events
  const rawEvents = await db
    .select()
    .from(onboardingEvents)
    .where(eq(onboardingEvents.domain, domain))
    .orderBy(asc(onboardingEvents.createdAt));

  if (rawEvents.length === 0) {
    return NextResponse.json({ error: "No onboarding events found for this domain" }, { status: 404 });
  }

  // 2. Resolve firmId from events (first non-null firmId)
  const resolvedFirmId = rawEvents.find((e) => e.firmId != null)?.firmId ?? null;
  const resolvedUserId = rawEvents.find((e) => e.userId != null)?.userId ?? null;
  const resolvedOrgId = rawEvents.find((e) => e.organizationId != null)?.organizationId ?? null;

  // 3. Look up firm data if firmId resolved
  let firm: typeof serviceFirms.$inferSelect | null = null;
  if (resolvedFirmId) {
    const [f] = await db
      .select()
      .from(serviceFirms)
      .where(eq(serviceFirms.id, resolvedFirmId))
      .limit(1);
    firm = f ?? null;
  }

  // 4. Enrichment audit
  const enrichmentAudit = resolvedFirmId
    ? await db
        .select({
          id: enrichmentAuditLog.id,
          phase: enrichmentAuditLog.phase,
          source: enrichmentAuditLog.source,
          status: enrichmentAuditLog.status,
          model: enrichmentAuditLog.model,
          costUsd: enrichmentAuditLog.costUsd,
          durationMs: enrichmentAuditLog.durationMs,
          confidence: enrichmentAuditLog.confidence,
          errorMessage: enrichmentAuditLog.errorMessage,
          extractedData: enrichmentAuditLog.extractedData,
          createdAt: enrichmentAuditLog.createdAt,
        })
        .from(enrichmentAuditLog)
        .where(eq(enrichmentAuditLog.firmId, resolvedFirmId))
        .orderBy(asc(enrichmentAuditLog.createdAt))
    : [];

  // 5. Partner preferences (merged from JSONB + legacy columns)
  const mergedPrefs = resolvedFirmId
    ? await readAllPreferences(resolvedFirmId)
    : {};
  // Also fetch raw row for admin debug visibility
  const [rawPrefRow] = resolvedFirmId
    ? await db
        .select()
        .from(partnerPreferences)
        .where(eq(partnerPreferences.firmId, resolvedFirmId))
        .limit(1)
    : [undefined];

  // 6. Build event timeline
  const events = rawEvents.map((e) => ({
    id: e.id,
    stage: e.stage,
    event: e.event,
    label: eventLabel(e.stage, e.event),
    metadata: (e.metadata as Record<string, unknown>) ?? null,
    createdAt: e.createdAt.toISOString(),
  }));

  const firstEventAt = events[0].createdAt;
  const lastEventAt = events[events.length - 1].createdAt;

  return NextResponse.json({
    domain,
    firmId: resolvedFirmId,
    userId: resolvedUserId,
    organizationId: resolvedOrgId ?? firm?.organizationId ?? null,
    firmName: firm?.name ?? null,
    enrichmentStatus: firm?.enrichmentStatus ?? null,
    isPlatformMember: firm?.isPlatformMember ?? false,
    firstEventAt,
    lastEventAt,

    events,

    enrichmentAudit: enrichmentAudit.map((e) => ({
      phase: e.phase,
      source: e.source,
      status: e.status,
      model: e.model,
      costUsd: e.costUsd,
      durationMs: e.durationMs,
      confidence: e.confidence,
      errorMessage: e.errorMessage,
      extractedData: e.extractedData,
      createdAt: e.createdAt.toISOString(),
    })),

    enrichmentData: (firm?.enrichmentData as Record<string, unknown>) ?? null,

    // Merged preferences (JSONB-first with legacy column fallback)
    partnerPreferences: Object.keys(mergedPrefs).length > 0 ? mergedPrefs : null,
    // Raw DB row for admin debugging (shows legacy columns + JSONB separately)
    _rawPrefRow: rawPrefRow
      ? {
          preferredFirmTypes: rawPrefRow.preferredFirmTypes ?? [],
          preferredSizeBands: rawPrefRow.preferredSizeBands ?? [],
          preferredIndustries: rawPrefRow.preferredIndustries ?? [],
          preferredMarkets: rawPrefRow.preferredMarkets ?? [],
          rawOnboardingData: rawPrefRow.rawOnboardingData as Record<string, unknown> | null,
        }
      : null,
  });
}

/** Map stage:event → human-readable label */
function eventLabel(stage: string, event: string): string {
  const map: Record<string, string> = {
    "domain_submitted:domain_entered": "Domain Submitted",
    "cache_lookup:cache_hit_full": "Cache: Full Hit",
    "cache_lookup:cache_hit_partial": "Cache: Partial Hit",
    "cache_lookup:cache_miss": "Cache: Miss",
    "enrichment_stage_done:pdl_done": "PDL: Complete",
    "enrichment_stage_done:pdl_failed": "PDL: Failed",
    "enrichment_stage_done:scrape_done": "Website Scrape: Complete",
    "enrichment_stage_done:scrape_failed": "Website Scrape: Failed",
    "enrichment_stage_done:classify_done": "AI Classification: Complete",
    "enrichment_stage_done:classify_failed": "AI Classification: Failed",
    "enrichment_complete:enrichment_succeeded": "Enrichment: Succeeded",
    "enrichment_complete:enrichment_failed": "Enrichment: Failed",
    "onboarding_complete:all_questions_done": "Onboarding Complete",
  };
  const key = `${stage}:${event}`;
  if (map[key]) return map[key];
  if (stage === "interview_answer") return `Q: ${event.replace(/([A-Z])/g, " $1").trim()}`;
  return event.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
