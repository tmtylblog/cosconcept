import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  acqDeals,
  acqDealActivities,
  acqPipelineStages,
  acqContacts,
  acqCompanies,
  acqDealSources,
} from "@/lib/db/schema";
import { eq, desc, asc } from "drizzle-orm";
import { HubSpotClient } from "@/lib/growth-ops/HubSpotClient";

export const dynamic = "force-dynamic";

async function checkAdmin() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  if (!session?.user || (session.user as Record<string, unknown>).role !== "superadmin") return null;
  return session;
}

function randomId() {
  return crypto.randomUUID();
}

// GET — stages + deals
export async function GET(req: NextRequest) {
  const session = await checkAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const action = req.nextUrl.searchParams.get("action");

  try {
    if (action === "getStages") {
      const stages = await db
        .select()
        .from(acqPipelineStages)
        .where(eq(acqPipelineStages.pipelineId, "default"))
        .orderBy(asc(acqPipelineStages.displayOrder));
      return NextResponse.json({ stages });
    }

    if (action === "getDeals" || !action) {
      // Get stages
      const stages = await db
        .select()
        .from(acqPipelineStages)
        .where(eq(acqPipelineStages.pipelineId, "default"))
        .orderBy(asc(acqPipelineStages.displayOrder));

      // Get deals with contacts and companies
      const deals = await db
        .select({
          id: acqDeals.id,
          name: acqDeals.name,
          stageId: acqDeals.stageId,
          stageLabel: acqDeals.stageLabel,
          dealValue: acqDeals.dealValue,
          status: acqDeals.status,
          source: acqDeals.source,
          sourceChannel: acqDeals.sourceChannel,
          priority: acqDeals.priority,
          lastActivityAt: acqDeals.lastActivityAt,
          sentimentScore: acqDeals.sentimentScore,
          hubspotDealId: acqDeals.hubspotDealId,
          hubspotStageId: acqDeals.hubspotStageId,
          closedAt: acqDeals.closedAt,
          createdAt: acqDeals.createdAt,
          contactId: acqDeals.contactId,
          contactEmail: acqContacts.email,
          contactFirstName: acqContacts.firstName,
          contactLastName: acqContacts.lastName,
          companyId: acqDeals.companyId,
          companyName: acqCompanies.name,
          companyDomain: acqCompanies.domain,
        })
        .from(acqDeals)
        .leftJoin(acqContacts, eq(acqDeals.contactId, acqContacts.id))
        .leftJoin(acqCompanies, eq(acqDeals.companyId, acqCompanies.id))
        .orderBy(desc(acqDeals.updatedAt));

      return NextResponse.json({ stages, deals });
    }

    if (action === "getDealSources") {
      const sources = await db
        .select()
        .from(acqDealSources)
        .orderBy(asc(acqDealSources.displayOrder));
      return NextResponse.json({ sources });
    }

    if (action === "seedStages") {
      // Fetch HubSpot pipeline stages and seed into COS
      const result = await seedStagesFromHubSpot();
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST — mutations
export async function POST(req: NextRequest) {
  const session = await checkAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const now = new Date();

  try {
    if (body.action === "moveDeal") {
      const { dealId, stageId } = body as { dealId: string; stageId: string };

      // Get stage info
      const [stage] = await db.select().from(acqPipelineStages).where(eq(acqPipelineStages.id, stageId)).limit(1);
      if (!stage) return NextResponse.json({ error: "Stage not found" }, { status: 404 });

      // Get current deal for activity log
      const [deal] = await db.select().from(acqDeals).where(eq(acqDeals.id, dealId)).limit(1);
      if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

      const newStatus = stage.isClosedWon ? "won" : stage.isClosedLost ? "lost" : "open";

      await db
        .update(acqDeals)
        .set({
          stageId,
          stageLabel: stage.label,
          hubspotStageId: stage.hubspotStageId,
          status: newStatus,
          closedAt: (stage.isClosedWon || stage.isClosedLost) ? now : null,
          lastActivityAt: now,
          updatedAt: now,
        })
        .where(eq(acqDeals.id, dealId));

      // Log activity
      await db.insert(acqDealActivities).values({
        id: randomId(),
        dealId,
        activityType: "stage_change",
        description: `Moved from "${deal.stageLabel}" to "${stage.label}"`,
        metadata: { fromStage: deal.stageId, toStage: stageId, fromLabel: deal.stageLabel, toLabel: stage.label },
      });

      // Push to HubSpot if deal has hubspot_deal_id and stage has hubspot_stage_id
      if (deal.hubspotDealId && stage.hubspotStageId && process.env.HUBSPOT_ACCESS_TOKEN) {
        try {
          await HubSpotClient.updateDealStage(deal.hubspotDealId, stage.hubspotStageId);
        } catch (e) {
          console.error("Failed to push stage change to HubSpot:", e);
        }
      }

      return NextResponse.json({ ok: true });
    }

    if (body.action === "createDeal") {
      const { name, contactId, companyId, stageId, dealValue, priority, notes, source } = body;

      const [stage] = stageId
        ? await db.select().from(acqPipelineStages).where(eq(acqPipelineStages.id, stageId)).limit(1)
        : [null];

      const dealId = randomId();
      await db.insert(acqDeals).values({
        id: dealId,
        name: name || "New Deal",
        contactId: contactId || null,
        companyId: companyId || null,
        stageId: stageId || null,
        stageLabel: stage?.label ?? "",
        hubspotStageId: stage?.hubspotStageId ?? null,
        dealValue: dealValue || null,
        priority: priority || "normal",
        notes: notes || null,
        source: source || "manual",
        lastActivityAt: now,
      });

      await db.insert(acqDealActivities).values({
        id: randomId(),
        dealId,
        activityType: "auto_created",
        description: "Deal created manually",
      });

      return NextResponse.json({ dealId });
    }

    if (body.action === "updateDeal") {
      const { dealId, ...fields } = body;
      const updateData: Record<string, unknown> = { updatedAt: now };
      if (fields.name !== undefined) updateData.name = fields.name;
      if (fields.dealValue !== undefined) updateData.dealValue = fields.dealValue;
      if (fields.priority !== undefined) updateData.priority = fields.priority;
      if (fields.notes !== undefined) updateData.notes = fields.notes;
      if (fields.customFields !== undefined) updateData.customFields = fields.customFields;
      if (fields.source !== undefined) updateData.source = fields.source;
      if (fields.sourceChannel !== undefined) updateData.sourceChannel = fields.sourceChannel;
      if (fields.status !== undefined) updateData.status = fields.status;

      // If stageId is being changed, also update stageLabel and log activity
      if (fields.stageId !== undefined) {
        const [stage] = fields.stageId
          ? await db.select().from(acqPipelineStages).where(eq(acqPipelineStages.id, fields.stageId)).limit(1)
          : [null];
        updateData.stageId = fields.stageId || null;
        updateData.stageLabel = stage?.label ?? "";
        updateData.hubspotStageId = stage?.hubspotStageId ?? null;
        if (stage) {
          updateData.status = stage.isClosedWon ? "won" : stage.isClosedLost ? "lost" : "open";
          updateData.closedAt = (stage.isClosedWon || stage.isClosedLost) ? now : null;
        }
        updateData.lastActivityAt = now;
      }

      await db.update(acqDeals).set(updateData).where(eq(acqDeals.id, dealId));
      return NextResponse.json({ ok: true });
    }

    if (body.action === "deleteDeal") {
      const { dealId } = body as { dealId: string };
      // Activities cascade-delete via FK
      await db.delete(acqDeals).where(eq(acqDeals.id, dealId));
      return NextResponse.json({ ok: true });
    }

    if (body.action === "seedStages") {
      const result = await seedStagesFromHubSpot();
      return NextResponse.json(result);
    }

    if (body.action === "configureStages") {
      const { stages } = body as { stages: { id?: string; label: string; displayOrder: number; color: string; isClosedWon?: boolean; isClosedLost?: boolean }[] };

      for (const s of stages) {
        if (s.id) {
          await db
            .update(acqPipelineStages)
            .set({ label: s.label, displayOrder: s.displayOrder, color: s.color, isClosedWon: s.isClosedWon ?? false, isClosedLost: s.isClosedLost ?? false, updatedAt: now })
            .where(eq(acqPipelineStages.id, s.id));
        } else {
          await db.insert(acqPipelineStages).values({
            id: randomId(),
            pipelineId: "default",
            label: s.label,
            displayOrder: s.displayOrder,
            color: s.color,
            isClosedWon: s.isClosedWon ?? false,
            isClosedLost: s.isClosedLost ?? false,
          });
        }
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === "syncFromHubSpot") {
      const { handleHubSpotSync } = await import("@/lib/jobs/handlers/hubspot-sync");
      const result = await handleHubSpotSync({});
      // After sync, backfill stage_id on deals
      await backfillStageIds();
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/** Fetch HubSpot pipeline stages and seed into acq_pipeline_stages */
async function seedStagesFromHubSpot() {
  if (!process.env.HUBSPOT_ACCESS_TOKEN) {
    return { error: "HUBSPOT_ACCESS_TOKEN not set" };
  }

  const pipelines = (await HubSpotClient.listPipelines()) as {
    results: { id: string; label: string; stages: { id: string; label: string; displayOrder: number }[] }[];
  };

  if (!pipelines.results?.length) return { error: "No pipelines found in HubSpot" };

  // Use the "Self Sign Up" pipeline — the primary one
  const pipeline =
    pipelines.results.find(
      (p) =>
        p.label?.toLowerCase().includes("self") ||
        p.label?.toLowerCase().includes("sign up") ||
        p.label?.toLowerCase().includes("signup")
    ) ?? pipelines.results[0];

  const colors = ["#6366f1", "#8b5cf6", "#3b82f6", "#06b6d4", "#10b981", "#22c55e", "#ef4444"];
  let seeded = 0;

  for (const stage of pipeline.stages ?? []) {
    const isWon = stage.id?.includes("closedwon") || stage.label?.toLowerCase().includes("customer");
    const isLost = stage.id?.includes("closedlost") || stage.label?.toLowerCase().includes("lost");

    // Upsert by hubspot_stage_id
    const existing = await db
      .select({ id: acqPipelineStages.id })
      .from(acqPipelineStages)
      .where(eq(acqPipelineStages.hubspotStageId, stage.id))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(acqPipelineStages)
        .set({
          label: stage.label,
          displayOrder: stage.displayOrder,
          isClosedWon: isWon,
          isClosedLost: isLost,
          updatedAt: new Date(),
        })
        .where(eq(acqPipelineStages.id, existing[0].id));
    } else {
      await db.insert(acqPipelineStages).values({
        id: randomId(),
        pipelineId: "default",
        label: stage.label,
        displayOrder: stage.displayOrder,
        hubspotStageId: stage.id,
        isClosedWon: isWon,
        isClosedLost: isLost,
        color: colors[seeded % colors.length],
      });
    }
    seeded++;
  }

  // Build alias map for old pipeline stages → closest Self Sign Up stage
  const seededStages = await db.select().from(acqPipelineStages).where(eq(acqPipelineStages.pipelineId, "default"));
  const aliasMap = new Map<string, string>(); // old hubspot_stage_id → COS stage id

  for (const otherPipeline of pipelines.results) {
    if (otherPipeline.id === pipeline.id) continue; // skip the primary pipeline
    for (const oldStage of otherPipeline.stages ?? []) {
      const match = findClosestStage(oldStage.label, seededStages);
      if (match) aliasMap.set(oldStage.id, match.id);
    }
  }

  // Backfill stage_id on existing deals
  await backfillStageIds(aliasMap);

  return { seeded, pipeline: pipeline.label, aliases: aliasMap.size };
}

/** Find the closest COS stage for an old pipeline stage label */
function findClosestStage(
  oldLabel: string,
  cosStages: { id: string; label: string; displayOrder: number; isClosedWon: boolean; isClosedLost: boolean }[]
) {
  const norm = oldLabel.toLowerCase().trim();

  // Direct label match
  const exact = cosStages.find((s) => s.label.toLowerCase().trim() === norm);
  if (exact) return exact;

  // Keyword mapping: common stage names → logical equivalent
  const keywords: [RegExp, string[]][] = [
    [/prospect|lead|new|awareness/i, ["prospect", "lead"]],
    [/contact|outreach|connect|approach/i, ["contacted", "outreach"]],
    [/qualif|discovery|evaluate/i, ["qualified", "discovery"]],
    [/demo|present|meeting|call/i, ["demo", "presentation", "meeting"]],
    [/proposal|negotiat|quote|offer/i, ["proposal", "negotiation"]],
    [/customer|closed.?won|won|deal.?won|convert/i, ["customer", "closed won"]],
    [/lost|closed.?lost|dead|reject/i, ["lost", "closed lost"]],
  ];

  for (const [pattern, matchLabels] of keywords) {
    if (pattern.test(norm)) {
      const found = cosStages.find((s) =>
        matchLabels.some((ml) => s.label.toLowerCase().includes(ml))
      );
      if (found) return found;
    }
  }

  // Fallback: closed stages map to closed, everything else → first open stage
  if (/close|won|lost|dead/i.test(norm)) {
    return cosStages.find((s) => s.isClosedWon || s.isClosedLost) ?? cosStages[0];
  }

  // Default to first stage (Prospect)
  const sorted = [...cosStages].sort((a, b) => a.displayOrder - b.displayOrder);
  return sorted[0] ?? null;
}

/** Backfill stage_id on acq_deals that have hubspot_stage_id but no stage_id */
async function backfillStageIds(aliasMap?: Map<string, string>) {
  const stages = await db.select().from(acqPipelineStages);
  // Direct hubspot_stage_id → COS stage id
  const stageMap = new Map(stages.filter((s) => s.hubspotStageId).map((s) => [s.hubspotStageId!, s.id]));

  const deals = await db.select({ id: acqDeals.id, hubspotStageId: acqDeals.hubspotStageId }).from(acqDeals);

  for (const deal of deals) {
    if (!deal.hubspotStageId) continue;
    // Try direct match first, then alias
    const cosStageId = stageMap.get(deal.hubspotStageId) ?? aliasMap?.get(deal.hubspotStageId);
    if (cosStageId) {
      await db
        .update(acqDeals)
        .set({ stageId: cosStageId })
        .where(eq(acqDeals.id, deal.id));
    }
  }
}
