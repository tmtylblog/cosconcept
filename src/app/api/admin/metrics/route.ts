import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { PLAN_PRICES } from "@/lib/billing/plan-limits";
import { getNeo4jDriver } from "@/lib/neo4j";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/metrics
 * Comprehensive platform metrics for the admin overview dashboard.
 * Covers: accounts, enrichment pipeline, knowledge graph, and billing.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // ── PostgreSQL metrics (parallel) ─────────────────────
    const [
      orgCount,
      userCount,
      planRows,
      activeRows,
      firmCount,
      expertCount,
      clientCount,
      csCount,
      csStatusBreakdown,
      serviceCount,
      specialistCount,
      enrichedExpertCount,
      abstractionCount,
      auditCount,
      onboardingResult,
    ] = await Promise.all([
      db.execute(sql`SELECT COUNT(*)::int AS count FROM "organizations"`),
      db.execute(sql`SELECT COUNT(*)::int AS count FROM "users"`),
      db.select({
        plan: subscriptions.plan,
        count: sql<number>`count(*)::int`,
      }).from(subscriptions).groupBy(subscriptions.plan),
      db.select({ count: sql<number>`count(*)::int` })
        .from(subscriptions)
        .where(eq(subscriptions.status, "active")),
      db.execute(sql`SELECT COUNT(*)::int AS count FROM "service_firms"`),
      db.execute(sql`SELECT COUNT(*)::int AS count FROM "expert_profiles"`),
      db.execute(sql`SELECT COUNT(*)::int AS count FROM "imported_clients"`),
      db.execute(sql`SELECT COUNT(*)::int AS count FROM "firm_case_studies" WHERE status != 'deleted'`),
      db.execute(sql`
        SELECT status, COUNT(*)::int AS count
        FROM "firm_case_studies"
        WHERE status != 'deleted'
        GROUP BY status
      `),
      db.execute(sql`SELECT COUNT(*)::int AS count FROM "firm_services"`),
      db.execute(sql`SELECT COUNT(*)::int AS count FROM "specialist_profiles"`),
      db.execute(sql`SELECT COUNT(*)::int AS count FROM "expert_profiles" WHERE "pdl_enriched_at" IS NOT NULL`),
      db.execute(sql`SELECT COUNT(*)::int AS count FROM "abstraction_profiles"`),
      db.execute(sql`SELECT COUNT(*)::int AS count FROM "enrichment_audit_log"`),
      db.execute(sql`
        SELECT
          COUNT(DISTINCT domain) FILTER (WHERE event = 'domain_entered')::int AS started,
          COUNT(DISTINCT domain) FILTER (WHERE event = 'all_questions_done')::int AS completed
        FROM onboarding_events
      `),
    ]);

    // Plan distribution
    const planDistribution: Record<string, number> = { free: 0, pro: 0, enterprise: 0 };
    for (const row of planRows) {
      planDistribution[row.plan] = Number(row.count);
    }

    // Case study status breakdown
    const caseStudyStatuses: Record<string, number> = {};
    for (const row of csStatusBreakdown.rows) {
      caseStudyStatuses[row.status as string] = Number(row.count);
    }

    // MRR
    const mrr =
      (planDistribution.pro ?? 0) * PLAN_PRICES.pro.monthly +
      (planDistribution.enterprise ?? 0) * PLAN_PRICES.enterprise.monthly;

    // ── Neo4j graph metrics ──────────────────────────────
    let graphStats = {
      totalNodes: 0,
      totalEdges: 0,
      serviceFirms: 0,
      companies: 0,
      persons: 0,
      skills: 0,
      industries: 0,
      caseStudies: 0,
      services: 0,
      categories: 0,
    };

    try {
      const neo4jSession = getNeo4jDriver().session();
      try {
        const result = await neo4jSession.run(`
          CALL {
            MATCH (n) RETURN count(n) AS totalNodes
          }
          CALL {
            MATCH ()-[r]->() RETURN count(r) AS totalEdges
          }
          CALL {
            MATCH (n:Company:ServiceFirm) RETURN count(n) AS serviceFirms
          }
          CALL {
            MATCH (n:Company) RETURN count(n) AS companies
          }
          CALL {
            MATCH (n:Person) RETURN count(n) AS persons
          }
          CALL {
            MATCH (n:Skill) RETURN count(n) AS skills
          }
          CALL {
            MATCH (n:Industry) RETURN count(n) AS industries
          }
          CALL {
            MATCH (n:CaseStudy) RETURN count(n) AS caseStudies
          }
          CALL {
            MATCH (n:Service) RETURN count(n) AS services
          }
          CALL {
            MATCH (n:FirmCategory) RETURN count(n) AS categories
          }
          RETURN totalNodes, totalEdges, serviceFirms, companies, persons,
                 skills, industries, caseStudies, services, categories
        `);
        const r = result.records[0];
        if (r) {
          graphStats = {
            totalNodes: r.get("totalNodes").toNumber(),
            totalEdges: r.get("totalEdges").toNumber(),
            serviceFirms: r.get("serviceFirms").toNumber(),
            companies: r.get("companies").toNumber(),
            persons: r.get("persons").toNumber(),
            skills: r.get("skills").toNumber(),
            industries: r.get("industries").toNumber(),
            caseStudies: r.get("caseStudies").toNumber(),
            services: r.get("services").toNumber(),
            categories: r.get("categories").toNumber(),
          };
        }
      } finally {
        await neo4jSession.close();
      }
    } catch (err) {
      console.error("[Admin] Neo4j metrics failed:", err);
    }

    return NextResponse.json({
      // Accounts
      totalOrgs: Number(orgCount.rows[0]?.count ?? 0),
      totalUsers: Number(userCount.rows[0]?.count ?? 0),
      activeSubscriptions: Number(activeRows[0]?.count ?? 0),
      mrr,
      planDistribution,

      // Enrichment pipeline
      totalFirms: Number(firmCount.rows[0]?.count ?? 0),
      totalExperts: Number(expertCount.rows[0]?.count ?? 0),
      enrichedExperts: Number(enrichedExpertCount.rows[0]?.count ?? 0),
      totalClients: Number(clientCount.rows[0]?.count ?? 0),
      totalCaseStudies: Number(csCount.rows[0]?.count ?? 0),
      caseStudyStatuses,
      totalServices: Number(serviceCount.rows[0]?.count ?? 0),
      totalSpecialistProfiles: Number(specialistCount.rows[0]?.count ?? 0),
      totalAbstractionProfiles: Number(abstractionCount.rows[0]?.count ?? 0),
      totalAuditEntries: Number(auditCount.rows[0]?.count ?? 0),

      // Knowledge graph
      graph: graphStats,

      // Onboarding
      onboarding: {
        started: Number(onboardingResult.rows[0]?.started ?? 0),
        completed: Number(onboardingResult.rows[0]?.completed ?? 0),
        rate: Number(onboardingResult.rows[0]?.started ?? 0) > 0
          ? Number(onboardingResult.rows[0]?.completed ?? 0) / Number(onboardingResult.rows[0]?.started ?? 0)
          : 0,
      },
    });
  } catch (error) {
    console.error("[Admin] Metrics error:", error);
    return NextResponse.json(
      { error: "Failed to fetch metrics" },
      { status: 500 }
    );
  }
}
