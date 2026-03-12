/**
 * network-scanner.ts
 *
 * Fetches email headers (From/To/Date — NO body content) from Gmail and
 * Microsoft Graph, aggregates contact frequency by domain, and scores
 * relationship strength. Used by the network-scan background job.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DomainContact {
  domain: string;
  displayName: string; // best name seen for this domain
  emailCount: number;
  sentCount: number;
  receivedCount: number;
  lastContactAt: Date;
}

export type RelationshipTier = "weak" | "fair" | "strong";

export interface ScoredContact extends DomainContact {
  tier: RelationshipTier;
  strength: number; // 0-1
}

// ─── Skip list ────────────────────────────────────────────────────────────────

const SKIP_DOMAINS = new Set([
  // Personal email providers
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk",
  "outlook.com", "hotmail.com", "hotmail.co.uk", "live.com",
  "icloud.com", "me.com", "mac.com", "aol.com", "protonmail.com",
  "proton.me", "hey.com", "fastmail.com", "zoho.com",
  // Transactional / system domains
  "noreply.com", "no-reply.com", "donotreply.com", "bounce.com",
  "notifications.com", "mailer.com", "sendgrid.net", "mailchimp.com",
  "amazonses.com", "mailgun.org",
  // Common SaaS tools
  "calendly.com", "zoom.us", "slack.com", "notion.so", "loom.com",
  "hubspot.com", "salesforce.com", "intercom.io", "zendesk.com",
  "typeform.com", "docusign.com", "dropbox.com", "box.com",
  "github.com", "linear.app", "figma.com", "miro.com",
  "joincollectiveos.com",
]);

function shouldSkipDomain(domain: string): boolean {
  if (!domain || domain.length < 4) return true;
  if (SKIP_DOMAINS.has(domain)) return true;
  // Skip obviously auto-generated subdomains
  if (domain.includes("noreply") || domain.includes("no-reply")) return true;
  return false;
}

function extractDomain(email: string): string | null {
  const match = email.toLowerCase().match(/@([\w.-]+)/);
  if (!match) return null;
  const domain = match[1];
  // Strip common subdomains like mail., smtp., mg., em.
  return domain.replace(/^(mail|smtp|mg|em|bounce|reply)\./i, "");
}

function extractName(emailHeader: string): string {
  // "John Smith <john@example.com>" → "John Smith"
  // "john@example.com" → "example.com"
  const nameMatch = emailHeader.match(/^"?([^"<]+)"?\s*</);
  if (nameMatch) return nameMatch[1].trim();
  const domain = extractDomain(emailHeader);
  return domain ?? emailHeader;
}

// ─── Gmail Scanner ────────────────────────────────────────────────────────────

interface GmailMessage {
  id: string;
  threadId: string;
}

interface GmailMessageMetadata {
  payload?: {
    headers?: { name: string; value: string }[];
  };
  internalDate?: string;
  labelIds?: string[];
}

export async function scanGmailHeaders(
  accessToken: string,
  since: Date,
  ownEmail: string
): Promise<DomainContact[]> {
  const ownDomain = extractDomain(ownEmail) ?? "";
  const sinceStr = `${since.getFullYear()}/${String(since.getMonth() + 1).padStart(2, "0")}/${String(since.getDate()).padStart(2, "0")}`;

  // Step 1: Paginate through message IDs (inbox + sent)
  const messageIds: string[] = [];
  let pageToken: string | undefined;
  let pages = 0;

  while (pages < 20) { // max 2000 messages (100/page × 20 pages)
    const params = new URLSearchParams({
      maxResults: "100",
      q: `after:${sinceStr}`,
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) break;
    const data = await res.json() as { messages?: GmailMessage[]; nextPageToken?: string };

    for (const msg of data.messages ?? []) {
      messageIds.push(msg.id);
    }

    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
    pages++;
  }

  // Step 2: Fetch metadata in batches of 50
  const domainMap = new Map<string, DomainContact>();

  for (let i = 0; i < messageIds.length; i += 50) {
    const batch = messageIds.slice(i, i + 50);
    await Promise.all(batch.map(async (id) => {
      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!res.ok) return;
      const msg = await res.json() as GmailMessageMetadata;
      const headers = msg.payload?.headers ?? [];

      const fromHeader = headers.find(h => h.name === "From")?.value ?? "";
      const toHeader = headers.find(h => h.name === "To")?.value ?? "";
      const dateHeader = headers.find(h => h.name === "Date")?.value;
      const date = dateHeader ? new Date(dateHeader) : new Date();
      const isSent = msg.labelIds?.includes("SENT") ?? false;

      // Collect all counterpart addresses
      const counterpartAddresses: string[] = [];
      if (isSent) {
        // We sent it — To is the counterpart
        counterpartAddresses.push(...toHeader.split(",").map(s => s.trim()));
      } else {
        // We received it — From is the counterpart
        counterpartAddresses.push(fromHeader.trim());
      }

      for (const addr of counterpartAddresses) {
        const domain = extractDomain(addr);
        if (!domain || shouldSkipDomain(domain) || domain === ownDomain) continue;

        const existing = domainMap.get(domain);
        const name = extractName(addr);
        if (!existing) {
          domainMap.set(domain, {
            domain,
            displayName: name,
            emailCount: 1,
            sentCount: isSent ? 1 : 0,
            receivedCount: isSent ? 0 : 1,
            lastContactAt: date,
          });
        } else {
          existing.emailCount++;
          if (isSent) existing.sentCount++;
          else existing.receivedCount++;
          if (date > existing.lastContactAt) {
            existing.lastContactAt = date;
            existing.displayName = name; // update to most recent name seen
          }
        }
      }
    }));
  }

  return Array.from(domainMap.values()).sort((a, b) => b.emailCount - a.emailCount);
}

// ─── Microsoft Graph Scanner ──────────────────────────────────────────────────

interface GraphMessage {
  from?: { emailAddress?: { address?: string; name?: string } };
  toRecipients?: { emailAddress?: { address?: string; name?: string } }[];
  receivedDateTime?: string;
  isDraft?: boolean;
  // sent items folder messages have sender = own address, toRecipients = counterparts
}

export async function scanMicrosoftHeaders(
  accessToken: string,
  since: Date,
  ownEmail: string
): Promise<DomainContact[]> {
  const ownDomain = extractDomain(ownEmail) ?? "";
  const sinceIso = since.toISOString();

  const domainMap = new Map<string, DomainContact>();

  // Scan both inbox (received) and sent items
  const folders = [
    { url: `https://graph.microsoft.com/v1.0/me/messages?$select=from,toRecipients,receivedDateTime,isDraft&$filter=receivedDateTime ge ${sinceIso} and isDraft eq false&$top=100`, isSent: false },
    { url: `https://graph.microsoft.com/v1.0/me/mailFolders/SentItems/messages?$select=from,toRecipients,receivedDateTime&$top=100`, isSent: true },
  ];

  for (const folder of folders) {
    let url: string | null = folder.url;
    let pages = 0;

    while (url && pages < 20) {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) break;
      const data = await res.json() as { value?: GraphMessage[]; "@odata.nextLink"?: string };

      for (const msg of data.value ?? []) {
        if (msg.isDraft) continue;
        const date = msg.receivedDateTime ? new Date(msg.receivedDateTime) : new Date();

        const counterparts = folder.isSent
          ? (msg.toRecipients ?? []).map(r => ({ address: r.emailAddress?.address ?? "", name: r.emailAddress?.name ?? "" }))
          : [{ address: msg.from?.emailAddress?.address ?? "", name: msg.from?.emailAddress?.name ?? "" }];

        for (const { address, name } of counterparts) {
          const domain = extractDomain(address);
          if (!domain || shouldSkipDomain(domain) || domain === ownDomain) continue;

          const existing = domainMap.get(domain);
          if (!existing) {
            domainMap.set(domain, {
              domain,
              displayName: name || domain,
              emailCount: 1,
              sentCount: folder.isSent ? 1 : 0,
              receivedCount: folder.isSent ? 0 : 1,
              lastContactAt: date,
            });
          } else {
            existing.emailCount++;
            if (folder.isSent) existing.sentCount++;
            else existing.receivedCount++;
            if (date > existing.lastContactAt) {
              existing.lastContactAt = date;
              if (name) existing.displayName = name;
            }
          }
        }
      }

      url = data["@odata.nextLink"] ?? null;
      pages++;
    }
  }

  return Array.from(domainMap.values()).sort((a, b) => b.emailCount - a.emailCount);
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

export function scoreContact(contact: DomainContact): ScoredContact {
  const daysSince = Math.max(
    0,
    (Date.now() - contact.lastContactAt.getTime()) / 86400000
  );
  const recency = Math.exp(-0.02 * daysSince); // half-life ~35 days
  const frequency = Math.min(contact.emailCount / 20, 1.0);
  const biBonus = contact.sentCount > 0 && contact.receivedCount > 0 ? 0.15 : 0;
  const strength = Math.min(recency * 0.35 + frequency * 0.50 + biBonus, 1.0);

  const tier: RelationshipTier =
    strength >= 0.65 ? "strong" :
    strength >= 0.35 ? "fair" : "weak";

  return { ...contact, tier, strength };
}

// ─── Firm domain matching ─────────────────────────────────────────────────────

export function extractFirmDomain(website: string): string | null {
  try {
    const url = new URL(website.startsWith("http") ? website : `https://${website}`);
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

// Token refresh helpers

export async function refreshGoogleToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresAt: Date;
} | null> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.NETWORK_GOOGLE_CLIENT_ID!,
      client_secret: process.env.NETWORK_GOOGLE_CLIENT_SECRET!,
    }),
  });
  if (!res.ok) return null;
  const data = await res.json() as { access_token: string; expires_in: number };
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

export async function refreshMicrosoftToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresAt: Date;
} | null> {
  const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.NETWORK_MICROSOFT_CLIENT_ID!,
      client_secret: process.env.NETWORK_MICROSOFT_CLIENT_SECRET!,
      scope: "Mail.ReadBasic offline_access",
    }),
  });
  if (!res.ok) return null;
  const data = await res.json() as { access_token: string; expires_in: number };
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}
