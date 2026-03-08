/**
 * Verify the Neo4j migration by counting all node types and relationship types.
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

async function main() {
  const { neo4jRead } = await import("../src/lib/neo4j");

  console.log("=== Neo4j Migration Verification ===\n");

  // Count all node labels
  const labelCounts = await neo4jRead<{ label: string; count: number }>(
    `CALL db.labels() YIELD label
     CALL apoc.cypher.run('MATCH (n:' + label + ') RETURN count(n) as count', {}) YIELD value
     RETURN label, value.count as count
     ORDER BY value.count DESC`
  );

  // If APOC is not available, fall back to simpler queries
  if (labelCounts.length === 0) {
    // Manual label counts
    const labels = [
      "Skill", "SkillL1", "LegacySkill", "Category", "ProfessionalService",
      "Industry", "Market", "Language", "FirmType", "FirmRelationship",
      "Organization", "Company", "User", "CaseStudy", "OrgService",
      "Opportunity", "PartnershipPreferences", "WorkHistory",
      "MatchRecommendation", "MatchActivity"
    ];

    for (const label of labels) {
      const result = await neo4jRead<{ count: { low: number } }>(
        `MATCH (n:${label}) RETURN count(n) as count`
      );
      const count = result[0]?.count?.low ?? result[0]?.count ?? 0;
      if (count > 0) {
        console.log(`  ${label}: ${count}`);
      }
    }
  } else {
    for (const row of labelCounts) {
      console.log(`  ${row.label}: ${row.count}`);
    }
  }

  // Count all relationship types
  console.log("\n--- Relationship Types ---");
  const relTypes = [
    "BELONGS_TO", "BELONGS_TO_CATEGORY", "OPERATES_IN_INDUSTRY", "IN_CATEGORY",
    "LOCATED_IN", "HAS_CLIENT", "OWNED_BY", "AUTHORED_BY",
    "BELONGS_TO_INDUSTRY", "DEMONSTRATES_SKILL", "TARGETS_MARKET",
    "FEATURES_CLIENT", "HAS_PREFERENCES", "HAS_SKILL",
    "HAS_INDUSTRY_EXPERIENCE", "HAS_MARKET_EXPERIENCE", "SPEAKS",
    "HAS_WORK_HISTORY", "WORKED_AT", "MATCHED", "RESPONDED_TO",
    "FOR_RECOMMENDATION", "PARTNERS_WITH"
  ];

  for (const type of relTypes) {
    const result = await neo4jRead<{ count: { low: number } }>(
      `MATCH ()-[r:${type}]->() RETURN count(r) as count`
    );
    const count = result[0]?.count?.low ?? result[0]?.count ?? 0;
    if (count > 0) {
      console.log(`  ${type}: ${count}`);
    }
  }

  // Total node count
  console.log("\n--- Totals ---");
  const totalNodes = await neo4jRead<{ count: { low: number } }>(
    `MATCH (n) RETURN count(n) as count`
  );
  const totalRels = await neo4jRead<{ count: { low: number } }>(
    `MATCH ()-[r]->() RETURN count(r) as count`
  );

  const nc = totalNodes[0]?.count;
  const rc = totalRels[0]?.count;
  console.log(`  Total nodes: ${typeof nc === 'object' ? nc.low : nc}`);
  console.log(`  Total relationships: ${typeof rc === 'object' ? rc.low : rc}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
