/**
 * Auto-create Person + Company from LinkedIn conversation participant data.
 *
 * Called from the Unipile webhook on every inbound message. Creates records
 * in acqContacts + acqCompanies using whatever data Unipile provides.
 * No PDL enrichment — that can happen asynchronously later.
 */

import { db } from "@/lib/db";
import { acqContacts, acqCompanies, prospectTimeline } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

interface ParticipantData {
  name: string | null;
  headline: string | null;
  profileUrl: string | null;
  providerId: string | null;
}

interface AutoCreateResult {
  contactId: string | null;
  companyId: string | null;
  isNewContact: boolean;
  isNewCompany: boolean;
}

/**
 * Parse company name from a LinkedIn headline.
 * Common patterns: "VP Marketing at Acme Corp", "CEO | Acme Inc", "Founder, Acme"
 */
function parseCompanyFromHeadline(headline: string): string | null {
  // "... at CompanyName"
  const atMatch = headline.match(/\bat\s+(.+?)(?:\s*[|·•]\s*|\s*$)/i);
  if (atMatch) return atMatch[1].trim();

  // "Title | CompanyName" or "Title · CompanyName"
  const pipeMatch = headline.match(/[|·•]\s*(.+?)(?:\s*[|·•]\s*|\s*$)/);
  if (pipeMatch) {
    const candidate = pipeMatch[1].trim();
    // Skip if it looks like another title rather than a company
    if (candidate.length > 2 && !candidate.match(/^(and|or|the|a)\s/i)) {
      return candidate;
    }
  }

  // "Title, CompanyName"
  const commaMatch = headline.match(/,\s*(.+?)(?:\s*[|·•]\s*|\s*$)/);
  if (commaMatch) {
    const candidate = commaMatch[1].trim();
    if (candidate.length > 2 && !candidate.match(/^(and|or|the|a|inc|llc|ltd)\s*$/i)) {
      return candidate;
    }
  }

  return null;
}

function randomId() {
  return crypto.randomUUID();
}

/**
 * Ensure a contact and company exist for a LinkedIn conversation participant.
 * Upserts by linkedinUrl (contacts) and name (companies).
 */
export async function ensureContactAndCompany(
  participant: ParticipantData
): Promise<AutoCreateResult> {
  const result: AutoCreateResult = {
    contactId: null,
    companyId: null,
    isNewContact: false,
    isNewCompany: false,
  };

  const linkedinUrl = participant.profileUrl;
  if (!linkedinUrl) return result;

  // Check if contact already exists by linkedinUrl
  const [existing] = await db
    .select({ id: acqContacts.id })
    .from(acqContacts)
    .where(eq(acqContacts.linkedinUrl, linkedinUrl))
    .limit(1);

  if (existing) {
    result.contactId = existing.id;
    return result;
  }

  // Parse name
  const nameParts = (participant.name || "").trim().split(/\s+/);
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ") || "";

  // Parse company from headline
  let companyId: string | null = null;
  const companyName = participant.headline
    ? parseCompanyFromHeadline(participant.headline)
    : null;

  if (companyName) {
    // Check if company already exists by name (case-insensitive)
    const [existingCo] = await db
      .select({ id: acqCompanies.id })
      .from(acqCompanies)
      .where(eq(acqCompanies.name, companyName))
      .limit(1);

    if (existingCo) {
      companyId = existingCo.id;
    } else {
      companyId = randomId();
      await db.insert(acqCompanies).values({
        id: companyId,
        name: companyName,
      });
      result.isNewCompany = true;
    }
    result.companyId = companyId;
  }

  // Create the contact
  // acqContacts.email is NOT NULL + UNIQUE — use a LinkedIn placeholder
  // since we don't have the email from LinkedIn
  const placeholderEmail = `linkedin+${participant.providerId || randomId()}@placeholder.local`;

  const contactId = randomId();
  try {
    await db.insert(acqContacts).values({
      id: contactId,
      email: placeholderEmail,
      firstName,
      lastName,
      linkedinUrl,
      companyId,
    });
    result.contactId = contactId;
    result.isNewContact = true;
  } catch (err) {
    // Unique constraint on email — contact might have been created concurrently
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("unique") || message.includes("duplicate")) {
      // Find the existing contact
      const [dup] = await db
        .select({ id: acqContacts.id })
        .from(acqContacts)
        .where(eq(acqContacts.linkedinUrl, linkedinUrl))
        .limit(1);
      result.contactId = dup?.id ?? null;
    } else {
      throw err;
    }
  }

  return result;
}

/**
 * Log a LinkedIn message event to the prospect timeline.
 */
export async function logLinkedInMessageEvent(
  email: string,
  name: string | null,
  channel: string = "linkedin"
) {
  try {
    await db.insert(prospectTimeline).values({
      id: randomId(),
      prospectEmail: email,
      prospectName: name,
      eventType: "linkedin_message",
      channel,
      eventAt: new Date(),
    });
  } catch {
    // Non-critical — don't fail the webhook
  }
}
