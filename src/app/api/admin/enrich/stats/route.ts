/**
 * GET /api/admin/enrich/stats
 *
 * Returns enrichment completion stats across all pipelines.
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!session?.user || !["admin", "superadmin"].includes((session.user as any).role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const [
      firmsTotal,
      firmsEnriched,
      servicesTotal,
      csTotal,
      csActive,
      csPending,
      expertsTotal,
      expertsEnriched,
      expertsRoster,
      expertsNeedsLinkedin,
      expertsWithLinkedin,
      specialistsTotal,
      abstractionsTotal,
      abstractionsWithEmbedding,
    ] = await Promise.all([
      db.execute(sql`SELECT COUNT(*)::int as cnt FROM service_firms`),
      db.execute(sql`SELECT COUNT(*)::int as cnt FROM service_firms WHERE enrichment_status = 'enriched'`),
      db.execute(sql`SELECT COUNT(*)::int as cnt FROM firm_services`),
      db.execute(sql`SELECT COUNT(*)::int as cnt FROM firm_case_studies WHERE status != 'deleted'`),
      db.execute(sql`SELECT COUNT(*)::int as cnt FROM firm_case_studies WHERE status = 'active'`),
      db.execute(sql`SELECT COUNT(*)::int as cnt FROM firm_case_studies WHERE status = 'pending'`),
      db.execute(sql`SELECT COUNT(*)::int as cnt FROM expert_profiles`),
      db.execute(sql`SELECT COUNT(*)::int as cnt FROM expert_profiles WHERE pdl_enriched_at IS NOT NULL`),
      db.execute(sql`SELECT COUNT(*)::int as cnt FROM expert_profiles WHERE enrichment_status = 'roster'`),
      db.execute(sql`SELECT COUNT(*)::int as cnt FROM expert_profiles WHERE enrichment_status = 'needs_linkedin'`),
      db.execute(sql`SELECT COUNT(*)::int as cnt FROM expert_profiles WHERE linkedin_url IS NOT NULL AND linkedin_url != ''`),
      db.execute(sql`SELECT COUNT(*)::int as cnt FROM specialist_profiles`),
      db.execute(sql`SELECT COUNT(*)::int as cnt FROM abstraction_profiles WHERE entity_type = 'firm'`),
      db.execute(sql`SELECT COUNT(*)::int as cnt FROM abstraction_profiles WHERE entity_type = 'firm' AND embedding IS NOT NULL`),
    ]);

    const n = (r: { rows: { cnt?: number }[] }) => Number(r.rows[0]?.cnt ?? 0);

    return NextResponse.json({
      firms: { total: n(firmsTotal), enriched: n(firmsEnriched) },
      services: { total: n(servicesTotal) },
      caseStudies: { total: n(csTotal), active: n(csActive), pending: n(csPending) },
      experts: {
        total: n(expertsTotal),
        enriched: n(expertsEnriched),
        roster: n(expertsRoster),
        needsLinkedin: n(expertsNeedsLinkedin),
        withLinkedin: n(expertsWithLinkedin),
      },
      specialists: { total: n(specialistsTotal) },
      abstractions: { total: n(abstractionsTotal), withEmbedding: n(abstractionsWithEmbedding) },
    });
  } catch (error) {
    console.error("[EnrichStats]", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
