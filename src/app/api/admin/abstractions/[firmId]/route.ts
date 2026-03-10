import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  abstractionProfiles,
  serviceFirms,
  enrichmentAuditLog,
  importedCaseStudies,
} from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { generateFirmAbstraction } from "@/lib/matching/abstraction-generator";

/**
 * GET /api/admin/abstractions/[firmId]
 * Returns the full abstraction profile for a firm.
 *
 * POST /api/admin/abstractions/[firmId]
 * Triggers abstraction profile regeneration for the firm.
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ firmId: string }> }
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

  const { firmId } = await params;

  const [firm] = await db
    .select()
    .from(serviceFirms)
    .where(eq(serviceFirms.id, firmId))
    .limit(1);

  if (!firm) {
    return NextResponse.json({ error: "Firm not found" }, { status: 404 });
  }

  const [profile] = await db
    .select()
    .from(abstractionProfiles)
    .where(eq(abstractionProfiles.entityId, firmId))
    .limit(1);

  return NextResponse.json({ firm, profile: profile ?? null });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ firmId: string }> }
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

  const { firmId } = await params;

  const [firm] = await db
    .select()
    .from(serviceFirms)
    .where(eq(serviceFirms.id, firmId))
    .limit(1);

  if (!firm) {
    return NextResponse.json({ error: "Firm not found" }, { status: 404 });
  }

  // Gather enrichment data for evidence
  const enrichmentData = firm.enrichmentData as Record<string, unknown> | null;
  const pdlData = enrichmentData?.pdl as {
    industry?: string;
    size?: string;
    employee_count?: number;
    summary?: string;
  } | undefined;

  // Get case studies from enrichment audit
  const caseStudyAudit = await db
    .select({ extractedData: enrichmentAuditLog.extractedData })
    .from(enrichmentAuditLog)
    .where(eq(enrichmentAuditLog.firmId, firmId))
    .orderBy(desc(enrichmentAuditLog.createdAt))
    .limit(50);

  // Get imported case studies if available
  const importedCS = await db
    .select()
    .from(importedCaseStudies)
    .limit(20);

  const caseStudies = importedCS.map((cs) => ({
    title: cs.content?.slice(0, 100) ?? "Untitled",
    clientName: (cs.clientCompanies as Array<{ name: string }> | null)?.[0]?.name,
    skills: ((cs.skills as Array<{ name: string }> | null) ?? []).map((s) => s.name),
    industries: ((cs.industries as Array<{ name: string }> | null) ?? []).map((i) => i.name),
    outcomes: [],
  }));

  const ed = enrichmentData ?? {};
  const evidence = {
    firmId,
    name: firm.name,
    website: firm.website ?? undefined,
    services: (ed.services as string[] | undefined) ?? [],
    aboutPitch: (ed.about as string | undefined) ?? firm.description ?? "",
    categories: (ed.categories as string[] | undefined) ?? [],
    skills: (ed.skills as string[] | undefined) ?? [],
    industries: (ed.industries as string[] | undefined) ?? [],
    markets: (ed.markets as string[] | undefined) ?? [],
    caseStudies: caseStudies.slice(0, 10),
    experts: [],
    pdl: pdlData
      ? {
          industry: pdlData.industry ?? "",
          size: pdlData.size ?? "",
          employeeCount: pdlData.employee_count ?? 0,
          summary: pdlData.summary ?? "",
        }
      : undefined,
  };

  try {
    const profile = await generateFirmAbstraction(evidence);
    return NextResponse.json({ profile });
  } catch (err) {
    console.error("[Admin] Abstraction regeneration error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 }
    );
  }
}
