/**
 * POST /api/admin/release-checklist/create
 *
 * Creates a new work track doc with the three-section template.
 * Auth: superadmin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

const DOCS_ROOT = path.resolve(process.cwd(), "docs");

export async function POST(req: NextRequest) {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });
    if (!session?.user || session.user.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { name } = await req.json();

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json({ error: "Name required (min 2 chars)" }, { status: 400 });
    }

    // Generate filename from name
    const slug = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const fileName = `${slug}.md`;
    const filePath = path.join(DOCS_ROOT, "context", fileName);
    const relPath = `docs/context/${fileName}`;

    // Check if file already exists
    try {
      await fs.access(filePath);
      return NextResponse.json({ error: `File already exists: ${relPath}` }, { status: 409 });
    } catch {
      // File doesn't exist — good
    }

    // Create the template
    const template = `# ${name.trim()}

## Vision

_Describe the overall vision for this feature area. What problem does it solve? Why does it matter for COS users?_

## Release Scope

_Checklist of items that must be completed before this feature is considered releasable._

- [ ] Define core requirements
- [ ] Implement basic functionality
- [ ] Add API endpoints
- [ ] Build UI components
- [ ] Write tests
- [ ] Update documentation

## Future Ideas

_Captured ideas and enhancements that are not part of the initial release but worth tracking._

- Potential enhancement 1
- Potential enhancement 2
`;

    await fs.writeFile(filePath, template, "utf-8");

    return NextResponse.json({
      success: true,
      filePath: relPath,
      fileName,
    });
  } catch (error) {
    console.error("[ReleaseChecklist] Create error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
