/**
 * Inngest Function: Deep Website Crawl
 *
 * Triggered when a new firm is onboarded (auto from email domain)
 * or manually by admin. Performs:
 *
 * 1. Enhanced deep crawl (sitemap + common paths + link analysis)
 * 2. AI page classification for each discovered page
 * 3. AI-powered extraction (case studies, team, services)
 * 4. PDL company enrichment
 * 5. AI classification against COS taxonomy
 * 6. Write results to Neo4j knowledge graph
 * 7. Queue case study URLs for individual deep ingestion
 * 8. Queue team members for LinkedIn/PDL enrichment
 */

import { inngest } from "../client";
import { deepCrawlWebsite } from "@/lib/enrichment/deep-crawler";
import { enrichCompany } from "@/lib/enrichment/pdl";
import { classifyFirm } from "@/lib/enrichment/ai-classifier";
import { writeFirmToGraph } from "@/lib/enrichment/graph-writer";
import { logEnrichmentStep } from "@/lib/enrichment/audit-logger";

export const deepCrawl = inngest.createFunction(
  {
    id: "enrich-deep-crawl",
    name: "Deep Website Crawl",
    retries: 2,
    concurrency: [{ limit: 5 }],
  },
  { event: "enrich/deep-crawl" },
  async ({ event, step }) => {
    const { firmId, organizationId, website, firmName } = event.data;

    // Step 1: Enhanced deep crawl (sitemap + probes + AI classification)
    const crawlResult = await step.run("deep-crawl", async () => {
      console.log(`[DeepCrawl] Deep crawling ${website}...`);
      return deepCrawlWebsite({ firmId, website, firmName });
    });

    // Step 2: PDL company enrichment
    const pdlData = await step.run("pdl-enrich", async () => {
      console.log(`[DeepCrawl] PDL enrichment for ${website}...`);
      const result = await enrichCompany({ website });
      await logEnrichmentStep({
        firmId,
        phase: "pdl",
        source: "api.peopledatalabs.com",
        rawInput: `website=${website}`,
        extractedData: result
          ? {
              name: result.displayName,
              industry: result.industry,
              size: result.size,
              employeeCount: result.employeeCount,
            }
          : null,
        status: result ? "success" : "skipped",
      });
      return result;
    });

    // Step 3: AI classification against COS taxonomy
    // Use both deep crawl raw content and extracted services for better classification
    const classification = await step.run("ai-classify", async () => {
      console.log(`[DeepCrawl] Classifying ${firmName}...`);
      const result = await classifyFirm({
        rawContent: crawlResult.rawContent,
        pdlSummary: pdlData
          ? `${pdlData.displayName} | ${pdlData.industry} | ${pdlData.size} | ${pdlData.headline}`
          : undefined,
        services: crawlResult.extracted.services.map((s) => s.name),
        aboutPitch: crawlResult.extracted.aboutPitch,
      });
      await logEnrichmentStep({
        firmId,
        phase: "classifier",
        source: "gemini-flash",
        rawInput: `rawContent length: ${crawlResult.rawContent.length}`,
        extractedData: {
          categories: result.categories,
          skills: result.skills.length,
          industries: result.industries.length,
          confidence: result.confidence,
        },
        confidence: result.confidence,
        status: "success",
      });
      return result;
    });

    // Step 4: Write to Neo4j knowledge graph
    const graphResult = await step.run("graph-write", async () => {
      console.log(`[DeepCrawl] Writing ${firmName} to graph...`);
      return writeFirmToGraph({
        firmId,
        organizationId,
        name: firmName,
        website,
        description: crawlResult.extracted.aboutPitch,
        foundedYear: pdlData?.founded ?? undefined,
        employeeCount: pdlData?.employeeCount ?? undefined,
        pdl: pdlData,
        groundTruth: {
          homepage: crawlResult.pages[0]?.scraped ?? {
            url: website,
            title: "",
            content: "",
            scrapedAt: new Date().toISOString(),
          },
          evidence: crawlResult.pages.slice(1).map((p) => ({
            category: p.pageType,
            page: p.scraped,
          })),
          extracted: {
            clients: crawlResult.extracted.clients,
            caseStudyUrls: crawlResult.extracted.caseStudyUrls,
            services: crawlResult.extracted.services.map((s) => s.name),
            aboutPitch: crawlResult.extracted.aboutPitch,
            teamMembers: crawlResult.extracted.teamMembers.map((m) => m.name),
          },
          rawContent: crawlResult.rawContent,
          pageTitles: crawlResult.pages.map((p) => p.scraped.title).filter(Boolean),
        },
        classification,
      });
    });

    // Step 5: Queue case study deep ingestion
    if (crawlResult.extracted.caseStudyUrls.length > 0) {
      await step.run("queue-case-studies", async () => {
        const urls = crawlResult.extracted.caseStudyUrls.slice(0, 10);
        console.log(
          `[DeepCrawl] Queueing ${urls.length} case studies for deep ingestion`
        );
        for (const url of urls) {
          await inngest.send({
            name: "enrich/case-study-ingest",
            data: { firmId, caseStudyUrl: url, sourceType: "url" },
          });
        }
        return { queued: urls.length };
      });
    }

    // Step 6: Queue expert LinkedIn/PDL enrichment
    const teamToEnrich = crawlResult.extracted.teamMembers;
    if (teamToEnrich.length > 0) {
      await step.run("queue-expert-enrichment", async () => {
        const members = teamToEnrich.slice(0, 20);
        console.log(
          `[DeepCrawl] Queueing ${members.length} team members for enrichment`
        );
        for (const member of members) {
          await inngest.send({
            name: "enrich/expert-linkedin",
            data: {
              expertId: `${firmId}:${member.name.toLowerCase().replace(/\s+/g, "-")}`,
              firmId,
              fullName: member.name,
              linkedinUrl: member.linkedinUrl,
              companyName: firmName,
              companyWebsite: website,
            },
          });
        }
        return { queued: members.length };
      });
    }

    return {
      firmId,
      firmName,
      crawl: {
        urlsDiscovered: crawlResult.stats.urlsDiscovered,
        pagesCrawled: crawlResult.stats.pagesCrawled,
        pagesClassified: crawlResult.stats.pagesClassified,
        durationMs: crawlResult.stats.durationMs,
      },
      extracted: {
        caseStudies: crawlResult.extracted.caseStudies.length,
        teamMembers: crawlResult.extracted.teamMembers.length,
        services: crawlResult.extracted.services.length,
        clients: crawlResult.extracted.clients.length,
      },
      classification: {
        categories: classification.categories,
        skills: classification.skills.length,
        industries: classification.industries.length,
        confidence: classification.confidence,
      },
      graph: graphResult,
      caseStudiesQueued: Math.min(
        crawlResult.extracted.caseStudyUrls.length,
        10
      ),
      teamMembersQueued: Math.min(teamToEnrich.length, 20),
    };
  }
);
