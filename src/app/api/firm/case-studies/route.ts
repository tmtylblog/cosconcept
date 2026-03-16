/**
 * GET  /api/firm/case-studies?organizationId=...  — List firm's case studies
 * POST /api/firm/case-studies                      — Submit a new case study
 */

import { headers } from "next/headers";
import { NextRequest } from "next/server";
import { eq, ne, and, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { firmCaseStudies, serviceFirms, members, enrichmentCache } from "@/lib/db/schema";
import { inngest } from "@/inngest/client";

/** Resolve redirect domain — best-effort, 3s timeout */
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
import { recordManualCorrection } from "@/lib/enrichment/extraction-learner";

// ─── Seed from enrichment data (silent, first-load only) ─
// Also re-queues any URLs stuck in pending/failed for over 48 hours.
async function seedCaseStudiesIfEmpty(firmId: string, organizationId: string, userEmail?: string) {
  const [firmRow] = await db
    .select({ enrichmentData: serviceFirms.enrichmentData, website: serviceFirms.website })
    .from(serviceFirms)
    .where(eq(serviceFirms.id, firmId))
    .limit(1);

  const extracted = (firmRow?.enrichmentData as Record<string, unknown> | null)?.extracted as Record<string, unknown> | null;
  let urls = (extracted?.caseStudyUrls as string[] | undefined) ?? [];

  // Fallback: check enrichmentCache by website domain or email domain (with redirect resolution)
  if (urls.length === 0) {
    const domainsToTry: string[] = [];
    if (firmRow?.website) {
      try { domainsToTry.push(new URL(firmRow.website).hostname.replace(/^www\./, "").toLowerCase()); } catch { /* ignore */ }
    }
    if (userEmail) {
      const emailDomain = userEmail.split("@")[1];
      if (emailDomain && !domainsToTry.includes(emailDomain)) domainsToTry.push(emailDomain);
    }

    async function tryDomainForUrls(domain: string): Promise<string[] | null> {
      const [cacheRow] = await db
        .select({ enrichmentData: enrichmentCache.enrichmentData })
        .from(enrichmentCache)
        .where(eq(enrichmentCache.domain, domain))
        .limit(1);
      if (!cacheRow?.enrichmentData) return null;
      const cacheExtracted = (cacheRow.enrichmentData as Record<string, unknown>)?.extracted as Record<string, unknown> | null;
      const cacheUrls = (cacheExtracted?.caseStudyUrls as string[] | undefined) ?? [];
      return cacheUrls.length > 0 ? cacheUrls : null;
    }

    for (const domain of domainsToTry) {
      const hit = await tryDomainForUrls(domain);
      if (hit) { urls = hit; console.log(`[SeedCaseStudies] Cache hit for ${domain}: ${hit.length} URLs`); break; }
      const redirectDomain = await resolveRedirect(domain);
      if (redirectDomain && !domainsToTry.includes(redirectDomain)) {
        const redirectHit = await tryDomainForUrls(redirectDomain);
        if (redirectHit) { urls = redirectHit; console.log(`[SeedCaseStudies] Cache hit via redirect ${domain}→${redirectDomain}: ${redirectHit.length} URLs`); break; }
      }
    }
  }

  if (urls.length === 0) return;

  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  let queued = 0;

  for (const csUrl of urls.slice(0, 30)) {
    const [existing] = await db
      .select({ id: firmCaseStudies.id, status: firmCaseStudies.status, createdAt: firmCaseStudies.createdAt })
      .from(firmCaseStudies)
      .where(and(eq(firmCaseStudies.firmId, firmId), eq(firmCaseStudies.sourceUrl, csUrl)))
      .limit(1);

    if (existing) {
      // Re-queue if stuck pending/failed for over 48h
      const isStuck = (existing.status === "pending" || existing.status === "failed") &&
        new Date(existing.createdAt) < cutoff;
      if (isStuck) {
        await db.update(firmCaseStudies)
          .set({ status: "pending", statusMessage: "Retrying — previous attempt may have timed out", updatedAt: new Date() })
          .where(eq(firmCaseStudies.id, existing.id));
        await inngest.send({ name: "enrich/firm-case-study-ingest", data: {
          caseStudyId: existing.id, firmId, organizationId, sourceUrl: csUrl, sourceType: "url",
        } });
        queued++;
      }
      continue;
    }

    // New — create and queue
    const csId = `cs_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
    await db.insert(firmCaseStudies).values({
      id: csId, firmId, organizationId, sourceUrl: csUrl, sourceType: "url", status: "pending",
    });
    await inngest.send({ name: "enrich/firm-case-study-ingest", data: {
      caseStudyId: csId, firmId, organizationId, sourceUrl: csUrl, sourceType: "url",
    } });
    queued++;
  }
  // Inngest handles scheduling automatically
}

export const dynamic = "force-dynamic";

// ─── Helpers ──────────────────────────────────────────────

function uid(): string {
  return `cs_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

async function resolveFirm(userId: string, organizationId: string) {
  // Look up firm
  const [firm] = await db
    .select({ id: serviceFirms.id, organizationId: serviceFirms.organizationId })
    .from(serviceFirms)
    .where(eq(serviceFirms.organizationId, organizationId))
    .limit(1);

  if (!firm) return null;

  // Verify user is a member of this org
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

// ─── GET: List case studies ───────────────────────────────

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

  const conditions = [
    eq(firmCaseStudies.firmId, firm.id),
    ne(firmCaseStudies.status, "deleted"),
  ];
  if (!includeHidden) {
    conditions.push(eq(firmCaseStudies.isHidden, false));
  }

  let rows = await db
    .select({
      id: firmCaseStudies.id,
      sourceUrl: firmCaseStudies.sourceUrl,
      sourceType: firmCaseStudies.sourceType,
      status: firmCaseStudies.status,
      statusMessage: firmCaseStudies.statusMessage,
      title: firmCaseStudies.title,
      summary: firmCaseStudies.summary,
      thumbnailUrl: firmCaseStudies.thumbnailUrl,
      autoTags: firmCaseStudies.autoTags,
      userNotes: firmCaseStudies.userNotes,
      isHidden: firmCaseStudies.isHidden,
      createdAt: firmCaseStudies.createdAt,
      ingestedAt: firmCaseStudies.ingestedAt,
    })
    .from(firmCaseStudies)
    .where(and(...conditions))
    .orderBy(desc(firmCaseStudies.createdAt));

  // If empty, seed from enrichment data then re-fetch
  if (rows.length === 0) {
    await seedCaseStudiesIfEmpty(firm.id, organizationId, session.user.email ?? undefined);
    rows = await db
      .select({
        id: firmCaseStudies.id,
        sourceUrl: firmCaseStudies.sourceUrl,
        sourceType: firmCaseStudies.sourceType,
        status: firmCaseStudies.status,
        statusMessage: firmCaseStudies.statusMessage,
        title: firmCaseStudies.title,
        summary: firmCaseStudies.summary,
        thumbnailUrl: firmCaseStudies.thumbnailUrl,
        autoTags: firmCaseStudies.autoTags,
        userNotes: firmCaseStudies.userNotes,
        isHidden: firmCaseStudies.isHidden,
        createdAt: firmCaseStudies.createdAt,
        ingestedAt: firmCaseStudies.ingestedAt,
      })
      .from(firmCaseStudies)
      .where(and(...conditions))
      .orderBy(desc(firmCaseStudies.createdAt));

    // Still empty after seeding — kick off deep crawl (populates services + case studies via Inngest)
    if (rows.length === 0) {
      const [firmRow] = await db
        .select({ website: serviceFirms.website, name: serviceFirms.name })
        .from(serviceFirms)
        .where(eq(serviceFirms.id, firm.id))
        .limit(1);
      if (firmRow?.website) {
        try {
          await inngest.send({
            name: "enrich/deep-crawl",
            data: { firmId: firm.id, organizationId, website: firmRow.website, firmName: firmRow.name },
          });
          console.log(`[CaseStudies] Queued deep-crawl for ${firmRow.name} (${firmRow.website})`);
        } catch (err) {
          console.error("[CaseStudies] Failed to queue deep-crawl:", err);
        }
      }
    }
  }

  // Count hidden separately
  const hiddenRows = includeHidden
    ? rows.filter((r) => r.isHidden)
    : await db
        .select({ id: firmCaseStudies.id })
        .from(firmCaseStudies)
        .where(
          and(
            eq(firmCaseStudies.firmId, firm.id),
            ne(firmCaseStudies.status, "deleted"),
            eq(firmCaseStudies.isHidden, true)
          )
        );

  return Response.json({
    caseStudies: rows,
    total: rows.length,
    hiddenCount: hiddenRows.length,
  });
}

// ─── PATCH: Update a case study (toggle hidden, etc.) ────

export async function PATCH(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { id, organizationId, isHidden } = body;

  if (!id || !organizationId) {
    return Response.json({ error: "id and organizationId required" }, { status: 400 });
  }

  const firm = await resolveFirm(session.user.id, organizationId);
  if (!firm) {
    return Response.json({ error: "Firm not found" }, { status: 404 });
  }

  // Verify case study belongs to this firm
  const [cs] = await db
    .select({ id: firmCaseStudies.id })
    .from(firmCaseStudies)
    .where(
      and(
        eq(firmCaseStudies.id, id),
        eq(firmCaseStudies.firmId, firm.id)
      )
    )
    .limit(1);

  if (!cs) {
    return Response.json({ error: "Case study not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof isHidden === "boolean") updates.isHidden = isHidden;

  await db.update(firmCaseStudies).set(updates).where(eq(firmCaseStudies.id, id));

  return Response.json({ success: true });
}

// ─── POST: Submit a new case study ────────────────────────

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = req.headers.get("content-type") ?? "";

  let sourceType: "url" | "text" | "pdf";
  let sourceUrl: string;
  let rawText: string | undefined;
  let filename: string | undefined;
  let userNotes: string | undefined;
  let organizationId: string | undefined;

  // ── Parse based on content type ─────────────────────────
  if (contentType.includes("multipart/form-data")) {
    // PDF upload
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    organizationId = formData.get("organizationId") as string | null ?? undefined;
    userNotes = formData.get("userNotes") as string | null ?? undefined;

    if (!file || !organizationId) {
      return Response.json(
        { error: "file and organizationId required" },
        { status: 400 }
      );
    }

    if (file.size > 10 * 1024 * 1024) {
      return Response.json(
        { error: "File too large. Maximum 10MB." },
        { status: 400 }
      );
    }

    // Extract text from PDF (basic: read as text; the ingestor handles proper extraction)
    const buffer = await file.arrayBuffer();
    rawText = new TextDecoder("utf-8", { fatal: false }).decode(buffer);

    // If we can't extract readable text, the Inngest pipeline will handle it
    sourceType = "pdf";
    sourceUrl = `uploaded:${file.name}`;
    filename = file.name;
  } else {
    // JSON body — URL or text paste
    const body = await req.json();
    organizationId = body.organizationId;
    userNotes = body.userNotes;

    if (!organizationId) {
      return Response.json(
        { error: "organizationId required" },
        { status: 400 }
      );
    }

    if (body.sourceType === "url") {
      if (!body.url || !isValidUrl(body.url)) {
        return Response.json(
          { error: "A valid URL is required" },
          { status: 400 }
        );
      }
      sourceType = "url";
      sourceUrl = body.url;
    } else if (body.sourceType === "text") {
      if (!body.rawText || body.rawText.trim().length < 100) {
        return Response.json(
          { error: "Text must be at least 100 characters" },
          { status: 400 }
        );
      }
      sourceType = "text";
      sourceUrl = "manual:text-paste";
      rawText = body.rawText.trim();
    } else {
      return Response.json(
        { error: "sourceType must be 'url' or 'text'" },
        { status: 400 }
      );
    }
  }

  // ── Resolve firm ────────────────────────────────────────
  const firm = await resolveFirm(session.user.id, organizationId);
  if (!firm) {
    return Response.json({ error: "Firm not found" }, { status: 404 });
  }

  // ── Create DB row ───────────────────────────────────────
  const id = uid();

  await db.insert(firmCaseStudies).values({
    id,
    firmId: firm.id,
    organizationId,
    sourceUrl,
    sourceType,
    userNotes: userNotes || null,
    status: "pending",
  });

  // ── Queue background job ─────────────────────────────────
  await inngest.send({ name: "enrich/firm-case-study-ingest", data: {
    caseStudyId: id,
    firmId: firm.id,
    organizationId,
    sourceUrl,
    sourceType: sourceType === "pdf" ? "pdf_url" : sourceType,
    rawText,
    filename,
  } });

  // Track manual case study submission for self-learning (Change 9c)
  await recordManualCorrection({
    firmId: firm.id,
    extractionType: "case_studies",
    item: sourceUrl,
  });

  return Response.json(
    { caseStudy: { id, status: "pending" }, message: "Queued for ingestion" },
    { status: 201 }
  );
}
