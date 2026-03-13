/**
 * GET  /api/firm/case-studies?organizationId=...  — List firm's case studies
 * POST /api/firm/case-studies                      — Submit a new case study
 */

import { headers } from "next/headers";
import { NextRequest } from "next/server";
import { eq, ne, and, desc } from "drizzle-orm";
import { after } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { firmCaseStudies, serviceFirms, members } from "@/lib/db/schema";
import { enqueue } from "@/lib/jobs/queue";
import { runNextJob } from "@/lib/jobs/runner";

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

  const rows = await db
    .select({
      id: firmCaseStudies.id,
      sourceUrl: firmCaseStudies.sourceUrl,
      sourceType: firmCaseStudies.sourceType,
      status: firmCaseStudies.status,
      statusMessage: firmCaseStudies.statusMessage,
      title: firmCaseStudies.title,
      summary: firmCaseStudies.summary,
      thumbnailUrl: firmCaseStudies.thumbnailUrl,
      previewImageUrl: firmCaseStudies.previewImageUrl,
      autoTags: firmCaseStudies.autoTags,
      cosAnalysis: firmCaseStudies.cosAnalysis,
      userNotes: firmCaseStudies.userNotes,
      isHidden: firmCaseStudies.isHidden,
      createdAt: firmCaseStudies.createdAt,
      ingestedAt: firmCaseStudies.ingestedAt,
    })
    .from(firmCaseStudies)
    .where(and(...conditions))
    .orderBy(desc(firmCaseStudies.createdAt));

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
  await enqueue("firm-case-study-ingest", {
    caseStudyId: id,
    firmId: firm.id,
    organizationId,
    sourceUrl,
    sourceType: sourceType === "pdf" ? "pdf_url" : sourceType,
    rawText,
    filename,
  });
  after(runNextJob().catch(() => {}));

  return Response.json(
    { caseStudy: { id, status: "pending" }, message: "Queued for ingestion" },
    { status: 201 }
  );
}
