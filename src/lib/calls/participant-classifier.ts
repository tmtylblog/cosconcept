/**
 * Participant Domain Classifier
 *
 * Given a list of participant email addresses from a calendar invite,
 * separates them into:
 *   - Service providers (firms on our platform → auto-associate)
 *   - External companies (clients/prospects → auto-research)
 *
 * Also builds a context string for opportunity extraction.
 */

import { db } from "@/lib/db";
import { serviceFirms, companyResearch } from "@/lib/db/schema";
import { eq, or, ilike } from "drizzle-orm";

// Common email providers — skip these for company lookups
const FREEMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "hotmail.com", "outlook.com",
  "aol.com", "icloud.com", "me.com", "mac.com", "live.com", "msn.com",
  "protonmail.com", "proton.me", "fastmail.com", "hey.com", "mail.com",
  "zoho.com", "yandex.com", "gmx.com", "gmx.net",
]);

// Our own platform domains — skip
const PLATFORM_DOMAINS = new Set([
  "joincollectiveos.com", "collectiveos.com",
]);

export interface ClassifiedParticipants {
  /** Service provider firms found on our platform */
  serviceProviders: { firmId: string; firmName: string; domain: string }[];
  /** External company domains that should be researched */
  externalDomains: string[];
  /** Domains we skipped (freemail, platform, etc.) */
  skippedDomains: string[];
  /** Pre-built context string for the opportunity extractor */
  contextString: string;
}

/**
 * Extract unique company domains from participant email addresses.
 * Filters out freemail providers and our own platform domains.
 */
function extractCompanyDomains(emails: string[]): string[] {
  const domains = new Set<string>();
  for (const email of emails) {
    const match = email.toLowerCase().trim().match(/@([\w.-]+)/);
    if (!match) continue;
    const domain = match[1].replace(/^(mail|smtp|mg|em|bounce|reply)\./i, "");
    if (!FREEMAIL_DOMAINS.has(domain) && !PLATFORM_DOMAINS.has(domain)) {
      domains.add(domain);
    }
  }
  return Array.from(domains);
}

/**
 * Classify participant domains into service providers vs external companies.
 * Looks up each domain against our serviceFirms table (by website/domain match).
 */
export async function classifyParticipants(
  participantEmails: string[]
): Promise<ClassifiedParticipants> {
  const companyDomains = extractCompanyDomains(participantEmails);
  const serviceProviders: ClassifiedParticipants["serviceProviders"] = [];
  const externalDomains: string[] = [];
  const skippedDomains: string[] = [];

  // Check all freemail/platform domains
  for (const email of participantEmails) {
    const match = email.toLowerCase().trim().match(/@([\w.-]+)/);
    if (!match) continue;
    const domain = match[1];
    if (FREEMAIL_DOMAINS.has(domain) || PLATFORM_DOMAINS.has(domain)) {
      if (!skippedDomains.includes(domain)) skippedDomains.push(domain);
    }
  }

  for (const domain of companyDomains) {
    // Check if this domain belongs to a service provider on our platform
    // Match against website field (which stores domains like "chameleoncollective.com")
    const firms = await db
      .select({ id: serviceFirms.id, name: serviceFirms.name, website: serviceFirms.website })
      .from(serviceFirms)
      .where(
        or(
          ilike(serviceFirms.website, `%${domain}%`),
          eq(serviceFirms.website, domain),
          eq(serviceFirms.website, `https://${domain}`),
          eq(serviceFirms.website, `https://www.${domain}`),
        )
      )
      .limit(1);

    if (firms[0]) {
      serviceProviders.push({
        firmId: firms[0].id,
        firmName: firms[0].name,
        domain,
      });
    } else {
      externalDomains.push(domain);
    }
  }

  // Build context string
  const contextParts: string[] = [];

  if (serviceProviders.length > 0) {
    contextParts.push(
      `## SERVICE PROVIDERS ON CALL (from our platform)\n` +
      serviceProviders.map((sp) => `- ${sp.firmName} (${sp.domain})`).join("\n")
    );
  }

  // Look up any existing research for external domains
  for (const domain of externalDomains) {
    try {
      const [research] = await db
        .select()
        .from(companyResearch)
        .where(eq(companyResearch.domain, domain))
        .limit(1);

      if (research) {
        const parts: string[] = [`## CLIENT: ${research.companyName} (${domain})`];
        if (research.executiveSummary) parts.push(`About: ${research.executiveSummary}`);
        if (research.industryInsight) parts.push(`Industry: ${research.industryInsight}`);
        if (research.growthChallenges) parts.push(`Known challenges: ${research.growthChallenges}`);
        if (research.stageInsight) parts.push(`Stage: ${research.stageInsight}`);
        if (research.offeringSummary) parts.push(`They offer: ${research.offeringSummary}`);
        contextParts.push(parts.join("\n"));
      } else {
        contextParts.push(`## EXTERNAL COMPANY: ${domain} (no research available yet)`);
      }
    } catch {
      contextParts.push(`## EXTERNAL COMPANY: ${domain}`);
    }
  }

  return {
    serviceProviders,
    externalDomains,
    skippedDomains,
    contextString: contextParts.join("\n\n"),
  };
}
