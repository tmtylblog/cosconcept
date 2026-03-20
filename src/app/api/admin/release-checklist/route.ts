/**
 * GET  /api/admin/release-checklist — Scan all docs, extract Release Scope sections
 * PUT  /api/admin/release-checklist — Toggle a checkbox item in a doc
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

const DOCS_ROOT = path.resolve(process.cwd(), "docs");

interface ChecklistItem {
  text: string;
  checked: boolean;
  lineIndex: number; // line number in the original file (for toggling)
}

interface WorkTrack {
  filePath: string; // relative to project root
  title: string;
  items: ChecklistItem[];
  checkedCount: number;
  totalCount: number;
}

/** Extract title from first # heading */
function extractTitle(content: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? "Untitled";
}

/** Extract Release Scope section and parse checkbox items */
function extractReleaseScope(content: string, filePath: string): WorkTrack | null {
  const lines = content.split("\n");
  let inReleaseScope = false;
  const items: ChecklistItem[] = [];
  let sectionFound = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h2Match = line.match(/^##\s+(.+)$/);

    if (h2Match) {
      const heading = h2Match[1].trim().toLowerCase();
      if (heading === "release scope" || heading.startsWith("release scope") || heading === "release checklist") {
        inReleaseScope = true;
        sectionFound = true;
        continue;
      } else if (inReleaseScope) {
        // Hit next H2, stop
        break;
      }
    }

    if (inReleaseScope) {
      const checkMatch = line.match(/^(\s*)-\s+\[([ x])\]\s+(.+)$/);
      if (checkMatch) {
        items.push({
          text: checkMatch[3].trim(),
          checked: checkMatch[2] === "x",
          lineIndex: i,
        });
      }
    }
  }

  if (!sectionFound) return null;

  const title = extractTitle(content);
  const checkedCount = items.filter((i) => i.checked).length;

  return {
    filePath,
    title,
    items,
    checkedCount,
    totalCount: items.length,
  };
}

async function getSession() {
  try {
    const headersList = await headers();
    return await auth.api.getSession({ headers: headersList });
  } catch {
    return null;
  }
}

export async function GET() {
  const session = await getSession();
  if (!session?.user || !["superadmin", "admin"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const workTracks: WorkTrack[] = [];
    const projectRoot = process.cwd();

    // Scan docs/context/ and docs/ root
    const dirs = [
      { dir: path.join(DOCS_ROOT, "context"), prefix: "docs/context" },
      { dir: DOCS_ROOT, prefix: "docs" },
    ];

    for (const { dir, prefix } of dirs) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
          const fullPath = path.join(dir, entry.name);
          const relPath = `${prefix}/${entry.name}`;
          try {
            const content = await fs.readFile(fullPath, "utf-8");
            const track = extractReleaseScope(content, relPath);
            if (track) workTracks.push(track);
          } catch { /* skip unreadable */ }
        }
      } catch { /* dir doesn't exist */ }
    }

    // Sort by most items first
    workTracks.sort((a, b) => b.totalCount - a.totalCount);

    const totalItems = workTracks.reduce((s, t) => s + t.totalCount, 0);
    const totalChecked = workTracks.reduce((s, t) => s + t.checkedCount, 0);

    return NextResponse.json({
      workTracks,
      totalItems,
      totalChecked,
      completionPercent: totalItems > 0 ? Math.round((totalChecked / totalItems) * 100) : 0,
    });
  } catch (error) {
    console.error("[ReleaseChecklist] Error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { filePath, lineIndex, checked } = await req.json();

    if (!filePath || typeof lineIndex !== "number" || typeof checked !== "boolean") {
      return NextResponse.json({ error: "Missing filePath, lineIndex, or checked" }, { status: 400 });
    }

    // Security: prevent path traversal
    const resolved = path.resolve(DOCS_ROOT, filePath.replace(/^docs\//, ""));
    if (!resolved.startsWith(DOCS_ROOT)) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    const content = await fs.readFile(resolved, "utf-8");
    const lines = content.split("\n");

    if (lineIndex < 0 || lineIndex >= lines.length) {
      return NextResponse.json({ error: "Invalid line index" }, { status: 400 });
    }

    // Toggle the checkbox
    const line = lines[lineIndex];
    if (checked) {
      lines[lineIndex] = line.replace("- [ ]", "- [x]");
    } else {
      lines[lineIndex] = line.replace("- [x]", "- [ ]");
    }

    await fs.writeFile(resolved, lines.join("\n"), "utf-8");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[ReleaseChecklist] Toggle error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
