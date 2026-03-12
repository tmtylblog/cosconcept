import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { importedCompanies, importedContacts } from "@/lib/db/schema";
import { eq, isNull, sql } from "drizzle-orm";
import { neo4jWrite } from "@/lib/neo4j";

/**
 * POST /api/admin/import/sync-graph
 *
 * Syncs imported companies and contacts to the Neo4j knowledge graph.
 * Creates Company and Person nodes with appropriate edges.
 * Protected by superadmin session or ADMIN_SECRET header.
 *
 * Body: {
 *   entityType: "companies" | "contacts",
 *   limit?: number (default 250),
 *   offset?: number (default 0)
 * }
 *
 * Uses MERGE (upsert) so it's safe to run multiple times.
 */

export const dynamic = "force-dynamic";

const BATCH_SIZE = 100;

export async function POST(req: NextRequest) {
  // Accept superadmin session OR legacy ADMIN_SECRET header
  const secret = req.headers.get("x-admin-secret");
  const expectedSecret = process.env.ADMIN_SECRET;
  const secretOk = expectedSecret && secret === expectedSecret;

  if (!secretOk) {
    try {
      const headersList = await headers();
      const session = await auth.api.getSession({ headers: headersList });
      if (!session?.user || session.user.role !== "superadmin") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const body = await req.json();
    const {
      entityType = "companies",
      limit = 250,
    } = body as {
      entityType?: "companies" | "contacts";
      limit?: number;
    };

    if (entityType === "companies") {
      return await syncCompanies(limit);
    } else if (entityType === "contacts") {
      return await syncContacts(limit);
    } else {
      return NextResponse.json(
        { error: "entityType must be 'companies' or 'contacts'" },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("[SyncGraph] Failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

async function syncCompanies(limit: number) {
  // Get companies not yet synced to graph
  const companies = await db
    .select()
    .from(importedCompanies)
    .where(isNull(importedCompanies.graphNodeId))
    .limit(limit);

  if (companies.length === 0) {
    return NextResponse.json({
      success: true,
      message: "No companies to sync",
      synced: 0,
      remaining: 0,
    });
  }

  let synced = 0;
  let errors = 0;

  // Process in batches
  for (let i = 0; i < companies.length; i += BATCH_SIZE) {
    const batch = companies.slice(i, i + BATCH_SIZE);

    const items = batch.map((c) => ({
      sourceId: c.sourceId,
      source: c.source,
      name: c.name,
      domain: c.domain,
      industry: c.industry,
      location: c.location,
      country: c.country,
      size: c.size,
      foundedYear: c.foundedYear,
      linkedinUrl: c.linkedinUrl,
      websiteUrl: c.websiteUrl,
      revenue: c.revenue,
      isIcp: c.isIcp,
      icpClassification: c.icpClassification,
      lastResearchedAt:
        c.meta && typeof c.meta === "object" && "lastResearchedAt" in c.meta
          ? (c.meta as { lastResearchedAt?: string }).lastResearchedAt
          : null,
    }));

    try {
      // MERGE Company nodes
      const result = await neo4jWrite<{ sourceId: string; nodeId: string }>(
        `
        UNWIND $items AS item
        MERGE (c:Company {sourceId: item.sourceId, source: item.source})
        SET c.name = item.name,
            c.domain = item.domain,
            c.industry = item.industry,
            c.location = item.location,
            c.country = item.country,
            c.size = item.size,
            c.foundedYear = item.foundedYear,
            c.linkedinUrl = item.linkedinUrl,
            c.websiteUrl = item.websiteUrl,
            c.revenue = item.revenue,
            c.isIcp = item.isIcp,
            c.icpClassification = item.icpClassification,
            c.lastResearchedAt = item.lastResearchedAt,
            c.updatedAt = datetime()
        RETURN item.sourceId AS sourceId, elementId(c) AS nodeId
        `,
        { items }
      );

      // Update Postgres with graph node IDs
      for (const record of result) {
        await db
          .update(importedCompanies)
          .set({
            graphNodeId: record.nodeId,
            updatedAt: new Date(),
          })
          .where(eq(importedCompanies.sourceId, record.sourceId));
        synced++;
      }
    } catch (err) {
      errors += batch.length;
      console.error("[SyncGraph] Batch error syncing companies:", err);
    }
  }

  // Count remaining
  const remaining = await db
    .select({ count: sql<number>`count(*)` })
    .from(importedCompanies)
    .where(isNull(importedCompanies.graphNodeId));

  return NextResponse.json({
    success: true,
    synced,
    errors,
    remaining: Number(remaining[0]?.count || 0),
    total: companies.length,
  });
}

async function syncContacts(limit: number) {
  // Get contacts not yet synced to graph
  const contacts = await db
    .select({
      id: importedContacts.id,
      sourceId: importedContacts.sourceId,
      source: importedContacts.source,
      name: importedContacts.name,
      firstName: importedContacts.firstName,
      lastName: importedContacts.lastName,
      email: importedContacts.email,
      title: importedContacts.title,
      linkedinUrl: importedContacts.linkedinUrl,
      city: importedContacts.city,
      state: importedContacts.state,
      country: importedContacts.country,
      expertClassification: importedContacts.expertClassification,
      companyId: importedContacts.companyId,
      // Get linked company's graph node
      companyGraphNodeId: importedCompanies.graphNodeId,
      companySourceId: importedCompanies.sourceId,
    })
    .from(importedContacts)
    .leftJoin(
      importedCompanies,
      eq(importedContacts.companyId, importedCompanies.id)
    )
    .where(isNull(importedContacts.graphNodeId))
    .limit(limit);

  if (contacts.length === 0) {
    return NextResponse.json({
      success: true,
      message: "No contacts to sync",
      synced: 0,
      remaining: 0,
    });
  }

  let synced = 0;
  let errors = 0;

  for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
    const batch = contacts.slice(i, i + BATCH_SIZE);

    const items = batch.map((c) => ({
      sourceId: c.sourceId,
      source: c.source,
      name: c.name || [c.firstName, c.lastName].filter(Boolean).join(" ") || "Unknown",
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      title: c.title,
      linkedinUrl: c.linkedinUrl,
      city: c.city,
      state: c.state,
      country: c.country,
      expertClassification: c.expertClassification,
      companySourceId: c.companySourceId,
    }));

    try {
      // MERGE Person:Contact nodes — Contact = imported external contact from n8n
      const result = await neo4jWrite<{ sourceId: string; nodeId: string }>(
        `
        UNWIND $items AS item
        MERGE (p:Person {sourceId: item.sourceId, source: item.source})
        SET p.personTypes = CASE WHEN p.personTypes IS NULL THEN ['contact'] WHEN NOT 'contact' IN p.personTypes THEN p.personTypes + ['contact'] ELSE p.personTypes END,
            p.name = item.name,
            p.firstName = item.firstName,
            p.lastName = item.lastName,
            p.email = item.email,
            p.title = item.title,
            p.linkedinUrl = item.linkedinUrl,
            p.city = item.city,
            p.state = item.state,
            p.country = item.country,
            p.expertClassification = item.expertClassification,
            p.updatedAt = datetime()
        WITH p, item
        // Link to Company if exists
        OPTIONAL MATCH (c:Company {sourceId: item.companySourceId, source: 'n8n'})
        FOREACH (_ IN CASE WHEN c IS NOT NULL THEN [1] ELSE [] END |
          MERGE (p)-[:WORKS_AT]->(c)
        )
        RETURN item.sourceId AS sourceId, elementId(p) AS nodeId
        `,
        { items }
      );

      // Update Postgres with graph node IDs
      for (const record of result) {
        await db
          .update(importedContacts)
          .set({
            graphNodeId: record.nodeId,
            updatedAt: new Date(),
          })
          .where(eq(importedContacts.sourceId, record.sourceId));
        synced++;
      }
    } catch (err) {
      errors += batch.length;
      console.error("[SyncGraph] Batch error syncing contacts:", err);
    }
  }

  // Count remaining
  const remaining = await db
    .select({ count: sql<number>`count(*)` })
    .from(importedContacts)
    .where(isNull(importedContacts.graphNodeId));

  return NextResponse.json({
    success: true,
    synced,
    errors,
    remaining: Number(remaining[0]?.count || 0),
    total: contacts.length,
  });
}
