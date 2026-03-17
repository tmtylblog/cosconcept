/**
 * GET /api/admin/data-quality
 *
 * Scores every service firm on data quality. Flags likely test/junk accounts.
 *
 * Scoring (0-100, higher = better quality):
 * - Has website: +25
 * - Has enrichment data: +15
 * - Has services: +15
 * - Has case studies: +10
 * - Has expert profiles: +10
 * - Has graph node: +10
 * - Has abstraction profile: +5
 * - Org has >1 member: +10
 *
 * Penalties (reduce score):
 * - Name matches test patterns: -40
 * - No website: -20 (on top of missing the +25)
 * - Created in last 24h with zero data: -10
 *
 * Returns firms sorted by score ascending (worst first).
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const TEST_PATTERNS = [
  "test", "demo", "example", "asdf", "qwerty", "temp", "fake",
  "sample", "dummy", "placeholder", "xxx", "aaa", "bbb", "foo", "bar",
];

interface FirmQuality {
  firmId: string;
  orgId: string;
  firmName: string;
  orgName: string;
  website: string | null;
  createdAt: string;
  score: number;
  flags: string[];
  stats: {
    services: number;
    caseStudies: number;
    experts: number;
    hasEnrichment: boolean;
    hasGraph: boolean;
    hasAbstraction: boolean;
    memberCount: number;
  };
}

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // Single query to get all firms with their data counts
    const rows = await db.execute(sql`
      SELECT
        sf.id AS firm_id,
        sf.organization_id AS org_id,
        sf.name AS firm_name,
        o.name AS org_name,
        sf.website,
        sf.enrichment_data,
        sf.created_at,
        COALESCE(sf.enrichment_data->>'graphNodeId', '') AS graph_node_id,
        (SELECT COUNT(*)::int FROM firm_services WHERE firm_id = sf.id) AS svc_count,
        (SELECT COUNT(*)::int FROM firm_case_studies WHERE firm_id = sf.id AND status != 'deleted') AS cs_count,
        (SELECT COUNT(*)::int FROM expert_profiles WHERE firm_id = sf.id) AS expert_count,
        (SELECT COUNT(*)::int FROM abstraction_profiles WHERE entity_type = 'firm' AND entity_id = sf.id) AS abs_count,
        (SELECT COUNT(*)::int FROM "members" WHERE organization_id = sf.organization_id) AS member_count
      FROM service_firms sf
      JOIN organizations o ON o.id = sf.organization_id
      ORDER BY sf.created_at DESC
    `);

    const firms: FirmQuality[] = rows.rows.map((row) => {
      const firmName = (row.firm_name as string) ?? "";
      const orgName = (row.org_name as string) ?? "";
      const website = row.website as string | null;
      const hasEnrichment = !!(row.enrichment_data as Record<string, unknown>);
      const graphNodeId = (row.graph_node_id as string) ?? "";
      const hasGraph = graphNodeId.length > 0;
      const svcCount = Number(row.svc_count ?? 0);
      const csCount = Number(row.cs_count ?? 0);
      const expertCount = Number(row.expert_count ?? 0);
      const absCount = Number(row.abs_count ?? 0);
      const hasAbstraction = absCount > 0;
      const memberCount = Number(row.member_count ?? 0);
      const createdAt = row.created_at as string;

      // Score calculation
      let score = 0;
      const flags: string[] = [];

      // Positive signals
      if (website) score += 25;
      if (hasEnrichment) score += 15;
      if (svcCount > 0) score += 15;
      if (csCount > 0) score += 10;
      if (expertCount > 0) score += 10;
      if (hasGraph) score += 10;
      if (hasAbstraction) score += 5;
      if (memberCount > 1) score += 10;

      // Penalties
      if (!website) {
        score -= 20;
        flags.push("No website");
      }

      // Test name detection
      const nameLower = firmName.toLowerCase().trim();
      const orgLower = orgName.toLowerCase().trim();
      const isTestName = TEST_PATTERNS.some(
        (p) =>
          nameLower === p ||
          nameLower.startsWith(p + " ") ||
          nameLower.endsWith(" " + p) ||
          orgLower === p ||
          orgLower.startsWith(p + " ") ||
          orgLower.endsWith(" " + p)
      );
      if (isTestName) {
        score -= 40;
        flags.push("Test/demo name pattern");
      }

      // Very short name
      if (nameLower.length <= 2) {
        score -= 20;
        flags.push("Very short name");
      }

      // Single-character or gibberish detection
      if (/^[^a-z]*$/.test(nameLower) || /^(.)\1+$/.test(nameLower)) {
        score -= 20;
        flags.push("Gibberish name");
      }

      // No data at all
      if (svcCount === 0 && csCount === 0 && expertCount === 0 && !hasEnrichment) {
        flags.push("No data");
      }

      // Single member, no data — likely abandoned signup
      if (memberCount <= 1 && svcCount === 0 && csCount === 0 && expertCount === 0) {
        flags.push("Abandoned signup");
      }

      // Clamp score
      score = Math.max(0, Math.min(100, score));

      return {
        firmId: row.firm_id as string,
        orgId: row.org_id as string,
        firmName,
        orgName,
        website,
        createdAt,
        score,
        flags,
        stats: {
          services: svcCount,
          caseStudies: csCount,
          experts: expertCount,
          hasEnrichment,
          hasGraph,
          hasAbstraction,
          memberCount,
        },
      };
    });

    // Sort by score ascending (worst first)
    firms.sort((a, b) => a.score - b.score);

    const flagged = firms.filter((f) => f.flags.length > 0);
    const likelyTest = firms.filter((f) => f.score <= 10);

    return NextResponse.json({
      totalFirms: firms.length,
      flaggedCount: flagged.length,
      likelyTestCount: likelyTest.length,
      firms,
    });
  } catch (error) {
    console.error("[DataQuality] Error:", error);
    return NextResponse.json({ error: "Failed to compute data quality" }, { status: 500 });
  }
}
