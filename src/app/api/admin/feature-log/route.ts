/**
 * GET  /api/admin/feature-log — List entries (filter by category, search, limit)
 * POST /api/admin/feature-log — Create entry (admin session OR INTERNAL_API_KEY for CI)
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import crypto from "crypto";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { featureLog } from "@/lib/db/schema";
import { desc, eq, ilike, or, and, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function isAuthorized(req: NextRequest): Promise<{ authorized: boolean; user?: string }> {
  // Check for internal API key (CI/CD)
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const key = authHeader.slice(7);
    if (key && key === process.env.INTERNAL_API_KEY) {
      return { authorized: true, user: "ci-bot" };
    }
  }

  // Check admin secret header
  const adminSecret = req.headers.get("x-admin-secret");
  if (adminSecret && adminSecret === process.env.ADMIN_SECRET) {
    return { authorized: true, user: "admin-api" };
  }

  // Check session
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (session?.user && (session.user.role === "superadmin" || session.user.role === "admin")) {
      return { authorized: true, user: session.user.name ?? session.user.email ?? "admin" };
    }
  } catch { /* no session */ }

  return { authorized: false };
}

export async function GET(req: NextRequest) {
  const { authorized } = await isAuthorized(req);
  if (!authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const url = req.nextUrl;
    const category = url.searchParams.get("category");
    const search = url.searchParams.get("search");
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "200"), 500);

    const conditions = [];
    if (category && category !== "all") {
      conditions.push(eq(featureLog.category, category as "feature" | "enhancement" | "fix" | "infrastructure" | "docs"));
    }
    if (search) {
      conditions.push(
        or(
          ilike(featureLog.title, `%${search}%`),
          ilike(featureLog.description, `%${search}%`)
        )
      );
    }

    const entries = await db
      .select()
      .from(featureLog)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(featureLog.createdAt))
      .limit(limit);

    // Category counts
    const counts = await db
      .select({
        category: featureLog.category,
        count: sql<number>`count(*)::int`,
      })
      .from(featureLog)
      .groupBy(featureLog.category);

    const countMap: Record<string, number> = {};
    let total = 0;
    for (const c of counts) {
      countMap[c.category] = c.count;
      total += c.count;
    }

    return NextResponse.json({
      entries,
      total,
      counts: countMap,
    });
  } catch (error) {
    console.error("[FeatureLog] List error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { authorized, user } = await isAuthorized(req);
  if (!authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const { title, description, category, loggedBy, prNumber, commitHash, createdAt } = body;

    if (!title || typeof title !== "string" || title.trim().length < 2) {
      return NextResponse.json({ error: "Title required (min 2 chars)" }, { status: 400 });
    }

    const id = `fl_${crypto.randomBytes(8).toString("hex")}`;

    await db.insert(featureLog).values({
      id,
      title: title.trim(),
      description: (description ?? "").trim(),
      category: category ?? "feature",
      loggedBy: loggedBy ?? user ?? "",
      prNumber: prNumber ? parseInt(String(prNumber)) : null,
      commitHash: commitHash ?? null,
      createdAt: createdAt ? new Date(createdAt) : new Date(),
    });

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error("[FeatureLog] Create error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
