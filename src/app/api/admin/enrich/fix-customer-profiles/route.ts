/**
 * POST /api/admin/enrich/fix-customer-profiles
 *
 * One-time cleanup: hydrates customer service_firms rows from enrichment_cache.
 *
 * For each real customer, infers the firm's domain from the owner's email,
 * looks up enrichment_cache, and applies enrichment data if a classified
 * cache entry exists. Also writes the firm to Neo4j and queues an abstraction
 * profile job.
 *
 * Body params:
 *   dryRun?: boolean  — report what would change without writing (default false)
 *   force?: boolean   — re-apply even for already-enriched firms (default false)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import {
  serviceFirms,
  enrichmentCache,
  users,
  members,
  organizations,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import { writeFirmToGraph } from "@/lib/enrichment/graph-writer";
import type { FirmClassification } from "@/lib/enrichment/ai-classifier";
import type { FirmGroundTruth } from "@/lib/enrichment/jina-scraper";

const SKIP_DOMAINS = ["test.net", "example.com", "testfirm.com"];

function calcCompleteness(data: Record<string, unknown>): number {
  let score = 0, total = 0;
  const check = (val: unknown) => {
    total++;
    if (val && (typeof val !== "object" || (Array.isArray(val) && val.length > 0)))
      score++;
  };
  check(data.companyData);
  check(data.groundTruth);
  const ex = data.extracted as Record<string, unknown> | null;
  check(ex?.clients); check(ex?.services); check(ex?.aboutPitch);
  check(ex?.teamMembers); check(ex?.caseStudyUrls);
  const cl = data.classification as Record<string, unknown> | null;
  check(cl?.categories); check(cl?.skills); check(cl?.industries);
  return total > 0 ? score / total : 0;
}

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || !["admin", "superadmin"].includes(session.user.role ?? ""))
    return null;
  return session.user;
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as {
    dryRun?: boolean;
    force?: boolean;
  };
  const dryRun = body.dryRun === true;
  const force = body.force === true;

  // Get all customers: user → member(owner) → org → service_firm
  const customers = await db
    .select({
      email: users.email,
      firmId: serviceFirms.id,
      firmName: serviceFirms.name,
      organizationId: serviceFirms.organizationId,
      enrichmentStatus: serviceFirms.enrichmentStatus,
    })
    .from(users)
    .innerJoin(
      members,
      and(eq(members.userId, users.id), eq(members.role, "owner"))
    )
    .innerJoin(organizations, eq(organizations.id, members.organizationId))
    .innerJoin(serviceFirms, eq(serviceFirms.organizationId, organizations.id));

  // Load all enrichment cache entries into a map for fast lookup
  const allCache = await db.select().from(enrichmentCache);
  const cacheByDomain = new Map(allCache.map((c) => [c.domain, c]));

  const results = {
    total: customers.length,
    fixed: 0,
    alreadyEnriched: 0,
    noCache: 0,
    skipped: 0,
    errors: [] as string[],
    details: [] as { email: string; firmId: string; action: string }[],
  };

  for (const customer of customers) {
    const domain = customer.email?.split("@")[1];

    // Skip test / junk accounts
    const isTest =
      !domain ||
      SKIP_DOMAINS.some((s) => domain.includes(s)) ||
      customer.email?.startsWith("test@") ||
      customer.email?.startsWith("testnav@");

    if (isTest) {
      results.skipped++;
      results.details.push({
        email: customer.email,
        firmId: customer.firmId,
        action: "skipped (test account)",
      });
      continue;
    }

    // Skip already-enriched firms unless force=true
    if (customer.enrichmentStatus === "enriched" && !force) {
      results.alreadyEnriched++;
      results.details.push({
        email: customer.email,
        firmId: customer.firmId,
        action: "skipped (already enriched)",
      });
      continue;
    }

    const cached = cacheByDomain.get(domain);
    if (!cached?.hasClassify) {
      results.noCache++;
      results.details.push({
        email: customer.email,
        firmId: customer.firmId,
        action: `no classified cache for ${domain}`,
      });
      continue;
    }

    // Build enrichment payload from cache
    const cData = (cached.enrichmentData || {}) as Record<string, unknown>;
    const classification = cData.classification as Record<string, unknown> | null;
    const extracted = cData.extracted as Record<string, unknown> | null;
    const companyData = cData.companyData as Record<string, unknown> | null;

    const websiteUrl = `https://${domain}`;
    const firmName =
      cached.firmName ||
      (companyData?.name as string | undefined) ||
      customer.firmName ||
      "Unknown Firm";
    const logoUrl = `https://img.logo.dev/${domain}?token=pk_anonymous&size=128&format=png`;

    const enrichmentData = {
      ...cData,
      url: websiteUrl,
      domain,
      logoUrl,
      success: true,
    };

    if (!dryRun) {
      try {
        // Upsert service_firms with full enrichment data
        await db
          .update(serviceFirms)
          .set({
            name: firmName,
            website: websiteUrl,
            description: (extracted?.aboutPitch as string) || null,
            enrichmentData,
            enrichmentStatus: "enriched",
            classificationConfidence:
              (classification?.confidence as number) || null,
            profileCompleteness: calcCompleteness(enrichmentData),
            updatedAt: new Date(),
          })
          .where(eq(serviceFirms.id, customer.firmId));

        // Queue abstraction profile
        await inngest.send({
          name: "enrich/firm-abstraction",
          data: { firmId: customer.firmId, organizationId: customer.organizationId },
        });

        // Write to Neo4j knowledge graph (best-effort)
        try {
          const groundTruth: FirmGroundTruth | null = extracted
            ? {
                homepage: {
                  url: websiteUrl,
                  title: "",
                  content: "",
                  scrapedAt: new Date().toISOString(),
                },
                evidence: [],
                extracted: {
                  clients: (extracted.clients as string[]) || [],
                  caseStudyUrls: (extracted.caseStudyUrls as string[]) || [],
                  services: (extracted.services as string[]) || [],
                  aboutPitch: (extracted.aboutPitch as string) || "",
                  teamMembers: (extracted.teamMembers as never[]) || [],
                },
                rawContent: "",
                pageTitles: [],
              }
            : null;

          await writeFirmToGraph({
            firmId: customer.firmId,
            organizationId: customer.organizationId,
            name: firmName,
            website: websiteUrl,
            logoUrl,
            description: (extracted?.aboutPitch as string) || undefined,
            foundedYear: (companyData?.founded as number) || undefined,
            employeeCount: (companyData?.employeeCount as number) || undefined,
            groundTruth,
            classification: classification as FirmClassification | null,
          });
        } catch {
          // Non-blocking — Neo4j failure doesn't break the cleanup
        }

        results.fixed++;
        results.details.push({
          email: customer.email,
          firmId: customer.firmId,
          action: `fixed: "${firmName}" (${domain})`,
        });

        console.log(
          `[FixCustomers] Updated ${customer.firmId} → "${firmName}" (${domain})`
        );
      } catch (err) {
        results.errors.push(`${customer.email}: ${String(err)}`);
        results.details.push({
          email: customer.email,
          firmId: customer.firmId,
          action: `error: ${String(err)}`,
        });
      }
    } else {
      // Dry run — just report what would happen
      results.fixed++;
      results.details.push({
        email: customer.email,
        firmId: customer.firmId,
        action: `would fix: "${firmName}" (${domain})`,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    ...results,
    message: dryRun
      ? `Dry run: would fix ${results.fixed} of ${results.total} customer profiles`
      : `Fixed ${results.fixed} of ${results.total} profiles` +
        (results.noCache ? ` — ${results.noCache} missing cache` : "") +
        (results.skipped ? ` — ${results.skipped} test accounts skipped` : "") +
        (results.alreadyEnriched ? ` — ${results.alreadyEnriched} already enriched` : "") +
        (results.errors.length ? ` — ${results.errors.length} errors` : ""),
  });
}
