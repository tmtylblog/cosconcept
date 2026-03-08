import { NextRequest, NextResponse } from "next/server";
import { runLegacyMigration } from "@/lib/neo4j-migrate-legacy";

/**
 * POST /api/admin/neo4j/migrate
 *
 * Runs the legacy data migration from JSON files into Neo4j.
 * Protected by ADMIN_SECRET header.
 *
 * Body (optional): { "steps": [1, 2, 3, 4, 5] }
 * Omit steps to run all 5. Specify array to run only certain steps.
 */
export async function POST(req: NextRequest) {
  // Verify admin secret
  const secret = req.headers.get("x-admin-secret");
  const expectedSecret = process.env.ADMIN_SECRET;
  if (!expectedSecret || secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let steps: number[] | undefined;
    try {
      const body = await req.json();
      if (body.steps && Array.isArray(body.steps)) {
        steps = body.steps;
      }
    } catch {
      // No body or invalid JSON — run all steps
    }

    const result = await runLegacyMigration(steps);

    return NextResponse.json({
      success: true,
      migration: result,
    });
  } catch (error) {
    console.error("[Migration API] Failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
