import { NextResponse } from "next/server";
import { enrichCompany } from "@/lib/enrichment/pdl";

export const dynamic = "force-dynamic";

/**
 * POST /api/enrich/pdl
 *
 * Stage 1 of progressive enrichment — PDL company data only.
 * Returns firmographic data (name, size, revenue, location, etc.) in ~1 second.
 */
export async function POST(req: Request) {
  try {
    const { domain } = (await req.json()) as { domain: string };

    if (!domain) {
      return NextResponse.json(
        { error: "domain is required" },
        { status: 400 }
      );
    }

    console.log(`[Enrich/PDL] Looking up: ${domain}`);
    const companyData = await enrichCompany({ website: domain });

    if (!companyData) {
      console.log(`[Enrich/PDL] No match for ${domain}`);
      return NextResponse.json({ companyData: null, companyCard: null });
    }

    // Build summary card text
    const parts: string[] = [
      `Company: ${companyData.displayName}`,
      companyData.industry ? `Industry: ${companyData.industry}` : null,
      companyData.size ? `Size: ${companyData.size}` : null,
      companyData.employeeCount
        ? `Employees: ${companyData.employeeCount.toLocaleString()}`
        : null,
      companyData.founded ? `Founded: ${companyData.founded}` : null,
      companyData.location?.name ? `HQ: ${companyData.location.name}` : null,
      companyData.summary ? `About: ${companyData.summary}` : null,
      companyData.tags?.length
        ? `Tags: ${companyData.tags.join(", ")}`
        : null,
      companyData.totalFundingRaised
        ? `Total Funding: $${(companyData.totalFundingRaised / 1_000_000).toFixed(1)}M`
        : null,
      companyData.latestFundingStage
        ? `Latest Funding: ${companyData.latestFundingStage}`
        : null,
      companyData.inferredRevenue
        ? `Revenue: ${companyData.inferredRevenue}`
        : null,
      companyData.linkedinUrl
        ? `LinkedIn: ${companyData.linkedinUrl}`
        : null,
      companyData.type ? `Type: ${companyData.type}` : null,
    ].filter(Boolean) as string[];

    const companyCard = parts.join("\n");

    console.log(`[Enrich/PDL] Found: ${companyData.displayName} (${companyData.size})`);

    return NextResponse.json({
      companyData: {
        name: companyData.displayName,
        industry: companyData.industry,
        size: companyData.size,
        employeeCount: companyData.employeeCount,
        founded: companyData.founded,
        location: companyData.location?.name,
        tags: companyData.tags,
        inferredRevenue: companyData.inferredRevenue ?? null,
        linkedinUrl: companyData.linkedinUrl ?? null,
        website: `https://${domain}`,
      },
      companyCard,
    });
  } catch (error) {
    console.error("[Enrich/PDL] Error:", error);
    return NextResponse.json(
      { error: "PDL enrichment failed" },
      { status: 500 }
    );
  }
}
