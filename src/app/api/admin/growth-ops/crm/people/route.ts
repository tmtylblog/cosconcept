/**
 * GET /api/admin/growth-ops/crm/people — Paginated unified person list.
 * POST /api/admin/growth-ops/crm/people — Create a new contact.
 * Auth: superadmin, admin, or growth_ops role.
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { acqContacts, acqCompanies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getUnifiedPeople } from "@/lib/growth-ops/crm-queries";
import type { PersonEntityClass } from "@/lib/growth-ops/crm-types";

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
    const result = await getUnifiedPeople({
      search: searchParams.get("search") || undefined,
      entityClass: (searchParams.get("entityClass") as PersonEntityClass | "all") || "all",
      companyDomain: searchParams.get("companyDomain") || undefined,
      sort: (searchParams.get("sort") as "name" | "created" | "activity" | "deals") || "name",
      sortDir: (searchParams.get("sortDir") as "asc" | "desc") || "asc",
      page: parseInt(searchParams.get("page") || "1", 10),
      limit: parseInt(searchParams.get("limit") || "100", 10),
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[CRM] People list error:", error);
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
    const { firstName, lastName, email, title, phone, location, linkedinUrl, companyName, companyDomain, notes } = body as {
      firstName: string;
      lastName: string;
      email: string;
      title?: string;
      phone?: string;
      location?: string;
      linkedinUrl?: string;
      companyName?: string;
      companyDomain?: string;
      notes?: string;
    };

    if (!email?.trim()) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Check for duplicate email
    const [existing] = await db.select({ id: acqContacts.id }).from(acqContacts).where(eq(acqContacts.email, email.trim().toLowerCase())).limit(1);
    if (existing) {
      return NextResponse.json({ error: "A contact with this email already exists", existingId: existing.id }, { status: 409 });
    }

    // If company info provided, find or create the company
    let companyId: string | null = null;
    if (companyName?.trim()) {
      if (companyDomain?.trim()) {
        const [existingCo] = await db.select({ id: acqCompanies.id }).from(acqCompanies).where(eq(acqCompanies.domain, companyDomain.trim().toLowerCase())).limit(1);
        if (existingCo) {
          companyId = existingCo.id;
        }
      }
      if (!companyId) {
        const coId = crypto.randomUUID();
        await db.insert(acqCompanies).values({
          id: coId,
          name: companyName.trim(),
          domain: companyDomain?.trim().toLowerCase() ?? null,
        });
        companyId = coId;
      }
    }

    const id = crypto.randomUUID();
    await db.insert(acqContacts).values({
      id,
      email: email.trim().toLowerCase(),
      firstName: firstName?.trim() ?? "",
      lastName: lastName?.trim() ?? "",
      title: title?.trim() ?? null,
      phone: phone?.trim() ?? null,
      location: location?.trim() ?? null,
      notes: notes?.trim() ?? null,
      linkedinUrl: linkedinUrl?.trim() ?? null,
      companyId,
    });

    return NextResponse.json({ id, companyId });
  } catch (error) {
    console.error("[CRM] Create contact error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
