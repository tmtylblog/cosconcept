import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  getMemoryStats,
  getMemoryEntriesByTheme,
  deleteMemoryEntry,
  deleteMemoryTheme,
  deleteAllMemories,
} from "@/lib/ai/memory-retriever";

/**
 * GET /api/memory — Get memory stats and entries for the current user
 * Query params:
 *   ?theme=<theme> — Get entries for a specific theme
 *   (no params) — Get overview stats for all themes
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const theme = req.nextUrl.searchParams.get("theme");

  if (theme) {
    const entries = await getMemoryEntriesByTheme(session.user.id, theme);
    return NextResponse.json({ theme, entries });
  }

  const stats = await getMemoryStats(session.user.id);
  return NextResponse.json(stats);
}

/**
 * DELETE /api/memory — Delete memories
 * Body:
 *   { entryId: "..." } — Delete a specific entry
 *   { theme: "..." } — Delete all entries for a theme
 *   { all: true } — Delete ALL memories
 */
export async function DELETE(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  if (body.all === true) {
    const count = await deleteAllMemories(session.user.id);
    return NextResponse.json({ deleted: count, scope: "all" });
  }

  if (body.theme) {
    const count = await deleteMemoryTheme(session.user.id, body.theme);
    return NextResponse.json({ deleted: count, scope: "theme", theme: body.theme });
  }

  if (body.entryId) {
    const success = await deleteMemoryEntry(session.user.id, body.entryId);
    return NextResponse.json({ deleted: success ? 1 : 0, scope: "entry", entryId: body.entryId });
  }

  return NextResponse.json(
    { error: "Provide entryId, theme, or all: true" },
    { status: 400 }
  );
}
