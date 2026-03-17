/**
 * Admin API: Read/write firm profile preferences and firm-level fields
 * GET  /api/admin/customers/[orgId]/profile  — all preferences + confirmed fields
 * POST /api/admin/customers/[orgId]/profile  — update a single field
 */

import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { serviceFirms } from "@/lib/db/schema";
import { resolveAdminFirm } from "../utils";
import {
  updateProfileField,
  readAllPreferences,
  ALL_PROFILE_FIELDS,
} from "@/lib/profile/update-profile-field";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const { error, status, firm } = await resolveAdminFirm(orgId);
  if (error) return Response.json({ error }, { status });

  // Read partner preferences from partnerPreferences table
  const preferences = await readAllPreferences(firm!.id);

  // Read firm-level confirmed fields from enrichmentData.confirmed
  const [firmRow] = await db
    .select({ enrichmentData: serviceFirms.enrichmentData })
    .from(serviceFirms)
    .where(eq(serviceFirms.id, firm!.id))
    .limit(1);

  const enrichmentData = (firmRow?.enrichmentData as Record<string, unknown>) ?? {};
  const confirmed = (enrichmentData.confirmed as Record<string, unknown>) ?? {};

  return Response.json({ preferences, confirmed, firmId: firm!.id });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const { error, status, firm } = await resolveAdminFirm(orgId);
  if (error) return Response.json({ error }, { status });

  const body = await req.json();
  const { field, value } = body;

  if (!field || !ALL_PROFILE_FIELDS.includes(field)) {
    return Response.json({ error: `Invalid field: ${field}` }, { status: 400 });
  }

  const result = await updateProfileField(firm!.id, field, value);
  return Response.json(result);
}
