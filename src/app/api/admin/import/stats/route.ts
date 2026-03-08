import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  importedCompanies,
  importedContacts,
  importedOutreach,
  importedClients,
  importedCaseStudies,
  migrationBatches,
} from "@/lib/db/schema";
import { sql } from "drizzle-orm";

/**
 * GET /api/admin/import/stats
 *
 * Returns migration statistics for the admin dashboard.
 * Protected by ADMIN_SECRET header.
 */
export async function GET(req: NextRequest) {
  // Verify admin secret
  const secret = req.headers.get("x-admin-secret");
  const expectedSecret = process.env.ADMIN_SECRET;
  if (expectedSecret && secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Company stats
    const [companyCounts] = await db
      .select({
        total: sql<number>`count(*)`,
        withGraph: sql<number>`count(${importedCompanies.graphNodeId})`,
        flagged: sql<number>`count(CASE WHEN jsonb_array_length(COALESCE(${importedCompanies.reviewTags}::jsonb, '[]'::jsonb)) > 0 THEN 1 END)`,
        investors: sql<number>`count(CASE WHEN ${importedCompanies.reviewTags}::jsonb @> '"investor_carry_over"'::jsonb THEN 1 END)`,
        isIcpTrue: sql<number>`count(CASE WHEN ${importedCompanies.isIcp} = true THEN 1 END)`,
        isIcpFalse: sql<number>`count(CASE WHEN ${importedCompanies.isIcp} = false THEN 1 END)`,
      })
      .from(importedCompanies);

    // Contact stats
    const [contactCounts] = await db
      .select({
        total: sql<number>`count(*)`,
        withGraph: sql<number>`count(${importedContacts.graphNodeId})`,
        withEmail: sql<number>`count(${importedContacts.email})`,
        experts: sql<number>`count(CASE WHEN ${importedContacts.expertClassification} = 'expert' THEN 1 END)`,
        internal: sql<number>`count(CASE WHEN ${importedContacts.expertClassification} = 'internal' THEN 1 END)`,
        ambiguous: sql<number>`count(CASE WHEN ${importedContacts.expertClassification} = 'ambiguous' THEN 1 END)`,
      })
      .from(importedContacts);

    // Outreach stats
    const [outreachCounts] = await db
      .select({
        total: sql<number>`count(*)`,
        withCompany: sql<number>`count(${importedOutreach.companyId})`,
        withContact: sql<number>`count(${importedOutreach.contactId})`,
      })
      .from(importedOutreach);

    // Client stats
    const [clientCounts] = await db
      .select({
        total: sql<number>`count(*)`,
        withCompany: sql<number>`count(${importedClients.importedCompanyId})`,
      })
      .from(importedClients);

    // Case study stats
    const [caseStudyCounts] = await db
      .select({
        total: sql<number>`count(*)`,
        withCompany: sql<number>`count(${importedCaseStudies.importedCompanyId})`,
        published: sql<number>`count(CASE WHEN ${importedCaseStudies.status} = 'published' THEN 1 END)`,
      })
      .from(importedCaseStudies);

    // Batch stats
    const batches = await db
      .select({
        entityType: migrationBatches.entityType,
        status: migrationBatches.status,
        totalImported: sql<number>`sum(${migrationBatches.imported})`,
        totalSkipped: sql<number>`sum(${migrationBatches.skipped})`,
        totalErrors: sql<number>`sum(${migrationBatches.errors})`,
        batchCount: sql<number>`count(*)`,
      })
      .from(migrationBatches)
      .groupBy(migrationBatches.entityType, migrationBatches.status);

    return NextResponse.json({
      companies: {
        total: Number(companyCounts.total),
        syncedToGraph: Number(companyCounts.withGraph),
        pendingGraphSync: Number(companyCounts.total) - Number(companyCounts.withGraph),
        flagged: Number(companyCounts.flagged),
        investorCarryOver: Number(companyCounts.investors),
        isIcp: Number(companyCounts.isIcpTrue),
        notIcp: Number(companyCounts.isIcpFalse),
      },
      contacts: {
        total: Number(contactCounts.total),
        syncedToGraph: Number(contactCounts.withGraph),
        pendingGraphSync: Number(contactCounts.total) - Number(contactCounts.withGraph),
        withEmail: Number(contactCounts.withEmail),
        experts: Number(contactCounts.experts),
        internal: Number(contactCounts.internal),
        ambiguous: Number(contactCounts.ambiguous),
      },
      outreach: {
        total: Number(outreachCounts.total),
        linkedToCompany: Number(outreachCounts.withCompany),
        linkedToContact: Number(outreachCounts.withContact),
      },
      clients: {
        total: Number(clientCounts.total),
        linkedToCompany: Number(clientCounts.withCompany),
      },
      caseStudies: {
        total: Number(caseStudyCounts.total),
        linkedToCompany: Number(caseStudyCounts.withCompany),
        published: Number(caseStudyCounts.published),
      },
      batches: batches.map((b) => ({
        entityType: b.entityType,
        status: b.status,
        totalImported: Number(b.totalImported),
        totalSkipped: Number(b.totalSkipped),
        totalErrors: Number(b.totalErrors),
        batchCount: Number(b.batchCount),
      })),
    });
  } catch (error) {
    console.error("[ImportStats] Failed:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
