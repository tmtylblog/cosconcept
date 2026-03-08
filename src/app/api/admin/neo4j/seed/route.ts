import { NextRequest, NextResponse } from "next/server";
import { setupNeo4jSchema } from "@/lib/neo4j-schema";
import { seedNeo4jTaxonomy } from "@/lib/neo4j-seed";

/**
 * POST /api/admin/neo4j/seed
 *
 * Admin endpoint to set up Neo4j schema and seed taxonomy data.
 * Protected by ADMIN_SECRET header (bypasses session middleware)
 * or by session cookie (normal admin flow).
 */
export async function POST(req: NextRequest) {
  // Verify admin secret for remote/CLI invocation
  const secret = req.headers.get("x-admin-secret");
  const expectedSecret = process.env.ADMIN_SECRET;
  if (!expectedSecret || secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    // Step 1: Schema
    const schema = await setupNeo4jSchema();

    // Step 2: Seed taxonomy
    const seed = await seedNeo4jTaxonomy();

    return NextResponse.json({
      success: true,
      schema: {
        constraints: schema.constraints,
        indexes: schema.indexes,
        errors: schema.errors,
      },
      seed: {
        categories: seed.categories,
        skillsL1: seed.skillsL1,
        skillsL2: seed.skillsL2,
        skillsL3: seed.skillsL3,
        firmRelationships: seed.firmRelationships,
        markets: seed.markets,
        languages: seed.languages,
        firmTypes: seed.firmTypes,
        industries: seed.industries,
        totalNodes: seed.totalNodes,
        durationMs: seed.durationMs,
        errors: seed.errors,
      },
    });
  } catch (error) {
    console.error("[Neo4j Seed API] Failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
