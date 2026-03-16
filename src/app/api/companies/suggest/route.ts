/**
 * POST /api/companies/suggest
 *
 * Look up a company by domain. If it exists in Neo4j, return it.
 * If not, enrich via PDL and create a minimal Company node.
 *
 * Request: { domain: string, name?: string }
 * Response: { name, industry, domain }
 */

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { neo4jRead, neo4jWrite } from "@/lib/neo4j";
import { enrichCompany } from "@/lib/enrichment/pdl";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const rawDomain = (body.domain as string)?.trim().toLowerCase();
  const fallbackName = (body.name as string)?.trim();

  if (!rawDomain) {
    return Response.json({ error: "Domain is required" }, { status: 400 });
  }

  // Normalize domain (strip protocol, www, trailing slash)
  const domain = rawDomain
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");

  try {
    // 1. Check if Company with this domain already exists
    const existing = await neo4jRead<{ name: string; industry: string | null; domain: string }>(
      `MATCH (c:Company {domain: $domain})
       RETURN c.name as name, c.pdlIndustry as industry, c.domain as domain
       LIMIT 1`,
      { domain }
    );

    if (existing.length > 0) {
      return Response.json({
        name: existing[0].name,
        industry: existing[0].industry ?? "",
        domain: existing[0].domain,
        source: "existing",
      });
    }

    // 2. Enrich via PDL
    let companyName = fallbackName ?? domain;
    let companyIndustry = "";

    try {
      const pdlResult = await enrichCompany({ website: `https://${domain}` });
      if (pdlResult) {
        companyName = pdlResult.displayName ?? pdlResult.name ?? companyName;
        companyIndustry = pdlResult.industry ?? "";
      }
    } catch {
      // PDL lookup failed — proceed with manual data
    }

    // 3. Create minimal Company node in Neo4j
    await neo4jWrite(
      `MERGE (c:Company {domain: $domain})
       ON CREATE SET
         c.name = $name,
         c.pdlIndustry = $industry,
         c.source = "user_suggested",
         c.enrichmentStatus = $enrichStatus,
         c.updatedAt = datetime()
       ON MATCH SET
         c.name = CASE WHEN c.name IS NULL THEN $name ELSE c.name END,
         c.updatedAt = datetime()
       RETURN c.name as name`,
      {
        domain,
        name: companyName,
        industry: companyIndustry || null,
        enrichStatus: companyIndustry ? "partial" : "minimal",
      }
    );

    return Response.json({
      name: companyName,
      industry: companyIndustry,
      domain,
      source: "created",
    }, { status: 201 });
  } catch (error) {
    console.error("[Company Suggest] Error:", error);
    return Response.json({ error: "Failed to add company" }, { status: 500 });
  }
}
