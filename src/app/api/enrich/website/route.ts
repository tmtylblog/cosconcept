import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { scrapeFirmWebsite } from "@/lib/enrichment/jina-scraper";
import { enrichCompany } from "@/lib/enrichment/pdl";
import { classifyFirm } from "@/lib/enrichment/ai-classifier";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { serviceFirms } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/enrich/website
 *
 * Combined enrichment pipeline:
 * 1. PDL — structured firmographic data (headcount, industry, funding, location)
 * 2. Jina — Ground Truth evidence (case studies, clients, services, team)
 * 3. AI Classifier — taxonomy classification against COS reference data
 *
 * PDL + Jina run in parallel. AI Classifier runs after both complete.
 */
/** Calculate a simple profile completeness score (0-1) */
function calculateProfileCompleteness(data: Record<string, unknown>): number {
  let score = 0;
  let total = 0;

  const check = (val: unknown) => {
    total++;
    if (val && (typeof val !== "object" || (Array.isArray(val) && val.length > 0))) {
      score++;
    }
  };

  check(data.companyData);
  check(data.groundTruth);
  const extracted = data.extracted as Record<string, unknown> | null;
  check(extracted?.clients);
  check(extracted?.services);
  check(extracted?.aboutPitch);
  check(extracted?.teamMembers);
  check(extracted?.caseStudyUrls);
  const classification = data.classification as Record<string, unknown> | null;
  check(classification?.categories);
  check(classification?.skills);
  check(classification?.industries);

  return total > 0 ? score / total : 0;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { url, organizationId: bodyOrgId } = body as {
      url: string;
      organizationId?: string;
    };

    if (!url) {
      return NextResponse.json(
        { error: "URL is required" },
        { status: 400 }
      );
    }

    // Normalize URL
    const normalized = url.startsWith("http") ? url : `https://${url}`;
    try {
      new URL(normalized);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL format" },
        { status: 400 }
      );
    }

    // Extract domain for PDL lookup
    const domain = new URL(normalized).hostname.replace(/^www\./, "");

    console.log(`[Enrich] Starting combined enrichment for: ${domain}`);

    // ─── Stage 1: PDL + Jina in parallel ───────────────────
    const [pdlResult, jinaResult] = await Promise.allSettled([
      enrichCompany({ website: domain }),
      scrapeFirmWebsite(normalized),
    ]);

    // Process PDL result
    const companyData =
      pdlResult.status === "fulfilled" ? pdlResult.value : null;
    if (pdlResult.status === "rejected") {
      console.warn("[Enrich] PDL enrichment failed:", pdlResult.reason);
    }

    // Process Jina result
    const groundTruth =
      jinaResult.status === "fulfilled" ? jinaResult.value : null;
    if (jinaResult.status === "rejected") {
      console.warn("[Enrich] Jina scrape failed:", jinaResult.reason);
    }

    // Build PDL summary
    let companyCardSummary = "";
    if (companyData) {
      const parts: string[] = [
        `Company: ${companyData.displayName}`,
        companyData.industry ? `Industry: ${companyData.industry}` : null,
        companyData.size ? `Size: ${companyData.size}` : null,
        companyData.employeeCount
          ? `Employees: ${companyData.employeeCount.toLocaleString()}`
          : null,
        companyData.founded ? `Founded: ${companyData.founded}` : null,
        companyData.location?.name
          ? `HQ: ${companyData.location.name}`
          : null,
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

      companyCardSummary = parts.join("\n");
    }

    // Build Ground Truth display content from Jina
    let groundTruthContent = "";
    if (groundTruth) {
      const sections: string[] = [];

      if (groundTruth.homepage.content) {
        const homepageSnippet =
          groundTruth.homepage.content.length > 2000
            ? groundTruth.homepage.content.slice(0, 2000) + "..."
            : groundTruth.homepage.content;
        sections.push(`### Homepage\n${homepageSnippet}`);
      }

      const byCategory: Record<string, string[]> = {};
      for (const ev of groundTruth.evidence) {
        if (!byCategory[ev.category]) byCategory[ev.category] = [];
        const snippet =
          ev.page.content.length > 3000
            ? ev.page.content.slice(0, 3000) + "..."
            : ev.page.content;
        byCategory[ev.category].push(
          `**${ev.page.title || ev.page.url}**\n${snippet}`
        );
      }

      const categoryLabels: Record<string, string> = {
        case_studies:
          "Case Studies & Portfolio (GROUND TRUTH — highest value)",
        clients: "Clients & Testimonials (proof of relationships)",
        services: "Services & Capabilities",
        team: "Team & Leadership",
        industries: "Industries & Verticals",
      };

      for (const [cat, label] of Object.entries(categoryLabels)) {
        if (byCategory[cat]) {
          sections.push(`### ${label}\n${byCategory[cat].join("\n\n")}`);
        }
      }

      groundTruthContent = sections.join("\n\n---\n\n");
      if (groundTruthContent.length > 12000) {
        groundTruthContent =
          groundTruthContent.slice(0, 12000) + "\n\n[Content truncated]";
      }
    }

    // ─── Stage 2: AI Classification ────────────────────────
    // Runs after Jina + PDL so it has full context
    let classification = null;
    if (groundTruth?.rawContent || companyCardSummary) {
      try {
        console.log("[Enrich] Starting AI classification...");
        classification = await classifyFirm({
          rawContent: groundTruth?.rawContent ?? "",
          pdlSummary: companyCardSummary || undefined,
          services: groundTruth?.extracted.services,
          aboutPitch: groundTruth?.extracted.aboutPitch,
        });
        console.log(
          `[Enrich] Classification: ${classification.categories.join(", ")} (${classification.confidence.toFixed(2)})`
        );
      } catch (err) {
        console.warn("[Enrich] AI classification failed:", err);
      }
    }

    const totalPagesScraped = groundTruth
      ? 1 + groundTruth.evidence.length
      : 0;

    console.log(
      `[Enrich] Done: PDL ${companyData ? "found" : "miss"}, ` +
        `Jina scraped ${totalPagesScraped} pages, ` +
        `${groundTruth?.extracted.teamMembers.length ?? 0} team names extracted`
    );

    // ─── Detect empty enrichment (bad URL / unreachable site) ──
    const hasAnyData = !!(
      companyData ||
      (groundTruth && (groundTruth.rawContent?.length ?? 0) > 100) ||
      classification
    );

    const responseData = {
      url: normalized,
      domain,
      success: hasAnyData,

      // PDL firmographic data
      companyCard: companyCardSummary || null,
      companyData: companyData
        ? {
            name: companyData.displayName,
            industry: companyData.industry,
            size: companyData.size,
            employeeCount: companyData.employeeCount,
            founded: companyData.founded,
            location: companyData.location?.name,
            tags: companyData.tags,
          }
        : null,

      // Jina Ground Truth (display text for Ossy)
      groundTruth: groundTruthContent || null,
      pagesScraped: totalPagesScraped,
      evidenceCategories: groundTruth
        ? groundTruth.evidence.map((e) => e.category)
        : [],

      // Structured extracted data
      extracted: groundTruth
        ? {
            clients: groundTruth.extracted.clients,
            caseStudyUrls: groundTruth.extracted.caseStudyUrls,
            services: groundTruth.extracted.services,
            aboutPitch: groundTruth.extracted.aboutPitch,
            teamMembers: groundTruth.extracted.teamMembers,
          }
        : null,

      // AI Classification against COS taxonomy
      classification: classification
        ? {
            categories: classification.categories,
            skills: classification.skills,
            industries: classification.industries,
            markets: classification.markets,
            languages: classification.languages,
            confidence: classification.confidence,
          }
        : null,
    };

    // ─── Persist to database (authenticated users only) ──────
    try {
      const session = await auth.api.getSession({ headers: await headers() });
      if (session?.user?.id) {
        const orgId = bodyOrgId;
        if (orgId) {
          const firmId = `firm_${orgId}`;
          const firmName =
            companyData?.displayName ||
            domain.split(".")[0].charAt(0).toUpperCase() + domain.split(".")[0].slice(1);

          await db
            .insert(serviceFirms)
            .values({
              id: firmId,
              organizationId: orgId,
              name: firmName,
              website: normalized,
              description: groundTruth?.extracted.aboutPitch || null,
              foundedYear: companyData?.founded || null,
              enrichmentData: responseData,
              enrichmentStatus: hasAnyData ? "enriched" : "failed",
              classificationConfidence: classification?.confidence || null,
              profileCompleteness: calculateProfileCompleteness(responseData),
            })
            .onConflictDoUpdate({
              target: serviceFirms.id,
              set: {
                name: firmName,
                website: normalized,
                description: groundTruth?.extracted.aboutPitch || null,
                foundedYear: companyData?.founded || null,
                enrichmentData: responseData,
                enrichmentStatus: hasAnyData ? "enriched" : "failed",
                classificationConfidence: classification?.confidence || null,
                profileCompleteness: calculateProfileCompleteness(responseData),
                updatedAt: new Date(),
              },
            });

          console.log(`[Enrich] Persisted enrichment to serviceFirms for org ${orgId}`);
        }
      }
    } catch (err) {
      // Don't block the response — persistence is best-effort
      console.error("[Enrich] Failed to persist enrichment data:", err);
    }

    return NextResponse.json(responseData);
  } catch (error) {
    console.error("[Enrich] Website enrichment error:", error);
    return NextResponse.json(
      {
        error:
          "Failed to enrich website. Please check the URL and try again.",
      },
      { status: 500 }
    );
  }
}
