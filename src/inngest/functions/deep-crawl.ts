/**
 * Inngest Function: Deep Website Crawl
 *
 * Triggered when a new firm completes onboarding (auto from email domain)
 * or manually by admin. Performs:
 *
 * 1. Enhanced deep crawl (sitemap + common paths + link analysis)
 * 2. AI page classification for each discovered page
 * 3. AI-powered extraction (case studies, team, services)
 * 4. PDL company enrichment
 * 5. AI classification against COS taxonomy
 * 6. Write results to Neo4j knowledge graph
 * 7. Bulk-insert ALL services into firmServices table (auto-approved)
 * 8. Bulk-insert ALL case study URLs into firmCaseStudies table (auto-approved)
 * 9. Queue case study URLs for individual deep ingestion (AI extraction pipeline)
 * 10. Queue team members for LinkedIn/PDL enrichment
 */

import { inngest } from "../client";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { firmCaseStudies, firmServices } from "@/lib/db/schema";
import { intelligentCrawlWebsite } from "@/lib/enrichment/intelligent-crawler";
import { enrichCompanyWithFallback } from "@/lib/enrichment/company-enrichment";
import { classifyFirm } from "@/lib/enrichment/ai-classifier";
import { writeFirmToGraph } from "@/lib/enrichment/graph-writer";
import { logEnrichmentStep } from "@/lib/enrichment/audit-logger";

/** Generate a unique ID */
function uid(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

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

    // Step 1: Intelligent crawl (LLM-guided homepage analysis + targeted extraction)
    const crawlResult = await step.run("deep-crawl", async () => {
      console.log(`[DeepCrawl] Intelligent crawling ${website}...`);
      return intelligentCrawlWebsite({ firmId, website, firmName });
    });

    // Step 2: Company enrichment (PDL → Jina+AI fallback)
    const pdlData = await step.run("company-enrich", async () => {
      console.log(`[DeepCrawl] Company enrichment for ${website}...`);
      const result = await enrichCompanyWithFallback({ website });
      await logEnrichmentStep({
        firmId,
        phase: "pdl",
        source: result.provider === "jina+ai" ? "jina+ai" : "api.peopledatalabs.com",
        rawInput: `website=${website}, provider=${result.provider ?? "none"}${result.fallbackReason ? `, fallback=${result.fallbackReason}` : ""}`,
        extractedData: result.company
          ? {
              name: result.company.displayName,
              industry: result.company.industry,
              size: result.company.size,
              employeeCount: result.company.employeeCount,
              provider: result.provider,
            }
          : null,
        status: result.company ? "success" : "skipped",
      });
      return result.company;
    });

    // Step 3: AI classification against COS taxonomy
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

    // Step 5: Bulk-insert ALL services into firmServices table (auto-approved, visible by default)
    let servicesInserted = 0;
    if (crawlResult.extracted.services.length > 0) {
      servicesInserted = await step.run("bulk-insert-services", async () => {
        const services = crawlResult.extracted.services;
        console.log(`[DeepCrawl] Bulk-inserting ${services.length} services for ${firmName}`);

        // Check existing services for this firm to avoid duplicates
        const existing = await db
          .select({ name: firmServices.name })
          .from(firmServices)
          .where(eq(firmServices.firmId, firmId));
        const existingNames = new Set(existing.map((s) => s.name.toLowerCase()));

        const newServices = services.filter(
          (s) => !existingNames.has(s.name.toLowerCase())
        );

        if (newServices.length === 0) return 0;

        // Batch insert all new services
        const values = newServices.map((s, i) => ({
          id: uid("svc"),
          firmId,
          organizationId,
          name: s.name,
          description: s.description || null,
          subServices: s.subServices.length > 0 ? s.subServices : null,
          offeringType: s.offeringType || "service",
          skills: s.skills && s.skills.length > 0 ? s.skills : [],
          industries: s.industries && s.industries.length > 0 ? s.industries : [],
          isHidden: false,
          displayOrder: i,
        }));

        // Insert in batches of 50 to avoid query size limits
        for (let i = 0; i < values.length; i += 50) {
          const batch = values.slice(i, i + 50);
          await db.insert(firmServices).values(batch);
        }

        return values.length;
      });
    }

    // Step 6: Bulk-insert ALL case study URLs into firmCaseStudies table (auto-approved, status: pending)
    // These rows appear immediately in the UI, then the ingestion pipeline fills in title/summary/tags.
    let caseStudiesInserted = 0;
    const caseStudyUrls = crawlResult.extracted.caseStudyUrls;
    if (caseStudyUrls.length > 0) {
      caseStudiesInserted = await step.run("bulk-insert-case-studies", async () => {
        console.log(`[DeepCrawl] Bulk-inserting ${caseStudyUrls.length} case study URLs for ${firmName}`);

        // Check existing case studies for this firm to avoid duplicates (by sourceUrl)
        const existing = await db
          .select({ sourceUrl: firmCaseStudies.sourceUrl })
          .from(firmCaseStudies)
          .where(eq(firmCaseStudies.firmId, firmId));
        const existingUrls = new Set(existing.map((cs) => cs.sourceUrl));

        const newUrls = caseStudyUrls.filter((url) => !existingUrls.has(url));
        if (newUrls.length === 0) return 0;

        // Batch insert all case study rows with status: "pending"
        const values = newUrls.map((url) => ({
          id: uid("cs"),
          firmId,
          organizationId,
          sourceUrl: url,
          sourceType: "url" as const,
          status: "pending" as const,
          isHidden: false,
        }));

        for (let i = 0; i < values.length; i += 50) {
          const batch = values.slice(i, i + 50);
          await db.insert(firmCaseStudies).values(batch);
        }

        return values.length;
      });
    }

    // Step 7: Queue case study deep ingestion (AI extraction pipeline)
    // Process ALL discovered URLs — batched with sleep to avoid overwhelming Jina
    if (caseStudyUrls.length > 0) {
      // Get the IDs we just inserted so we can send them to the ingestion pipeline
      const insertedCaseStudies = await step.run("get-inserted-case-studies", async () => {
        const rows = await db
          .select({ id: firmCaseStudies.id, sourceUrl: firmCaseStudies.sourceUrl })
          .from(firmCaseStudies)
          .where(eq(firmCaseStudies.firmId, firmId));
        // Filter to only the URLs we care about (pending ones from this crawl)
        const urlSet = new Set(caseStudyUrls);
        return rows.filter((r) => urlSet.has(r.sourceUrl));
      });

      // Queue in batches of 10 with sleep between batches
      const BATCH_SIZE = 10;
      for (let i = 0; i < insertedCaseStudies.length; i += BATCH_SIZE) {
        const batch = insertedCaseStudies.slice(i, i + BATCH_SIZE);
        const batchIndex = Math.floor(i / BATCH_SIZE);

        await step.run(`queue-case-study-batch-${batchIndex}`, async () => {
          for (const cs of batch) {
            await inngest.send({
              name: "enrich/firm-case-study-ingest",
              data: {
                caseStudyId: cs.id,
                firmId,
                organizationId,
                sourceUrl: cs.sourceUrl,
                sourceType: "url",
              },
            });
          }
          return { batch: batchIndex, queued: batch.length };
        });

        // Sleep between batches to rate-limit Jina API calls
        if (i + BATCH_SIZE < insertedCaseStudies.length) {
          await step.sleep(`batch-delay-${batchIndex}`, "2s");
        }
      }
    }

    // Step 8: Queue expert LinkedIn/PDL enrichment
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
      servicesInserted,
      caseStudiesInserted,
      caseStudiesQueued: caseStudyUrls.length,
      teamMembersQueued: Math.min(teamToEnrich.length, 20),
    };
  }
);
