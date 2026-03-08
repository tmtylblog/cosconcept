import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  importedCompanies,
  importedContacts,
  importedOutreach,
  migrationBatches,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

/**
 * POST /api/admin/import/outreach
 *
 * Receives a batch of outreach messages from n8n's fact.messages table
 * and imports them into the imported_outreach table.
 * Protected by ADMIN_SECRET header.
 *
 * Body: {
 *   batch: Array<n8nMessageRow>,
 *   batchNumber: number,
 *   totalBatches: number
 * }
 */

interface N8nMessageRow {
  message_id: string;
  message_module?: string;
  message_type?: string;
  message?: string;
  sender_user_id?: string;
  sender_organization_id?: string;
  recipient_user_id?: string;
  recipient_organization_id?: string;
  opportunity_id?: string;
  opportunity_title?: string;
  profiles_count?: number;
  case_studies_count?: number;
  created_at?: string;
  ingested_at?: string;
  [key: string]: unknown;
}

export async function POST(req: NextRequest) {
  // Verify admin secret
  const secret = req.headers.get("x-admin-secret");
  const expectedSecret = process.env.ADMIN_SECRET;
  if (expectedSecret && secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      batch,
      batchNumber = 1,
      totalBatches = 1,
    } = body as {
      batch: N8nMessageRow[];
      batchNumber?: number;
      totalBatches?: number;
    };

    if (!Array.isArray(batch) || batch.length === 0) {
      return NextResponse.json(
        { error: "batch must be a non-empty array" },
        { status: 400 }
      );
    }

    // Create batch tracking record
    const batchId = nanoid();
    await db.insert(migrationBatches).values({
      id: batchId,
      source: "n8n",
      entityType: "outreach",
      batchNumber,
      totalInBatch: batch.length,
      status: "processing",
      startedAt: new Date(),
    });

    // Build lookup maps for org IDs → imported company IDs
    // We'll look up by checking legacyData for n8n org references
    // For now, we try to match via recipient_organization_id stored in legacyData
    const orgIdToCompanyId = new Map<string, string>();

    let imported = 0;
    let skipped = 0;
    let errors = 0;
    const errorDetails: Array<{ sourceId: string; error: string }> = [];

    for (const row of batch) {
      const sourceId = row.message_id || nanoid();

      try {
        // Check if already imported (idempotent)
        const existing = await db
          .select({ id: importedOutreach.id })
          .from(importedOutreach)
          .where(eq(importedOutreach.sourceId, sourceId))
          .limit(1);

        if (existing.length > 0) {
          skipped++;
          continue;
        }

        // Try to resolve company from recipient_organization_id
        let companyId: string | null = null;
        const recipientOrgId = row.recipient_organization_id;
        if (recipientOrgId) {
          // Check cache first
          if (orgIdToCompanyId.has(recipientOrgId)) {
            companyId = orgIdToCompanyId.get(recipientOrgId) || null;
          } else {
            // Try to find the imported company that has this n8n org ID in its legacy data
            // This is a simplified lookup — in practice the n8n graph_organization_id links orgs to companies
            const match = await db
              .select({ id: importedCompanies.id })
              .from(importedCompanies)
              .where(
                eq(
                  importedCompanies.sourceId,
                  recipientOrgId
                )
              )
              .limit(1);
            if (match.length > 0) {
              companyId = match[0].id;
              orgIdToCompanyId.set(recipientOrgId, companyId);
            } else {
              orgIdToCompanyId.set(recipientOrgId, "");
            }
          }
        }

        // Try to resolve contact from recipient_user_id
        let contactId: string | null = null;
        if (row.recipient_user_id) {
          const contactMatch = await db
            .select({ id: importedContacts.id })
            .from(importedContacts)
            .where(eq(importedContacts.sourceId, row.recipient_user_id))
            .limit(1);
          if (contactMatch.length > 0) {
            contactId = contactMatch[0].id;
          }
        }

        // Determine direction
        const direction = row.sender_organization_id ? "outbound" : "inbound";

        await db.insert(importedOutreach).values({
          id: nanoid(),
          sourceId,
          source: "n8n",
          companyId,
          contactId,
          messageType: row.message_type || null,
          messageModule: row.message_module || null,
          message: row.message || null,
          direction,
          senderOrgId: row.sender_organization_id || null,
          recipientOrgId: row.recipient_organization_id || null,
          opportunityTitle: row.opportunity_title || null,
          sentAt: row.created_at ? new Date(row.created_at) : null,
          meta: {
            source: "n8n",
            migratedAt: new Date().toISOString(),
            originalCreatedAt: row.created_at,
            ingestedAt: row.ingested_at,
            profilesCount: row.profiles_count,
            caseStudiesCount: row.case_studies_count,
          },
          legacyData: { ...row },
        });

        imported++;
      } catch (err) {
        errors++;
        errorDetails.push({
          sourceId,
          error: err instanceof Error ? err.message : "Unknown error",
        });
        console.error(
          `[ImportOutreach] Error importing message ${sourceId}:`,
          err
        );
      }
    }

    // Update batch tracking
    await db
      .update(migrationBatches)
      .set({
        imported,
        skipped,
        errors,
        errorDetails: errorDetails.length > 0 ? errorDetails : null,
        status: errors > 0 && imported === 0 ? "failed" : "complete",
        completedAt: new Date(),
      })
      .where(eq(migrationBatches.id, batchId));

    return NextResponse.json({
      success: true,
      batchId,
      batchNumber,
      totalBatches,
      imported,
      skipped,
      errors,
      total: batch.length,
    });
  } catch (error) {
    console.error("[ImportOutreach] Failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
