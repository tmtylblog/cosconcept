import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user || session.user.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId } = await params;
  const url = new URL(req.url);
  const typeFilter = url.searchParams.get("type") ?? "all";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
  const offset = (page - 1) * limit;

  try {
    const parts: string[] = [];

    if (typeFilter === "all" || typeFilter === "conversation") {
      parts.push(`
        SELECT
          'conversation' AS type,
          c.created_at AS timestamp,
          COALESCE(c.title, 'Untitled conversation') AS title,
          c.mode AS detail,
          jsonb_build_object('conversationId', c.id, 'mode', c.mode) AS metadata
        FROM conversations c
        WHERE c.user_id = '${userId}'
      `);
    }

    if (typeFilter === "all" || typeFilter === "ai_usage") {
      parts.push(`
        SELECT
          'ai_usage' AS type,
          a.created_at AS timestamp,
          a.feature || ' (' || a.model || ')' AS title,
          COALESCE(a.input_tokens::text, '0') || ' in / ' || COALESCE(a.output_tokens::text, '0') || ' out · $' || COALESCE(ROUND(a.cost_usd::numeric, 4)::text, '0') AS detail,
          jsonb_build_object('model', a.model, 'feature', a.feature, 'cost', a.cost_usd) AS metadata
        FROM ai_usage_log a
        WHERE a.user_id = '${userId}'
      `);
    }

    if (typeFilter === "all" || typeFilter === "onboarding") {
      parts.push(`
        SELECT
          'onboarding' AS type,
          o.created_at AS timestamp,
          o.stage AS title,
          o.event AS detail,
          COALESCE(o.metadata, '{}'::jsonb) AS metadata
        FROM onboarding_events o
        WHERE o.user_id = '${userId}'
      `);
    }

    if (parts.length === 0) {
      return NextResponse.json({ events: [], hasMore: false });
    }

    const unionQuery = parts.join(" UNION ALL ");
    const fullQuery = `
      SELECT * FROM (${unionQuery}) AS combined
      ORDER BY timestamp DESC
      LIMIT ${limit + 1} OFFSET ${offset}
    `;

    const result = await db.execute(sql.raw(fullQuery));
    const hasMore = result.rows.length > limit;
    const events = result.rows.slice(0, limit);

    return NextResponse.json({ events, hasMore });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "Failed to fetch activity", detail: message }, { status: 500 });
  }
}
