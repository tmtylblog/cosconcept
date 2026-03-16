/**
 * GET   /api/firm/services?organizationId=...  — List firm's services
 * PATCH /api/firm/services                      — Update a service (description, isHidden, displayOrder)
 */

import { headers } from "next/headers";
import { NextRequest } from "next/server";
import { eq, and, asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { firmServices, serviceFirms, members, enrichmentCache } from "@/lib/db/schema";
import { randomBytes } from "crypto";
import { recordManualCorrection } from "@/lib/enrichment/extraction-learner";
import { inngest } from "@/inngest/client";

/** Resolve redirect domain (e.g. chameleon.co → chameleoncollective.com) — best-effort, 3s timeout */
async function resolveRedirect(domain: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(`https://${domain}`, { method: "HEAD", redirect: "follow", signal: ctrl.signal });
    clearTimeout(t);
    const finalHost = new URL(res.url).hostname.replace(/^www\./, "").toLowerCase();
    return finalHost !== domain.toLowerCase() ? finalHost : null;
  } catch { return null; }
}

// ─── Seed from enrichment data (silent, first-load only) ─
async function seedServicesIfEmpty(firmId: string, organizationId: string, userEmail?: string) {
  const [firmRow] = await db
    .select({ enrichmentData: serviceFirms.enrichmentData, website: serviceFirms.website })
    .from(serviceFirms)
    .where(eq(serviceFirms.id, firmId))
    .limit(1);

  let discoveredServices: string[] = [];
  let sourceUrl: string | null = firmRow?.website ?? null;
  let sourcePageTitle = "Auto-discovered from website";

  // Primary: read from serviceFirms.enrichmentData
  const extracted = (firmRow?.enrichmentData as Record<string, unknown> | null)?.extracted as Record<string, unknown> | null;
  discoveredServices = (extracted?.services as string[] | undefined) ?? [];

  // Fallback: check enrichmentCache. Try website domain, email domain, and redirect-resolved variants.
  if (discoveredServices.length === 0) {
    const domainsToTry: string[] = [];
    if (firmRow?.website) {
      try { domainsToTry.push(new URL(firmRow.website).hostname.replace(/^www\./, "").toLowerCase()); } catch { /* ignore */ }
    }
    if (userEmail) {
      const emailDomain = userEmail.split("@")[1];
      if (emailDomain && !domainsToTry.includes(emailDomain)) domainsToTry.push(emailDomain);
    }

    // Helper: look up cache for a domain, return services if found
    async function tryDomain(domain: string): Promise<{ services: string[]; foundDomain: string } | null> {
      const [cacheRow] = await db
        .select({ enrichmentData: enrichmentCache.enrichmentData })
        .from(enrichmentCache)
        .where(eq(enrichmentCache.domain, domain))
        .limit(1);
      if (!cacheRow?.enrichmentData) return null;
      const cacheExtracted = (cacheRow.enrichmentData as Record<string, unknown>)?.extracted as Record<string, unknown> | null;
      const cacheServices = (cacheExtracted?.services as string[] | undefined) ?? [];
      return cacheServices.length > 0 ? { services: cacheServices, foundDomain: domain } : null;
    }

    for (const domain of domainsToTry) {
      const hit = await tryDomain(domain);
      if (hit) {
        discoveredServices = hit.services;
        sourceUrl = firmRow?.website ?? `https://${hit.foundDomain}`;
        sourcePageTitle = `Auto-discovered from ${hit.foundDomain}`;
        console.log(`[SeedServices] Cache hit for ${hit.foundDomain}: ${hit.services.length} services`);
        break;
      }
      // Try redirect-resolved domain (e.g. chameleon.co → chameleoncollective.com)
      const redirectDomain = await resolveRedirect(domain);
      if (redirectDomain && !domainsToTry.includes(redirectDomain)) {
        const redirectHit = await tryDomain(redirectDomain);
        if (redirectHit) {
          discoveredServices = redirectHit.services;
          sourceUrl = firmRow?.website ?? `https://${redirectHit.foundDomain}`;
          sourcePageTitle = `Auto-discovered from ${redirectHit.foundDomain}`;
          console.log(`[SeedServices] Cache hit via redirect ${domain}→${redirectHit.foundDomain}: ${redirectHit.services.length} services`);
          break;
        }
      }
    }
  }

  if (discoveredServices.length === 0) return;

  const now = new Date();
  await db.insert(firmServices).values(
    discoveredServices.map((name, i) => ({
      id: `svc_${Date.now().toString(36)}_${i.toString(36)}_${randomBytes(3).toString("hex")}`,
      firmId,
      organizationId,
      name: name.trim(),
      description: null,
      sourceUrl,
      sourcePageTitle,
      subServices: [] as string[],
      isHidden: false,
      displayOrder: i,
      createdAt: now,
      updatedAt: now,
    }))
  ).onConflictDoNothing();
}

export const dynamic = "force-dynamic";

// ─── Helpers ──────────────────────────────────────────────

async function resolveFirm(userId: string, organizationId: string) {
  const [firm] = await db
    .select({ id: serviceFirms.id, organizationId: serviceFirms.organizationId })
    .from(serviceFirms)
    .where(eq(serviceFirms.organizationId, organizationId))
    .limit(1);

  if (!firm) return null;

  const [membership] = await db
    .select({ id: members.id })
    .from(members)
    .where(
      and(
        eq(members.userId, userId),
        eq(members.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!membership) return null;
  return firm;
}

// ─── GET: List services ──────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const organizationId = req.nextUrl.searchParams.get("organizationId");
  if (!organizationId) {
    return Response.json({ error: "organizationId required" }, { status: 400 });
  }

  const firm = await resolveFirm(session.user.id, organizationId);
  if (!firm) {
    return Response.json({ error: "Firm not found" }, { status: 404 });
  }

  const includeHidden = req.nextUrl.searchParams.get("includeHidden") === "true";

  const conditions = [eq(firmServices.firmId, firm.id)];
  if (!includeHidden) {
    conditions.push(eq(firmServices.isHidden, false));
  }

  let rows = await db
    .select({
      id: firmServices.id,
      name: firmServices.name,
      description: firmServices.description,
      sourceUrl: firmServices.sourceUrl,
      sourcePageTitle: firmServices.sourcePageTitle,
      subServices: firmServices.subServices,
      isHidden: firmServices.isHidden,
      displayOrder: firmServices.displayOrder,
      createdAt: firmServices.createdAt,
    })
    .from(firmServices)
    .where(and(...conditions))
    .orderBy(asc(firmServices.displayOrder), asc(firmServices.createdAt));

  // If empty, try seeding from enrichment data then re-fetch
  if (rows.length === 0) {
    await seedServicesIfEmpty(firm.id, organizationId, session.user.email ?? undefined);
    rows = await db
      .select({
        id: firmServices.id,
        name: firmServices.name,
        description: firmServices.description,
        sourceUrl: firmServices.sourceUrl,
        sourcePageTitle: firmServices.sourcePageTitle,
        subServices: firmServices.subServices,
        isHidden: firmServices.isHidden,
        displayOrder: firmServices.displayOrder,
        createdAt: firmServices.createdAt,
      })
      .from(firmServices)
      .where(and(...conditions))
      .orderBy(asc(firmServices.displayOrder), asc(firmServices.createdAt));

    // Still empty after seeding — kick off deep crawl (populates services + case studies via Inngest)
    if (rows.length === 0) {
      const [firmRow] = await db
        .select({ website: serviceFirms.website, name: serviceFirms.name })
        .from(serviceFirms)
        .where(eq(serviceFirms.id, firm.id))
        .limit(1);
      if (firmRow?.website) {
        inngest.send({
          name: "enrich/deep-crawl",
          data: { firmId: firm.id, organizationId, website: firmRow.website, firmName: firmRow.name },
        }).catch((err: unknown) => console.error("[Services] Failed to queue deep-crawl:", err));
      }
    }
  }

  // Count hidden separately
  const hiddenRows = includeHidden
    ? rows.filter((r) => r.isHidden)
    : await db
        .select({ id: firmServices.id })
        .from(firmServices)
        .where(
          and(
            eq(firmServices.firmId, firm.id),
            eq(firmServices.isHidden, true)
          )
        );

  return Response.json({
    services: rows,
    total: rows.length,
    hiddenCount: hiddenRows.length,
  });
}

// ─── POST: Manually create a service ─────────────────────

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { organizationId, name, description } = body;

  if (!organizationId || !name?.trim()) {
    return Response.json({ error: "organizationId and name are required" }, { status: 400 });
  }

  const firm = await resolveFirm(session.user.id, organizationId);
  if (!firm) {
    return Response.json({ error: "Firm not found" }, { status: 404 });
  }

  const id = `svc_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
  const now = new Date();

  const [service] = await db.insert(firmServices).values({
    id,
    firmId: firm.id,
    organizationId,
    name: name.trim(),
    description: description?.trim() ?? null,
    sourceUrl: null,
    sourcePageTitle: null,
    subServices: [],
    isHidden: false,
    displayOrder: 9999,
    createdAt: now,
    updatedAt: now,
  }).returning();

  // Track manual service add for self-learning (Change 9c)
  await recordManualCorrection({
    firmId: firm.id,
    extractionType: "services",
    item: name.trim(),
  });

  return Response.json({ service });
}

// ─── DELETE: Remove a manually-added service ─────────────

export async function DELETE(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const organizationId = req.nextUrl.searchParams.get("organizationId");
  const id = req.nextUrl.searchParams.get("id");

  if (!id || !organizationId) {
    return Response.json({ error: "id and organizationId required" }, { status: 400 });
  }

  const firm = await resolveFirm(session.user.id, organizationId);
  if (!firm) {
    return Response.json({ error: "Firm not found" }, { status: 404 });
  }

  // Only allow deleting manually-added services (sourceUrl is null)
  const [svc] = await db
    .select({ id: firmServices.id, sourceUrl: firmServices.sourceUrl })
    .from(firmServices)
    .where(and(eq(firmServices.id, id), eq(firmServices.firmId, firm.id)))
    .limit(1);

  if (!svc) {
    return Response.json({ error: "Service not found" }, { status: 404 });
  }

  if (svc.sourceUrl !== null) {
    return Response.json({ error: "Auto-discovered services cannot be deleted — use hide instead" }, { status: 400 });
  }

  await db.delete(firmServices).where(eq(firmServices.id, id));
  return Response.json({ success: true });
}

// ─── PATCH: Update a service ─────────────────────────────

export async function PATCH(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { id, organizationId, description, isHidden, displayOrder } = body;

  if (!id || !organizationId) {
    return Response.json({ error: "id and organizationId required" }, { status: 400 });
  }

  const firm = await resolveFirm(session.user.id, organizationId);
  if (!firm) {
    return Response.json({ error: "Firm not found" }, { status: 404 });
  }

  // Verify service belongs to this firm
  const [svc] = await db
    .select({ id: firmServices.id })
    .from(firmServices)
    .where(
      and(
        eq(firmServices.id, id),
        eq(firmServices.firmId, firm.id)
      )
    )
    .limit(1);

  if (!svc) {
    return Response.json({ error: "Service not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof description === "string") updates.description = description;
  if (typeof isHidden === "boolean") updates.isHidden = isHidden;
  if (typeof displayOrder === "number") updates.displayOrder = displayOrder;

  await db.update(firmServices).set(updates).where(eq(firmServices.id, id));

  return Response.json({ success: true });
}
