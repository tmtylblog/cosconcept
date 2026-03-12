/**
 * Handler: deep-crawl
 *
 * Deep website crawl + enrichment + graph write for a firm.
 * Extracted from the Inngest function of the same name.
 *
 * After inserting case studies, enqueues individual ingest jobs
 * using the local job queue (replaces inngest.send).
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { firmCaseStudies, firmServices, serviceFirms } from "@/lib/db/schema";
import { deepCrawlWebsite } from "@/lib/enrichment/deep-crawler";
import { enrichCompany } from "@/lib/enrichment/pdl";
import { classifyFirm } from "@/lib/enrichment/ai-classifier";
import { writeFirmToGraph } from "@/lib/enrichment/graph-writer";
import { logEnrichmentStep } from "@/lib/enrichment/audit-logger";
import { enqueue } from "../queue";

function uid(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

interface Payload {
  firmId: string;
  organizationId: string;
  website: string;
  firmName: string;
}

export async function handleDeepCrawl(
  payload: Record<string, unknown>
): Promise<unknown> {
  const { firmId, organizationId, website, firmName } = payload as unknown as Payload;

  // Step 1: Enhanced deep crawl
  console.log(`[DeepCrawl] Deep crawling ${website}...`);
  const crawlResult = await deepCrawlWebsite({ firmId, website, firmName });

  // Step 2: PDL company enrichment
  console.log(`[DeepCrawl] PDL enrichment for ${website}...`);
  const pdlData = await enrichCompany({ website });
  await logEnrichmentStep({
    firmId,
    phase: "pdl",
    source: "api.peopledatalabs.com",
    rawInput: `website=${website}`,
    extractedData: pdlData
      ? {
          name: pdlData.displayName,
          industry: pdlData.industry,
          size: pdlData.size,
          employeeCount: pdlData.employeeCount,
        }
      : null,
    status: pdlData ? "success" : "skipped",
  });

  // Step 3: AI classification
  console.log(`[DeepCrawl] Classifying ${firmName}...`);
  const classification = await classifyFirm({
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
      categories: classification.categories,
      skills: classification.skills.length,
      industries: classification.industries.length,
      confidence: classification.confidence,
    },
    confidence: classification.confidence,
    status: "success",
  });

  // Step 4: Write to Neo4j graph
  console.log(`[DeepCrawl] Writing ${firmName} to graph...`);
  const graphResult = await writeFirmToGraph({
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

  // Step 5: Bulk-insert services
  let servicesInserted = 0;
  const existingServicesForFirm = await db
    .select({ name: firmServices.name })
    .from(firmServices)
    .where(eq(firmServices.firmId, firmId));
  const existingServiceNames = new Set(existingServicesForFirm.map((s) => s.name.toLowerCase()));

  if (crawlResult.extracted.services.length > 0) {
    const newServices = crawlResult.extracted.services.filter(
      (s) => !existingServiceNames.has(s.name.toLowerCase())
    );

    if (newServices.length > 0) {
      const values = newServices.map((s, i) => ({
        id: uid("svc"),
        firmId,
        organizationId,
        name: s.name,
        description: s.description || null,
        subServices: s.subServices.length > 0 ? s.subServices : null,
        isHidden: false,
        displayOrder: i,
      }));

      for (let i = 0; i < values.length; i += 50) {
        await db.insert(firmServices).values(values.slice(i, i + 50));
      }
      servicesInserted = values.length;
    }
  } else if (classification.skills.length > 0 && existingServiceNames.size === 0) {
    // Fallback: seed from classification skills when website doesn't have crawlable service pages
    const skillsToSeed = classification.skills.slice(0, 15);
    const values = skillsToSeed
      .filter((skill) => !existingServiceNames.has(skill.toLowerCase()))
      .map((skill, i) => ({
        id: uid("svc"),
        firmId,
        organizationId,
        name: skill,
        description: null,
        subServices: null,
        isHidden: false,
        displayOrder: i,
      }));

    if (values.length > 0) {
      await db.insert(firmServices).values(values);
      servicesInserted = values.length;
      console.log(`[DeepCrawl] Seeded ${values.length} services from classification skills (no crawlable service pages found)`);
    }
  }

  // Step 6: Bulk-insert case study URLs
  let caseStudiesInserted = 0;
  const caseStudyUrls = crawlResult.extracted.caseStudyUrls;

  if (caseStudyUrls.length > 0) {
    const existing = await db
      .select({ sourceUrl: firmCaseStudies.sourceUrl })
      .from(firmCaseStudies)
      .where(eq(firmCaseStudies.firmId, firmId));
    const existingUrls = new Set(existing.map((cs) => cs.sourceUrl));

    const newUrls = caseStudyUrls.filter((url) => !existingUrls.has(url));

    if (newUrls.length > 0) {
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
        await db.insert(firmCaseStudies).values(values.slice(i, i + 50));
      }
      caseStudiesInserted = values.length;
    }
  }

  // Step 7: Queue case study deep ingestion
  let caseStudiesQueued = 0;
  if (caseStudyUrls.length > 0) {
    const insertedCaseStudies = await db
      .select({ id: firmCaseStudies.id, sourceUrl: firmCaseStudies.sourceUrl })
      .from(firmCaseStudies)
      .where(eq(firmCaseStudies.firmId, firmId));

    const urlSet = new Set(caseStudyUrls);
    const toQueue = insertedCaseStudies.filter((r) => urlSet.has(r.sourceUrl));

    for (const cs of toQueue) {
      await enqueue("firm-case-study-ingest", {
        caseStudyId: cs.id,
        firmId,
        organizationId,
        sourceUrl: cs.sourceUrl,
        sourceType: "url",
      });
      caseStudiesQueued++;
    }
  }

  // Step 7b: Update service_firms enrichment status + data
  await db
    .update(serviceFirms)
    .set({
      enrichmentStatus: "enriched",
      enrichmentData: {
        classification: {
          categories: classification.categories,
          skills: classification.skills,
          industries: classification.industries,
          confidence: classification.confidence,
        },
        extracted: {
          services: crawlResult.extracted.services.map((s) => s.name),
          clients: crawlResult.extracted.clients,
          aboutPitch: crawlResult.extracted.aboutPitch,
          caseStudyUrls: crawlResult.extracted.caseStudyUrls,
        },
        pdl: pdlData
          ? {
              displayName: pdlData.displayName,
              industry: pdlData.industry,
              size: pdlData.size,
              employeeCount: pdlData.employeeCount,
              headline: pdlData.headline,
            }
          : null,
        enrichedAt: new Date().toISOString(),
      },
    })
    .where(eq(serviceFirms.id, firmId));
  console.log(`[DeepCrawl] Updated service_firms enrichment_status → enriched for ${firmId}`);

  // Step 8: Queue expert LinkedIn enrichment (top 20)
  const teamToEnrich = crawlResult.extracted.teamMembers.slice(0, 20);
  for (const member of teamToEnrich) {
    await enqueue("expert-linkedin", {
      expertId: `${firmId}:${member.name.toLowerCase().replace(/\s+/g, "-")}`,
      firmId,
      fullName: member.name,
      linkedinUrl: member.linkedinUrl,
      companyName: firmName,
      companyWebsite: website,
    });
  }

  // Step 9: Queue abstraction profile generation
  // Delayed 5 minutes so case-study and expert jobs can complete first
  await enqueue(
    "firm-abstraction",
    { firmId, organizationId },
    { delayMs: 5 * 60 * 1000 }
  );

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
    caseStudiesQueued,
    teamMembersQueued: teamToEnrich.length,
  };
}
