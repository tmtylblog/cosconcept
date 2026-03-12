/**
 * POST /api/admin/import/migrate-legacy-graph
 *
 * Migrates legacy CORE Organization data → COS ServiceFirm structure in Neo4j.
 *
 * The legacy import created Organization nodes with edges like OPERATES_IN_INDUSTRY,
 * LOCATED_IN, IN_CATEGORY. COS search expects ServiceFirm nodes with HAS_SKILL,
 * SERVES_INDUSTRY, OPERATES_IN, IN_CATEGORY, and PREFERS edges.
 *
 * All 1,449 ServiceFirm nodes have `legacyOrgId` matching Organization `legacyId`.
 *
 * Steps:
 * 1. Set isCosCustomer flag on ServiceFirm nodes
 * 2. Copy missing properties (about → description, linkedinUrl, location)
 * 3. Remap industry edges (OPERATES_IN_INDUSTRY → SERVES_INDUSTRY)
 * 4. Remap category edges (IN_CATEGORY → IN_CATEGORY, repoint source)
 * 5. Remap market edges (LOCATED_IN → OPERATES_IN)
 * 6. Aggregate user skills → firm skills (LegacySkill → canonical Skill)
 * 7. Migrate PartnershipPreferences → PREFERS edges
 * 8. Repoint CaseStudy ownership to ServiceFirm
 *
 * Protected by ADMIN_SECRET header. Idempotent (uses MERGE for edges).
 */

import { NextRequest, NextResponse } from "next/server";
import { neo4jWrite } from "@/lib/neo4j";

interface StepResult {
  step: number;
  name: string;
  affected: number;
  durationMs: number;
  error?: string;
}

async function runStep(
  step: number,
  name: string,
  cypher: string
): Promise<StepResult> {
  const start = Date.now();
  try {
    const rows = await neo4jWrite<{ affected: number }>(cypher);
    return {
      step,
      name,
      affected: Number(rows[0]?.affected ?? 0),
      durationMs: Date.now() - start,
    };
  } catch (error) {
    return {
      step,
      name,
      affected: 0,
      durationMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-admin-secret");
  const expectedSecret = process.env.ADMIN_SECRET;
  if (!expectedSecret || secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: StepResult[] = [];

  try {
    // ----- Step 1: Set isCosCustomer on ServiceFirm nodes -----
    results.push(
      await runStep(
        1,
        "Set isCosCustomer flag",
        `MATCH (o:Organization {isCollectiveOSCustomer: true})
         MATCH (f:ServiceFirm {legacyOrgId: o.legacyId})
         SET f.isCosCustomer = true
         RETURN count(f) as affected`
      )
    );

    // ----- Step 2: Copy missing properties -----
    results.push(
      await runStep(
        2,
        "Copy missing properties (description, linkedin, location)",
        `MATCH (o:Organization)
         MATCH (f:ServiceFirm {legacyOrgId: o.legacyId})
         SET f.description = COALESCE(f.description, o.about),
             f.linkedinUrl = COALESCE(f.linkedinUrl, o.linkedinUrl),
             f.city = COALESCE(f.city, o.city),
             f.state = COALESCE(f.state, o.state),
             f.country = COALESCE(f.country, o.countryCode)
         RETURN count(f) as affected`
      )
    );

    // ----- Step 3: Remap industry edges -----
    results.push(
      await runStep(
        3,
        "Remap OPERATES_IN_INDUSTRY → SERVES_INDUSTRY",
        `MATCH (o:Organization)-[:OPERATES_IN_INDUSTRY]->(i:Industry)
         MATCH (f:ServiceFirm {legacyOrgId: o.legacyId})
         MERGE (f)-[:SERVES_INDUSTRY]->(i)
         RETURN count(*) as affected`
      )
    );

    // ----- Step 4: Remap category edges -----
    results.push(
      await runStep(
        4,
        "Remap IN_CATEGORY (repoint to ServiceFirm)",
        `MATCH (o:Organization)-[:IN_CATEGORY]->(c)
         WHERE c:Category OR c:FirmCategory
         MATCH (f:ServiceFirm {legacyOrgId: o.legacyId})
         MERGE (f)-[:IN_CATEGORY]->(c)
         RETURN count(*) as affected`
      )
    );

    // ----- Step 5: Remap market edges -----
    results.push(
      await runStep(
        5,
        "Remap LOCATED_IN → OPERATES_IN",
        `MATCH (o:Organization)-[:LOCATED_IN]->(m:Market)
         MATCH (f:ServiceFirm {legacyOrgId: o.legacyId})
         MERGE (f)-[:OPERATES_IN]->(m)
         RETURN count(*) as affected`
      )
    );

    // ----- Step 6: Aggregate user skills → firm skills -----
    // Heaviest step: 29k user-skill edges aggregated per-org → firm-level HAS_SKILL
    results.push(
      await runStep(
        6,
        "Aggregate user skills → firm HAS_SKILL edges",
        `MATCH (o:Organization)<-[:BELONGS_TO]-(u)-[:HAS_SKILL]->(ls)
         WHERE ls:LegacySkill OR ls:Skill
         MATCH (f:ServiceFirm {legacyOrgId: o.legacyId})
         WITH f, COLLECT(DISTINCT ls.name) as skillNames
         UNWIND skillNames as skillName
         MATCH (s:Skill {name: skillName})
         MERGE (f)-[:HAS_SKILL]->(s)
         RETURN count(*) as affected`
      )
    );

    // ----- Step 7: Migrate PartnershipPreferences → PREFERS edges -----
    {
      const start = Date.now();
      let totalAffected = 0;

      // 7a: Services → PREFERS Skill
      const r7a = await runStep(
        7,
        "7a: services → PREFERS Skill",
        `MATCH (o:Organization)-[:HAS_PREFERENCES]->(pp:PartnershipPreferences)
         MATCH (f:ServiceFirm {legacyOrgId: o.legacyId})
         WHERE pp.servicesOffered IS NOT NULL
         WITH f, pp.servicesOffered as services
         UNWIND services as svc
         WITH f, svc WHERE svc <> ''
         MATCH (s:Skill {name: svc})
         MERGE (f)-[:PREFERS]->(s)
         RETURN count(*) as affected`
      );
      totalAffected += r7a.affected;

      // 7b: Client Industries → PREFERS Industry
      const r7b = await runStep(
        7,
        "7b: clientIndustries → PREFERS Industry",
        `MATCH (o:Organization)-[:HAS_PREFERENCES]->(pp:PartnershipPreferences)
         MATCH (f:ServiceFirm {legacyOrgId: o.legacyId})
         WHERE pp.clientIndustries IS NOT NULL
         WITH f, pp.clientIndustries as industries
         UNWIND industries as ind
         WITH f, ind WHERE ind <> ''
         MATCH (i:Industry {name: ind})
         MERGE (f)-[:PREFERS]->(i)
         RETURN count(*) as affected`
      );
      totalAffected += r7b.affected;

      // 7c: Location Countries → PREFERS Market
      // Legacy data has emoji-prefixed country names like "🇺🇸 United States"
      const r7c = await runStep(
        7,
        "7c: locationCountries → PREFERS Market",
        `MATCH (o:Organization)-[:HAS_PREFERENCES]->(pp:PartnershipPreferences)
         MATCH (f:ServiceFirm {legacyOrgId: o.legacyId})
         WHERE pp.locationCountries IS NOT NULL
         WITH f, pp.locationCountries as countries
         UNWIND countries as country
         WITH f, country WHERE country <> ''
         WITH f, CASE
           WHEN country CONTAINS ' ' THEN trim(substring(country, size(split(country, ' ')[0]) + 1))
           ELSE country
         END as cleanCountry
         MATCH (m:Market {name: cleanCountry})
         MERGE (f)-[:PREFERS]->(m)
         RETURN count(*) as affected`
      );
      totalAffected += r7c.affected;

      // 7d: Partner Types → PREFERS Category
      const r7d = await runStep(
        7,
        "7d: partnerTypes → PREFERS Category",
        `MATCH (o:Organization)-[:HAS_PREFERENCES]->(pp:PartnershipPreferences)
         MATCH (f:ServiceFirm {legacyOrgId: o.legacyId})
         WHERE pp.partnerTypes IS NOT NULL
         WITH f, pp.partnerTypes as types
         UNWIND types as ptype
         WITH f, ptype WHERE ptype <> ''
         MATCH (c) WHERE (c:Category OR c:FirmCategory) AND c.name = ptype
         MERGE (f)-[:PREFERS]->(c)
         RETURN count(*) as affected`
      );
      totalAffected += r7d.affected;

      results.push({
        step: 7,
        name: "Migrate PartnershipPreferences → PREFERS edges",
        affected: totalAffected,
        durationMs: Date.now() - start,
      });
    }

    // ----- Step 8: Repoint CaseStudy ownership -----
    results.push(
      await runStep(
        8,
        "Repoint CaseStudy OWNED_BY → ServiceFirm",
        `MATCH (cs:CaseStudy)-[:OWNED_BY]->(o:Organization)
         MATCH (f:ServiceFirm {legacyOrgId: o.legacyId})
         MERGE (cs)-[:OWNED_BY]->(f)
         RETURN count(*) as affected`
      )
    );

    // Check for any step errors
    const errors = results.filter((r) => r.error);

    const totalDuration = results.reduce((s, r) => s + r.durationMs, 0);

    return NextResponse.json({
      success: errors.length === 0,
      steps: results,
      totalDurationMs: totalDuration,
      errors: errors.length > 0 ? errors : undefined,
      summary: {
        isCosCustomerSet: results[0]?.affected ?? 0,
        propertiesCopied: results[1]?.affected ?? 0,
        industryEdges: results[2]?.affected ?? 0,
        categoryEdges: results[3]?.affected ?? 0,
        marketEdges: results[4]?.affected ?? 0,
        skillEdges: results[5]?.affected ?? 0,
        prefersEdges: results[6]?.affected ?? 0,
        caseStudyEdges: results[7]?.affected ?? 0,
      },
    });
  } catch (error) {
    console.error("Migration error:", error);
    return NextResponse.json(
      {
        error: "Migration failed",
        message: error instanceof Error ? error.message : String(error),
        completedSteps: results,
      },
      { status: 500 }
    );
  }
}
