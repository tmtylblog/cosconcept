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
  acqDealContacts,
} from "@/lib/db/schema";
import { eq, desc, asc, and, ilike, or } from "drizzle-orm";
export const dynamic = "force-dynamic";

async function checkAdmin() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  const role = (session.user as Record<string, unknown>).role as string;
  if (!session?.user || !["superadmin", "admin", "growth_ops"].includes(role)) return null;
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

      return NextResponse.json({ ok: true });
    }

    if (body.action === "createDeal") {
      const { name, companyId, stageId, dealValue, priority, notes, source, sourceChannel, linkedinAccountId, outreachEmailAccount, participantName, participantProfileUrl } = body;
      let { contactId } = body;

      // Check for existing deal with same name (prevent duplicates from inbox)
      if (name) {
        const [existingDeal] = await db
          .select({ id: acqDeals.id, name: acqDeals.name })
          .from(acqDeals)
          .where(eq(acqDeals.name, name))
          .limit(1);
        if (existingDeal) {
          return NextResponse.json(
            { error: `A deal named "${name}" already exists`, existingDealId: existingDeal.id },
            { status: 409 }
          );
        }
      }

      // Find or create contact from participant info (when creating from inbox)
      if (!contactId && (participantProfileUrl || participantName)) {
        // Try to find existing contact by LinkedIn URL
        if (participantProfileUrl) {
          const normalized = participantProfileUrl
            .replace(/^https?:\/\//i, "")
            .replace(/^www\./i, "")
            .replace(/\/+$/, "")
            .toLowerCase();
          const [found] = await db
            .select({ id: acqContacts.id })
            .from(acqContacts)
            .where(ilike(acqContacts.linkedinUrl, `%${normalized}%`))
            .limit(1);
          if (found) contactId = found.id;
        }

        // Try name fallback
        if (!contactId && participantName) {
          const parts = participantName.trim().split(/\s+/);
          const firstName = parts[0] ?? "";
          const lastName = parts.slice(1).join(" ");
          if (lastName) {
            const [found] = await db
              .select({ id: acqContacts.id })
              .from(acqContacts)
              .where(and(ilike(acqContacts.firstName, firstName), ilike(acqContacts.lastName, lastName)))
              .limit(1);
            if (found) contactId = found.id;
          }
        }

        // Still no contact — create one
        if (!contactId) {
          const parts = (participantName || "").trim().split(/\s+/);
          const newContactId = randomId();
          await db.insert(acqContacts).values({
            id: newContactId,
            firstName: parts[0] || "Unknown",
            lastName: parts.slice(1).join(" ") || null,
            linkedinUrl: participantProfileUrl || null,
            source: "linkedin",
          });
          contactId = newContactId;
        }
      }

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
        sourceChannel: sourceChannel || null,
        linkedinAccountId: linkedinAccountId || null,
        outreachEmailAccount: outreachEmailAccount || null,
        lastActivityAt: now,
      });

      await db.insert(acqDealActivities).values({
        id: randomId(),
        dealId,
        activityType: "auto_created",
        description: `Deal created from ${source || "manual"}`,
      });

      return NextResponse.json({ dealId });
    }

    if (body.action === "updateDeal") {
      const { dealId, ...fields } = body;

      // Fetch current deal for change detection
      const [oldDeal] = await db.select().from(acqDeals).where(eq(acqDeals.id, dealId)).limit(1);
      if (!oldDeal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

      const updateData: Record<string, unknown> = { updatedAt: now };
      if (fields.name !== undefined) updateData.name = fields.name;
      if (fields.dealValue !== undefined) updateData.dealValue = fields.dealValue;
      if (fields.priority !== undefined) updateData.priority = fields.priority;
      if (fields.notes !== undefined) updateData.notes = fields.notes;
      if (fields.customFields !== undefined) updateData.customFields = fields.customFields;
      if (fields.source !== undefined) updateData.source = fields.source;
      if (fields.sourceChannel !== undefined) updateData.sourceChannel = fields.sourceChannel;
      if (fields.linkedinAccountId !== undefined) updateData.linkedinAccountId = fields.linkedinAccountId || null;
      if (fields.outreachEmailAccount !== undefined) updateData.outreachEmailAccount = fields.outreachEmailAccount || null;
      if (fields.status !== undefined) updateData.status = fields.status;
      if (fields.contactId !== undefined) updateData.contactId = fields.contactId || null;
      if (fields.companyId !== undefined) updateData.companyId = fields.companyId || null;

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

      // Auto-log field changes as activities
      const TRACKABLE: { field: string; label: string; type: string }[] = [
        { field: "name", label: "Deal name", type: "field_change" },
        { field: "dealValue", label: "Deal value", type: "field_change" },
        { field: "priority", label: "Priority", type: "field_change" },
        { field: "source", label: "Source", type: "field_change" },
        { field: "status", label: "Status", type: "field_change" },
        { field: "contactId", label: "Primary contact", type: "field_change" },
        { field: "companyId", label: "Company", type: "field_change" },
        { field: "linkedinAccountId", label: "LinkedIn account", type: "field_change" },
        { field: "outreachEmailAccount", label: "Email account", type: "field_change" },
        { field: "notes", label: "Notes", type: "note_added" },
      ];

      for (const { field, label, type } of TRACKABLE) {
        if (fields[field] === undefined) continue;
        const oldVal = (oldDeal as Record<string, unknown>)[field];
        const newVal = fields[field];
        // Skip if value unchanged
        if (String(oldVal ?? "") === String(newVal ?? "")) continue;
        // For notes, only log if going from empty to non-empty or vice versa (avoid logging every keystroke)
        if (field === "notes") {
          const hadNotes = !!(oldVal as string)?.trim();
          const hasNotes = !!(newVal as string)?.trim();
          if (hadNotes === hasNotes) continue;
        }

        await db.insert(acqDealActivities).values({
          id: randomId(),
          dealId,
          activityType: type,
          description: field === "notes"
            ? (newVal ? "Notes updated" : "Notes cleared")
            : `${label} changed from "${oldVal ?? "none"}" to "${newVal ?? "none"}"`,
          metadata: { field, oldValue: oldVal ?? null, newValue: newVal ?? null },
        });
      }

      // Stage change gets its own dedicated activity type (existing behavior)
      if (fields.stageId !== undefined && fields.stageId !== oldDeal.stageId) {
        await db.insert(acqDealActivities).values({
          id: randomId(),
          dealId,
          activityType: "stage_change",
          description: `Stage changed from "${oldDeal.stageLabel}" to "${updateData.stageLabel}"`,
          metadata: { oldStageId: oldDeal.stageId, newStageId: fields.stageId, oldLabel: oldDeal.stageLabel, newLabel: updateData.stageLabel },
        });
      }

      return NextResponse.json({ ok: true });
    }

    if (body.action === "deleteDeal") {
      const { dealId } = body as { dealId: string };
      // Activities cascade-delete via FK
      await db.delete(acqDeals).where(eq(acqDeals.id, dealId));
      return NextResponse.json({ ok: true });
    }

    if (body.action === "linkCompany") {
      const { dealId, companyId } = body as { dealId: string; companyId: string };
      await db.update(acqDeals).set({ companyId, updatedAt: now }).where(eq(acqDeals.id, dealId));
      await db.insert(acqDealActivities).values({
        id: randomId(),
        dealId,
        activityType: "company_linked",
        description: "Company linked to deal",
      });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "linkContact") {
      const { dealId, contactId, role } = body as { dealId: string; contactId: string; role?: string };
      // Check if already linked
      const [existing] = await db.select().from(acqDealContacts)
        .where(and(eq(acqDealContacts.dealId, dealId), eq(acqDealContacts.contactId, contactId)))
        .limit(1);
      if (!existing) {
        await db.insert(acqDealContacts).values({
          id: randomId(),
          dealId,
          contactId,
          role: role || null,
        });
      }
      // If deal has no primary contactId, set it
      const [deal] = await db.select({ contactId: acqDeals.contactId }).from(acqDeals).where(eq(acqDeals.id, dealId)).limit(1);
      if (deal && !deal.contactId) {
        await db.update(acqDeals).set({ contactId, updatedAt: now }).where(eq(acqDeals.id, dealId));
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === "unlinkContact") {
      const { dealId, contactId } = body as { dealId: string; contactId: string };
      await db.delete(acqDealContacts)
        .where(and(eq(acqDealContacts.dealId, dealId), eq(acqDealContacts.contactId, contactId)));
      // If this was the primary contact, clear it
      const [deal] = await db.select({ contactId: acqDeals.contactId }).from(acqDeals).where(eq(acqDeals.id, dealId)).limit(1);
      if (deal && deal.contactId === contactId) {
        await db.update(acqDeals).set({ contactId: null, updatedAt: now }).where(eq(acqDeals.id, dealId));
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === "searchCompanies") {
      const { query } = body as { query: string };
      if (!query || query.length < 2) return NextResponse.json({ results: [] });
      const results = await db.select({ id: acqCompanies.id, name: acqCompanies.name, domain: acqCompanies.domain, industry: acqCompanies.industry })
        .from(acqCompanies)
        .where(or(ilike(acqCompanies.name, `%${query}%`), ilike(acqCompanies.domain, `%${query}%`)))
        .limit(10);
      return NextResponse.json({ results });
    }

    if (body.action === "searchContacts") {
      const { query } = body as { query: string };
      if (!query || query.length < 2) return NextResponse.json({ results: [] });
      const results = await db.select({ id: acqContacts.id, firstName: acqContacts.firstName, lastName: acqContacts.lastName, email: acqContacts.email, linkedinUrl: acqContacts.linkedinUrl })
        .from(acqContacts)
        .where(or(
          ilike(acqContacts.firstName, `%${query}%`),
          ilike(acqContacts.lastName, `%${query}%`),
          ilike(acqContacts.email, `%${query}%`),
        ))
        .limit(10);
      return NextResponse.json({ results });
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

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

