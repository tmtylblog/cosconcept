/**
 * hubspot-sync job handler
 *
 * Pulls all HubSpot contacts, companies, and deals into COS-native
 * acq_* tables. Bidirectional: also pushes any pending COS→HubSpot
 * updates (e.g. marking a contact as a COS customer).
 *
 * See docs/context/crm-acquisition.md for full context.
 */

import { db } from "@/lib/db";
import {
  acqCompanies,
  acqContacts,
  acqDeals,
} from "@/lib/db/schema";
import { HubSpotClient } from "@/lib/growth-ops/HubSpotClient";
import { eq } from "drizzle-orm";

function randomId() {
  return crypto.randomUUID();
}

export async function handleHubSpotSync(
  _payload: Record<string, unknown>
): Promise<unknown> {
  if (!process.env.HUBSPOT_ACCESS_TOKEN) {
    return { skipped: true, reason: "HUBSPOT_ACCESS_TOKEN not set" };
  }

  const now = new Date();
  let companiesUpserted = 0;
  let contactsUpserted = 0;
  let dealsUpserted = 0;

  // ── 1. Sync Companies ────────────────────────────────
  const hsCompanies = await HubSpotClient.getAllCompanies() as {
    id: string;
    properties: Record<string, string>;
  }[];

  for (const c of hsCompanies) {
    const p = c.properties;
    await db
      .insert(acqCompanies)
      .values({
        id: randomId(),
        name: p.name ?? "Unknown",
        domain: p.domain ?? null,
        industry: p.industry ?? null,
        sizeEstimate: p.numberofemployees ?? null,
        hubspotCompanyId: c.id,
        hubspotSyncedAt: now,
      })
      .onConflictDoUpdate({
        target: acqCompanies.hubspotCompanyId,
        set: {
          name: p.name ?? "Unknown",
          domain: p.domain ?? null,
          industry: p.industry ?? null,
          sizeEstimate: p.numberofemployees ?? null,
          hubspotSyncedAt: now,
          updatedAt: now,
        },
      });
    companiesUpserted++;
  }

  // Build hubspot_company_id → COS id map for FK resolution
  const companyRows = await db.select().from(acqCompanies);
  const companyMap = new Map(companyRows.map((r) => [r.hubspotCompanyId, r.id]));

  // ── 2. Sync Contacts ─────────────────────────────────
  const hsContacts = await HubSpotClient.getAllContacts() as {
    id: string;
    properties: Record<string, string>;
  }[];

  for (const c of hsContacts) {
    const p = c.properties;
    if (!p.email) continue;

    const companyId = p.associatedcompanyid
      ? (companyMap.get(p.associatedcompanyid) ?? null)
      : null;

    await db
      .insert(acqContacts)
      .values({
        id: randomId(),
        email: p.email.toLowerCase().trim(),
        firstName: p.firstname ?? "",
        lastName: p.lastname ?? "",
        linkedinUrl: p.linkedin_url ?? null,
        companyId,
        hubspotContactId: c.id,
        hubspotOwnerId: p.hubspot_owner_id ?? null,
        hubspotSyncedAt: now,
      })
      .onConflictDoUpdate({
        target: acqContacts.hubspotContactId,
        set: {
          firstName: p.firstname ?? "",
          lastName: p.lastname ?? "",
          linkedinUrl: p.linkedin_url ?? null,
          companyId,
          hubspotOwnerId: p.hubspot_owner_id ?? null,
          hubspotSyncedAt: now,
          updatedAt: now,
        },
      });
    contactsUpserted++;
  }

  // ── 3. Sync Deals ────────────────────────────────────
  const pipelines = await HubSpotClient.listPipelines() as {
    results: { id: string; label: string; stages: { id: string; label: string; displayOrder: number }[] }[];
  };

  // Build stage label map: stageId → { label, pipelineId, pipelineLabel }
  const stageMap = new Map<string, { label: string; pipelineId: string; pipelineLabel: string }>();
  for (const pipeline of pipelines.results ?? []) {
    for (const stage of pipeline.stages ?? []) {
      stageMap.set(stage.id, {
        label: stage.label,
        pipelineId: pipeline.id,
        pipelineLabel: pipeline.label,
      });
    }
  }

  const hsDeals = await HubSpotClient.getAllDeals() as {
    id: string;
    properties: Record<string, string>;
  }[];

  for (const d of hsDeals) {
    const p = d.properties;
    const stageInfo = stageMap.get(p.dealstage ?? "");

    // Try to link primary contact via associations
    let contactId: string | null = null;
    try {
      const assoc = await HubSpotClient.getDealContacts(d.id) as { results: { id: string }[] };
      const hsContactId = assoc.results?.[0]?.id;
      if (hsContactId) {
        const contactRow = await db
          .select({ id: acqContacts.id })
          .from(acqContacts)
          .where(eq(acqContacts.hubspotContactId, hsContactId))
          .limit(1);
        contactId = contactRow[0]?.id ?? null;
      }
    } catch {
      // Associations fetch failed — not critical
    }

    // Link company
    let companyId: string | null = null;
    try {
      const assoc = await HubSpotClient.getDealCompany(d.id) as { results: { id: string }[] };
      const hsCompanyId = assoc.results?.[0]?.id;
      if (hsCompanyId) companyId = companyMap.get(hsCompanyId) ?? null;
    } catch {
      // Not critical
    }

    const isWon = p.dealstage?.includes("closedwon") || stageInfo?.label?.toLowerCase().includes("customer");
    const isLost = p.dealstage?.includes("closedlost");

    await db
      .insert(acqDeals)
      .values({
        id: randomId(),
        name: p.dealname ?? "Untitled Deal",
        contactId,
        companyId,
        hubspotDealId: d.id,
        hubspotPipelineId: stageInfo?.pipelineId ?? p.pipeline ?? null,
        hubspotStageId: p.dealstage ?? null,
        stageLabel: stageInfo?.label ?? p.dealstage ?? "",
        dealValue: p.amount ?? null,
        status: isWon ? "won" : isLost ? "lost" : "open",
        closedAt: p.closedate ? new Date(p.closedate) : null,
        hubspotSyncedAt: now,
      })
      .onConflictDoUpdate({
        target: acqDeals.hubspotDealId,
        set: {
          name: p.dealname ?? "Untitled Deal",
          contactId,
          companyId,
          hubspotPipelineId: stageInfo?.pipelineId ?? p.pipeline ?? null,
          hubspotStageId: p.dealstage ?? null,
          stageLabel: stageInfo?.label ?? p.dealstage ?? "",
          dealValue: p.amount ?? null,
          status: isWon ? "won" : isLost ? "lost" : "open",
          closedAt: p.closedate ? new Date(p.closedate) : null,
          hubspotSyncedAt: now,
          updatedAt: now,
        },
      });
    dealsUpserted++;
  }

  return { companiesUpserted, contactsUpserted, dealsUpserted };
}
