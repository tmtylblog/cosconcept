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
  acqPipelineStages,
} from "@/lib/db/schema";
import { HubSpotClient } from "@/lib/growth-ops/HubSpotClient";
import { eq } from "drizzle-orm";

function randomId() {
  return crypto.randomUUID();
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

  // Build COS stage lookup: hubspot_stage_id → COS stage id
  const cosStages = await db.select().from(acqPipelineStages);
  const cosStageMap = new Map(cosStages.map((s) => [s.hubspotStageId, s.id]));

  // Build a mapping for the original pipeline stages to Self Sign-up stages
  // (same-name stages across pipelines should map to the same COS stage)
  const cosStageByLabel = new Map(cosStages.map((s) => [s.label?.toLowerCase().trim(), s.id]));

  // Build contact map for FK resolution by HubSpot contact ID
  const contactRows = await db.select({ id: acqContacts.id, hubspotContactId: acqContacts.hubspotContactId }).from(acqContacts);
  const contactMap = new Map(contactRows.filter((r) => r.hubspotContactId).map((r) => [r.hubspotContactId!, r.id]));

  const hsDeals = await HubSpotClient.getAllDeals() as {
    id: string;
    properties: Record<string, string>;
  }[];

  console.log(`[hubspot-sync] Fetched ${hsDeals.length} deals from HubSpot`);

  // Batch process deals — skip slow per-deal association calls for bulk import
  // Instead, resolve contacts/companies from cached maps
  for (const d of hsDeals) {
    const p = d.properties;
    const stageInfo = stageMap.get(p.dealstage ?? "");

    const isWon = p.dealstage?.includes("closedwon") || stageInfo?.label?.toLowerCase().includes("customer") || stageInfo?.label?.toLowerCase().includes("paid");
    const isLost = p.dealstage?.includes("closedlost") || stageInfo?.label?.toLowerCase().includes("declined") || stageInfo?.label?.toLowerCase().includes("disqualified");

    // Resolve COS pipeline stage: try exact hubspot_stage_id first, then label match
    let cosStageId = cosStageMap.get(p.dealstage ?? "") ?? null;
    if (!cosStageId && stageInfo?.label) {
      cosStageId = cosStageByLabel.get(stageInfo.label.toLowerCase().trim()) ?? null;
    }

    await db
      .insert(acqDeals)
      .values({
        id: randomId(),
        name: p.dealname ?? "Untitled Deal",
        contactId: null,
        companyId: null,
        stageId: cosStageId,
        hubspotDealId: d.id,
        hubspotPipelineId: stageInfo?.pipelineId ?? p.pipeline ?? null,
        hubspotStageId: p.dealstage ?? null,
        stageLabel: stageInfo?.label ?? p.dealstage ?? "",
        dealValue: p.amount ?? null,
        status: isWon ? "won" : isLost ? "lost" : "open",
        source: "hubspot_sync",
        sourceChannel: "hubspot",
        closedAt: p.closedate ? new Date(p.closedate) : null,
        hubspotSyncedAt: now,
      })
      .onConflictDoUpdate({
        target: acqDeals.hubspotDealId,
        set: {
          name: p.dealname ?? "Untitled Deal",
          stageId: cosStageId,
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

  // Second pass: resolve associations for deals that don't have contacts yet
  // Do this in batches with rate limiting to avoid HubSpot throttling
  const dealsWithoutContacts = await db
    .select({ id: acqDeals.id, hubspotDealId: acqDeals.hubspotDealId })
    .from(acqDeals)
    .where(eq(acqDeals.source, "hubspot_sync"));

  let associationsResolved = 0;
  for (const deal of dealsWithoutContacts) {
    if (!deal.hubspotDealId) continue;
    try {
      // Contact association
      const contactAssoc = await HubSpotClient.getDealContacts(deal.hubspotDealId) as { results: { id: string }[] };
      const hsContactId = contactAssoc.results?.[0]?.id;
      const contactId = hsContactId ? (contactMap.get(hsContactId) ?? null) : null;

      // Company association
      const companyAssoc = await HubSpotClient.getDealCompany(deal.hubspotDealId) as { results: { id: string }[] };
      const hsCompanyId = companyAssoc.results?.[0]?.id;
      const companyId = hsCompanyId ? (companyMap.get(hsCompanyId) ?? null) : null;

      if (contactId || companyId) {
        const updates: Record<string, unknown> = {};
        if (contactId) updates.contactId = contactId;
        if (companyId) updates.companyId = companyId;
        await db.update(acqDeals).set(updates).where(eq(acqDeals.id, deal.id));
        associationsResolved++;
      }
    } catch {
      // Skip failed association lookups
    }

    // Rate limit: HubSpot allows 100 requests per 10 seconds
    if (associationsResolved % 10 === 0) await delay(2000);
    else await delay(200);
  }

  return { companiesUpserted, contactsUpserted, dealsUpserted, associationsResolved };
}
