/**
 * Admin API: CRUD for firm case studies
 * GET   /api/admin/customers/[orgId]/case-studies
 * POST  /api/admin/customers/[orgId]/case-studies  — submit new (URL)
 * PATCH /api/admin/customers/[orgId]/case-studies  — update (hide, status)
 */

import { NextRequest } from "next/server";
import { eq, ne, and, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { firmCaseStudies } from "@/lib/db/schema";
import { inngest } from "@/inngest/client";
import { resolveAdminFirm } from "../utils";

export const dynamic = "force-dynamic";

function uid(): string {
  return `cs_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const { error, status, firm } = await resolveAdminFirm(orgId);
  if (error) return Response.json({ error }, { status });

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
      autoTags: firmCaseStudies.autoTags,
      userNotes: firmCaseStudies.userNotes,
      isHidden: firmCaseStudies.isHidden,
      createdAt: firmCaseStudies.createdAt,
      ingestedAt: firmCaseStudies.ingestedAt,
    })
    .from(firmCaseStudies)
    .where(and(eq(firmCaseStudies.firmId, firm!.id), ne(firmCaseStudies.status, "deleted")))
    .orderBy(desc(firmCaseStudies.createdAt));

  return Response.json({
    caseStudies: rows,
    total: rows.length,
    hiddenCount: rows.filter((r) => r.isHidden).length,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const { error, status, firm } = await resolveAdminFirm(orgId);
  if (error) return Response.json({ error }, { status });

  const body = await req.json();
  const { url } = body;

  if (!url) {
    return Response.json({ error: "url is required" }, { status: 400 });
  }

  try {
    new URL(url);
  } catch {
    return Response.json({ error: "Invalid URL" }, { status: 400 });
  }

  const id = uid();
  await db.insert(firmCaseStudies).values({
    id,
    firmId: firm!.id,
    organizationId: orgId,
    sourceUrl: url,
    sourceType: "url",
    status: "pending",
  });

  await inngest.send({
    name: "enrich/firm-case-study-ingest",
    data: {
      caseStudyId: id,
      firmId: firm!.id,
      organizationId: orgId,
      sourceUrl: url,
      sourceType: "url",
    },
  });

  return Response.json({ caseStudy: { id, status: "pending" } }, { status: 201 });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const { error, status, firm } = await resolveAdminFirm(orgId);
  if (error) return Response.json({ error }, { status });

  const body = await req.json();
  const { id, isHidden, status: newStatus } = body;
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  const [cs] = await db.select({ id: firmCaseStudies.id }).from(firmCaseStudies)
    .where(and(eq(firmCaseStudies.id, id), eq(firmCaseStudies.firmId, firm!.id)))
    .limit(1);
  if (!cs) return Response.json({ error: "Case study not found" }, { status: 404 });

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof isHidden === "boolean") updates.isHidden = isHidden;
  if (newStatus === "not_case_study" || newStatus === "active") updates.status = newStatus;

  await db.update(firmCaseStudies).set(updates).where(eq(firmCaseStudies.id, id));
  return Response.json({ success: true });
}
