/**
 * GET  /api/admin/docs          — List all docs (categorized)
 * GET  /api/admin/docs?file=... — Read a specific doc
 * PUT  /api/admin/docs?file=... — Save edited content (superadmin only)
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

const DOCS_ROOT = path.resolve(process.cwd(), "docs");

/** Extract title from first # heading in markdown */
function extractTitle(content: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? "Untitled";
}

/** Prettify filename for display */
function prettifyName(filename: string): string {
  return filename
    .replace(/\.md$/, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function getSession() {
  try {
    const headersList = await headers();
    return await auth.api.getSession({ headers: headersList });
  } catch {
    return null;
  }
}

interface DocFile {
  path: string;
  title: string;
  name: string;
  size: number;
}

interface DocCategory {
  name: string;
  key: string;
  files: DocFile[];
}

async function scanDocsDir(dir: string, relativeTo: string): Promise<DocFile[]> {
  const files: DocFile[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(relativeTo, fullPath).replace(/\\/g, "/");
      try {
        const content = await fs.readFile(fullPath, "utf-8");
        const stat = await fs.stat(fullPath);
        files.push({
          path: relPath,
          title: extractTitle(content),
          name: entry.name,
          size: stat.size,
        });
      } catch {
        // Skip unreadable files
      }
    }
  } catch {
    // Directory doesn't exist
  }
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user || !["superadmin", "admin"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const fileParam = req.nextUrl.searchParams.get("file");

  // Read a specific file
  if (fileParam) {
    // Security: prevent path traversal
    const resolved = path.resolve(DOCS_ROOT, fileParam.replace(/^docs\//, ""));
    if (!resolved.startsWith(DOCS_ROOT)) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    try {
      const content = await fs.readFile(resolved, "utf-8");
      return NextResponse.json({
        path: fileParam,
        title: extractTitle(content),
        content,
      });
    } catch {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
  }

  // List all docs categorized
  const projectRoot = process.cwd();
  const categories: DocCategory[] = [];

  // Product docs (root docs/)
  const rootFiles = await scanDocsDir(DOCS_ROOT, projectRoot);
  if (rootFiles.length > 0) {
    categories.push({ name: "Product Docs", key: "product", files: rootFiles });
  }

  // Context files (docs/context/)
  const contextFiles = await scanDocsDir(path.join(DOCS_ROOT, "context"), projectRoot);
  if (contextFiles.length > 0) {
    categories.push({ name: "Context Files", key: "context", files: contextFiles });
  }

  // Session notes (docs/sessions/)
  const sessionFiles = await scanDocsDir(path.join(DOCS_ROOT, "sessions"), projectRoot);
  if (sessionFiles.length > 0) {
    categories.push({ name: "Session Notes", key: "sessions", files: sessionFiles });
  }

  // Email templates
  const emailFiles = await scanDocsDir(path.join(DOCS_ROOT, "email-templates"), projectRoot);
  if (emailFiles.length > 0) {
    categories.push({ name: "Email Templates", key: "email-templates", files: emailFiles });
  }

  const totalFiles = categories.reduce((sum, c) => sum + c.files.length, 0);

  return NextResponse.json({ categories, totalFiles });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden — superadmin only" }, { status: 403 });
  }

  const fileParam = req.nextUrl.searchParams.get("file");
  if (!fileParam) {
    return NextResponse.json({ error: "Missing file param" }, { status: 400 });
  }

  // Security: prevent path traversal
  const resolved = path.resolve(DOCS_ROOT, fileParam.replace(/^docs\//, ""));
  if (!resolved.startsWith(DOCS_ROOT)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const content = body.content;
    if (typeof content !== "string") {
      return NextResponse.json({ error: "Missing content" }, { status: 400 });
    }

    await fs.writeFile(resolved, content, "utf-8");
    return NextResponse.json({ success: true, path: fileParam });
  } catch (error) {
    console.error("[Docs] Save error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
