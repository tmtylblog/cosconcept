import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { randomUUID } from "crypto";

/**
 * GET /api/admin/domain-aliases
 * List all domain aliases with their linked firm names.
 */
export async function GET() {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user || session.user.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await db.execute(sql`
    SELECT da.id, da.domain, da.firm_id AS "firmId", da.note,
           da.created_at AS "createdAt",
           sf.name AS "firmName", sf.website AS "firmWebsite"
    FROM domain_aliases da
    LEFT JOIN service_firms sf ON sf.id = da.firm_id
    ORDER BY da.domain
  `);

  return NextResponse.json({ aliases: result.rows });
}

/**
 * POST /api/admin/domain-aliases
 * Create a new domain alias.
 * Body: { domain: string, firmId: string, note?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user || session.user.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { domain, firmId, note } = body as {
      domain?: string;
      firmId?: string;
      note?: string;
    };

    if (!domain || !firmId) {
      return NextResponse.json(
        { error: "domain and firmId are required" },
        { status: 400 }
      );
    }

    const cleanDomain = domain.trim().toLowerCase().replace(/^www\./, "");

    // Verify firm exists
    const firmCheck = await db.execute(sql`
      SELECT id, name FROM service_firms WHERE id = ${firmId}
    `);
    if (firmCheck.rows.length === 0) {
      return NextResponse.json({ error: "Firm not found" }, { status: 404 });
    }

    const id = randomUUID();
    await db.execute(sql`
      INSERT INTO domain_aliases (id, domain, firm_id, note, created_by, created_at)
      VALUES (${id}, ${cleanDomain}, ${firmId}, ${note ?? null}, ${session.user.id}, NOW())
      ON CONFLICT (domain) DO UPDATE SET firm_id = ${firmId}, note = ${note ?? null}
    `);

    return NextResponse.json({
      ok: true,
      alias: {
        id,
        domain: cleanDomain,
        firmId,
        firmName: (firmCheck.rows[0] as { name: string }).name,
        note,
      },
    });
  } catch (error) {
    console.error("[Admin] Domain alias error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/domain-aliases?id=xxx
 * Remove a domain alias.
 */
export async function DELETE(req: NextRequest) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user || session.user.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    await db.execute(sql`DELETE FROM domain_aliases WHERE id = ${id}`);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Admin] Domain alias delete error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
