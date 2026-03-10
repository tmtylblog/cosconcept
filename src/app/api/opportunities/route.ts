/**
 * Opportunities API — CRUD
 *
 * Opportunities are private intelligence — AI-extracted signals from calls/emails.
 * They are NOT shared with partners directly. Promote to a Lead to share.
 *
 * GET  /api/opportunities?firmId=xxx             — List firm's opportunities
 * POST /api/opportunities                        — Create opportunity manually
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { opportunities } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const firmId = new URL(req.url).searchParams.get("firmId");
  if (!firmId) {
    return NextResponse.json({ error: "firmId is required" }, { status: 400 });
  }

  const rows = await db
    .select()
    .from(opportunities)
    .where(eq(opportunities.firmId, firmId))
    .orderBy(desc(opportunities.createdAt));

  return NextResponse.json({ opportunities: rows });
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    firmId,
    title,
    description,
    evidence,
    signalType = "direct",
    priority = "medium",
    resolutionApproach = "network",
    requiredCategories = [],
    requiredSkills = [],
    requiredIndustries = [],
    requiredMarkets = [],
    estimatedValue,
    timeline,
    clientDomain,
    clientName,
    anonymizeClient = false,
    clientSizeBand,
    source = "manual",
    sourceId,
    attachments = [],
  } = body;

  if (!firmId || !title) {
    return NextResponse.json({ error: "firmId and title are required" }, { status: 400 });
  }

  const id = generateId("opp");

  await db.insert(opportunities).values({
    id,
    firmId,
    createdBy: session.user.id,
    title,
    description: description ?? null,
    evidence: evidence ?? null,
    signalType,
    priority,
    resolutionApproach,
    requiredCategories,
    requiredSkills,
    requiredIndustries,
    requiredMarkets,
    estimatedValue: estimatedValue ?? null,
    timeline: timeline ?? null,
    clientDomain: clientDomain ?? null,
    clientName: clientName ?? null,
    anonymizeClient,
    clientSizeBand: clientSizeBand ?? null,
    source,
    sourceId: sourceId ?? null,
    attachments,
    status: "new",
  });

  return NextResponse.json({ opportunity: { id, title, status: "new" } }, { status: 201 });
}
