/**
 * Handler: network-scan
 *
 * Reads email headers from Gmail or Microsoft Graph for a connected user,
 * scores relationship strength per domain, matches against service_firms,
 * and stores results in network_relationships.
 */

import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { networkConnections, networkRelationships, serviceFirms } from "@/lib/db/schema";
import {
  scanGmailHeaders,
  scanMicrosoftHeaders,
  scoreContact,
  extractFirmDomain,
  refreshGoogleToken,
  refreshMicrosoftToken,
} from "@/lib/enrichment/network-scanner";

interface Payload {
  userId: string;
  organizationId: string;
  provider: "google" | "microsoft";
  connectionId: string;
}

function uid(): string {
  return `nr_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

export async function handleNetworkScan(
  payload: Record<string, unknown>
): Promise<unknown> {
  const { userId, organizationId, provider, connectionId } = payload as unknown as Payload;

  // Step 1: Load connection + token
  const [connection] = await db
    .select()
    .from(networkConnections)
    .where(eq(networkConnections.id, connectionId))
    .limit(1);

  if (!connection) {
    throw new Error(`Network connection ${connectionId} not found`);
  }

  let accessToken = connection.accessToken;

  // Step 2: Refresh token if expired or about to expire (within 5 min)
  if (
    connection.expiresAt &&
    connection.expiresAt.getTime() < Date.now() + 5 * 60 * 1000 &&
    connection.refreshToken
  ) {
    console.log(`[NetworkScan] Refreshing ${provider} token...`);
    const refreshed =
      provider === "google"
        ? await refreshGoogleToken(connection.refreshToken)
        : await refreshMicrosoftToken(connection.refreshToken);

    if (refreshed) {
      accessToken = refreshed.accessToken;
      await db
        .update(networkConnections)
        .set({ accessToken: refreshed.accessToken, expiresAt: refreshed.expiresAt, updatedAt: new Date() })
        .where(eq(networkConnections.id, connectionId));
    }
  }

  // Step 3: Set status → scanning
  await db
    .update(networkConnections)
    .set({ scanStatus: "scanning", scanError: null, updatedAt: new Date() })
    .where(eq(networkConnections.id, connectionId));

  try {
    const since = new Date();
    since.setFullYear(since.getFullYear() - 3); // last 3 years

    const ownEmail = connection.providerEmail ?? "";

    // Step 4: Fetch email headers
    console.log(`[NetworkScan] Scanning ${provider} headers for ${ownEmail}...`);
    const contacts =
      provider === "google"
        ? await scanGmailHeaders(accessToken, since, ownEmail)
        : await scanMicrosoftHeaders(accessToken, since, ownEmail);

    console.log(`[NetworkScan] Found ${contacts.length} unique domains`);

    // Step 5: Load firm domain map
    const firms = await db
      .select({ id: serviceFirms.id, name: serviceFirms.name, website: serviceFirms.website })
      .from(serviceFirms)
      .where(eq(serviceFirms.isCosCustomer, true)); // only match against real COS firms

    const firmDomainMap = new Map<string, { id: string; name: string; website: string }>();
    for (const firm of firms) {
      if (!firm.website) continue;
      const domain = extractFirmDomain(firm.website);
      if (domain) firmDomainMap.set(domain, { id: firm.id, name: firm.name, website: firm.website });
    }

    // Step 6: Score contacts and upsert relationships (skip very weak)
    let inserted = 0;
    let matched = 0;
    const now = new Date();

    for (const contact of contacts) {
      const scored = scoreContact(contact);
      // null = failed hard gates (not bidirectional, or < 3 exchanges)
      if (!scored) continue;

      const firmMatch = firmDomainMap.get(contact.domain);
      if (firmMatch) matched++;

      // Determine a display name for unmatched domains
      const firmName = firmMatch?.name ?? contact.displayName ?? contact.domain;

      // Upsert
      await db
        .insert(networkRelationships)
        .values({
          id: uid(),
          userId,
          organizationId,
          firmDomain: contact.domain,
          firmName,
          firmId: firmMatch?.id ?? null,
          firmWebsite: firmMatch?.website ?? null,
          tier: scored.tier,
          strength: scored.strength,
          emailCount: contact.emailCount,
          sentCount: contact.sentCount,
          receivedCount: contact.receivedCount,
          lastContactAt: contact.lastContactAt,
          bidirectional: contact.sentCount > 0 && contact.receivedCount > 0,
          provider,
          scannedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [networkRelationships.userId, networkRelationships.firmDomain, networkRelationships.provider],
          set: {
            firmName,
            firmId: firmMatch?.id ?? null,
            firmWebsite: firmMatch?.website ?? null,
            tier: scored.tier,
            strength: scored.strength,
            emailCount: contact.emailCount,
            sentCount: contact.sentCount,
            receivedCount: contact.receivedCount,
            lastContactAt: contact.lastContactAt,
            bidirectional: contact.sentCount > 0 && contact.receivedCount > 0,
            scannedAt: now,
            updatedAt: now,
          },
        });

      inserted++;
    }

    // Step 7: Mark done
    await db
      .update(networkConnections)
      .set({
        scanStatus: "done",
        lastScanAt: now,
        emailsProcessed: contacts.reduce((sum, c) => sum + c.emailCount, 0),
        updatedAt: now,
      })
      .where(eq(networkConnections.id, connectionId));

    console.log(`[NetworkScan] Done. ${inserted} relationships stored, ${matched} matched to COS firms`);

    return {
      provider,
      domainsFound: contacts.length,
      relationshipsStored: inserted,
      cosMatches: matched,
    };
  } catch (err) {
    await db
      .update(networkConnections)
      .set({ scanStatus: "error", scanError: String(err), updatedAt: new Date() })
      .where(eq(networkConnections.id, connectionId));
    throw err;
  }
}
