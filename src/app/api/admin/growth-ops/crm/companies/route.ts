/**
 * GET /api/admin/growth-ops/crm/companies — Paginated unified company list.
 * POST /api/admin/growth-ops/crm/companies — Create a new prospect company.
 * Auth: superadmin, admin, or growth_ops role.
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { acqCompanies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getUnifiedCompanies } from "@/lib/growth-ops/crm-queries";
import type { CompanyEntityClass } from "@/lib/growth-ops/crm-types";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["superadmin", "admin", "growth_ops"];

export async function GET(req: NextRequest) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user || !ALLOWED_ROLES.includes(session.user.role as string)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const result = await getUnifiedCompanies({
      search: searchParams.get("search") || undefined,
      entityClass: (searchParams.get("entityClass") as CompanyEntityClass | "all") || "all",
      sort: (searchParams.get("sort") as "name" | "created" | "deals" | "enrichment") || "name",
      sortDir: (searchParams.get("sortDir") as "asc" | "desc") || "asc",
      page: parseInt(searchParams.get("page") || "1", 10),
      limit: parseInt(searchParams.get("limit") || "100", 10),
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[CRM] Companies list error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user || !ALLOWED_ROLES.includes(session.user.role as string)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { name, domain, website, industry, sizeEstimate, location, linkedinUrl, description, notes } = body as {
      name: string;
      domain?: string;
      website?: string;
      industry?: string;
      sizeEstimate?: string;
      location?: string;
      linkedinUrl?: string;
      description?: string;
      notes?: string;
    };

    if (!name?.trim()) {
      return NextResponse.json({ error: "Company name is required" }, { status: 400 });
    }

    // Check for duplicate domain
    if (domain?.trim()) {
      const [existing] = await db.select({ id: acqCompanies.id }).from(acqCompanies).where(eq(acqCompanies.domain, domain.trim().toLowerCase())).limit(1);
      if (existing) {
        return NextResponse.json({ error: "A company with this domain already exists", existingId: existing.id }, { status: 409 });
      }
    }

    const id = crypto.randomUUID();
    await db.insert(acqCompanies).values({
      id,
      name: name.trim(),
      domain: domain?.trim().toLowerCase() ?? null,
      website: website?.trim() ?? null,
      industry: industry?.trim() ?? null,
      sizeEstimate: sizeEstimate?.trim() ?? null,
      location: location?.trim() ?? null,
      linkedinUrl: linkedinUrl?.trim() ?? null,
      description: description?.trim() ?? null,
      notes: notes?.trim() ?? null,
    });

    return NextResponse.json({ id });
  } catch (error) {
    console.error("[CRM] Create company error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
