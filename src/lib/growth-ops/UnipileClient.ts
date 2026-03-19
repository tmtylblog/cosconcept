/**
 * Unipile API Client — LinkedIn integration.
 *
 * LESSONS LEARNED (from production):
 *  - createChat returns { chat_id } NOT { id } — always use chat.chat_id ?? chat.id
 *  - Message direction: trust is_sender first, then compare sender_id, then default inbound
 *  - Resolve provider_id via getProfile() BEFORE calling createChat
 *  - listMessages requires account_id as query param
 *  - Chat attendees do NOT include profile photos — need separate getProfile call
 */

const BASE_URL = process.env.UNIPILE_BASE_URL!;
const API_KEY = process.env.UNIPILE_API_KEY!;

async function req<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  timeoutMs = 30_000,
): Promise<T> {
  const url = `${BASE_URL}/api/v1${path}`;
  const headers: Record<string, string> = {
    "X-API-KEY": API_KEY,
    accept: "application/json",
  };
  if (body) headers["content-type"] = "application/json";

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Unipile ${method} ${path} → ${res.status}: ${text}`);
  }

  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface UnipileAccount {
  id: string;
  type: string;
  status: string;
  name?: string;
  created_at?: string;
  connection_params?: {
    im?: {
      premiumId?: string | null;
      premiumContractId?: string | null;
      premiumFeatures?: string[];
      organizations?: Array<{ organization_urn?: string; mailbox_urn?: string }>;
    };
    username?: string;
    name?: string;
    full_name?: string;
    first_name?: string;
    last_name?: string;
  };
}

export interface UnipileChatAttendee {
  attendee_id?: string;
  attendee_provider_id?: string;
  attendee_name?: string;
  attendee_headline?: string;
  attendee_profile_url?: string;
  is_self?: boolean;
}

export interface UnipileChat {
  id: string;
  account_id: string;
  provider_id?: string;
  timestamp?: string;
  name?: string;
  subject?: string;
  content_type?: string; // "inmail" or regular
  unread_count?: number;
  attendee_provider_id?: string;
  attendees?: UnipileChatAttendee[];
  last_message?: {
    text?: string;
    timestamp?: string;
    sender_id?: string;
  };
}

export interface UnipileMessage {
  id: string;
  chat_id?: string;
  provider_id?: string;
  text?: string;
  sender_id?: string;
  /** Primary direction flag — true = sent by account owner */
  is_sender?: boolean;
  timestamp?: string;
  seen?: boolean;
  delivered?: boolean;
  attachments?: unknown[];
}

export interface UnipileProfile {
  id?: string;
  provider_id?: string;
  public_identifier?: string;
  first_name?: string;
  last_name?: string;
  headline?: string;
  location?: string;
  profile_picture_url?: string;
  is_premium?: boolean;
  follower_count?: number;
  connection_count?: number;
}

/**
 * CRITICAL: createChat returns THIS shape, not UnipileChat.
 * Always extract id as: chat.chat_id ?? chat.id ?? chat.provider_id
 */
export interface UnipileChatCreated {
  object?: string;    // "ChatCreated"
  chat_id?: string;  // << THE REAL ID
  id?: string;
  provider_id?: string;
  message_id?: string;
}

export interface UnipileSearchResult {
  provider_id?: string;
  public_identifier?: string;
  first_name?: string;
  last_name?: string;
  headline?: string;
  location?: string;
  profile_picture_url?: string;
  company_name?: string;
  connection_degree?: string;
}

// ── Account Management ───────────────────────────────────────────────────────

export const UnipileClient = {
  listAccounts: (): Promise<{ items?: UnipileAccount[] }> =>
    req("GET", "/accounts"),

  getAccount: (accountId: string): Promise<UnipileAccount> =>
    req("GET", `/accounts/${accountId}`),

  deleteAccount: (accountId: string): Promise<void> =>
    req("DELETE", `/accounts/${accountId}`),

  generateHostedAuthLink: (
    callbackUrl: string,
    notifyUrl?: string,
    provider: "LINKEDIN" | "LINKEDIN_SALES_NAVIGATOR" = "LINKEDIN",
  ) =>
    req("POST", "/hosted/accounts/link", {
      type: "create",
      providers_filter: [provider],
      providers: [provider],
      api_url: BASE_URL,
      expiresOn: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      success_redirect_url: callbackUrl,
      failure_redirect_url: callbackUrl,
      ...(notifyUrl ? { notify_url: notifyUrl } : {}),
    }),

  generateReconnectLink: (
    accountId: string,
    callbackUrl: string,
    notifyUrl?: string,
  ) =>
    req("POST", "/hosted/accounts/link", {
      type: "reconnect",
      reconnect_account: accountId,
      api_url: BASE_URL,
      expiresOn: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      success_redirect_url: callbackUrl,
      failure_redirect_url: callbackUrl,
      ...(notifyUrl ? { notify_url: notifyUrl } : {}),
    }),

  // ── Conversations ──────────────────────────────────────────────────────────

  listChats: (
    accountId: string,
    opts?: { limit?: number; cursor?: string },
  ): Promise<{ items: UnipileChat[]; cursor?: string }> => {
    const p = new URLSearchParams({ account_id: accountId });
    if (opts?.limit) p.set("limit", String(opts.limit));
    if (opts?.cursor) p.set("cursor", opts.cursor);
    return req("GET", `/chats?${p}`);
  },

  /**
   * Get messages for a chat.
   * account_id is required by Unipile — without it direction metadata is missing.
   */
  listMessages: (
    chatId: string,
    accountId: string,
    opts?: { limit?: number; cursor?: string },
  ): Promise<{ items: UnipileMessage[]; cursor?: string }> => {
    const p = new URLSearchParams({ account_id: accountId });
    if (opts?.limit) p.set("limit", String(opts.limit));
    if (opts?.cursor) p.set("cursor", opts.cursor);
    return req("GET", `/chats/${encodeURIComponent(chatId)}/messages?${p}`);
  },

  sendMessage: (chatId: string, accountId: string, text: string): Promise<UnipileMessage> =>
    req("POST", `/chats/${encodeURIComponent(chatId)}/messages`, {
      account_id: accountId,
      text,
    }),

  /**
   * Start a new conversation.
   * IMPORTANT: Returns UnipileChatCreated with chat_id field (not id).
   * IMPORTANT: attendeeProviderId must be resolved via getProfile() first.
   */
  createChat: (
    accountId: string,
    attendeeProviderId: string,
    text: string,
    opts?: { inmail?: boolean },
  ): Promise<UnipileChatCreated> =>
    req("POST", "/chats", {
      account_id: accountId,
      text,
      attendees_ids: [attendeeProviderId],
      ...(opts?.inmail ? { inmail: true } : {}),
    }),

  // ── Profiles ───────────────────────────────────────────────────────────────

  /**
   * Get a LinkedIn profile. identifier can be a public_identifier (slug) or provider_id.
   * Use this before createChat to resolve the correct provider_id.
   */
  getProfile: (identifier: string, accountId: string): Promise<UnipileProfile> => {
    const p = new URLSearchParams({
      account_id: accountId,
      linkedin_sections: "*",
    });
    return req("GET", `/users/${encodeURIComponent(identifier)}?${p}`);
  },

  // ── Search ─────────────────────────────────────────────────────────────────

  searchLinkedIn: (
    accountId: string,
    opts: {
      keywords?: string;
      api?: "classic" | "sales_navigator" | "recruiter";
      category?: "people" | "companies";
      network?: string[];
      limit?: number;
      cursor?: string;
    },
  ): Promise<{ object?: string; items?: UnipileSearchResult[]; cursor?: string }> => {
    const p = new URLSearchParams({ account_id: accountId });
    return req("POST", `/linkedin/search?${p}`, {
      api: opts.api ?? "classic",
      category: opts.category ?? "people",
      ...(opts.keywords ? { keywords: opts.keywords } : {}),
      ...(opts.network ? { network: opts.network } : {}),
      ...(opts.limit ? { limit: opts.limit } : {}),
      ...(opts.cursor ? { cursor: opts.cursor } : {}),
    });
  },

  // ── Invitations ────────────────────────────────────────────────────────────

  sendInvite: (
    providerId: string,
    accountId: string,
    message?: string,
  ) =>
    req("POST", "/users/invite", {
      provider_id: providerId,
      account_id: accountId,
      ...(message ? { message } : {}),
    }),

  resolveLinkedInUser: (linkedinUrl: string, accountId: string) =>
    req("POST", "/users/search", { linkedin_url: linkedinUrl, account_id: accountId }),

  // ── Legacy association helpers (kept for invite scheduler) ────────────────

  getDealContacts: (dealId: string) =>
    req("GET", `/crm/v3/objects/deals/${dealId}/associations/contacts`),

  getDealCompany: (dealId: string) =>
    req("GET", `/crm/v3/objects/deals/${dealId}/associations/companies`),

  getContactDeals: (contactId: string) =>
    req("GET", `/crm/v3/objects/contacts/${contactId}/associations/deals`),
};

// ── Webhook Validation ────────────────────────────────────────────────────────

export function validateUnipileWebhook(headers: Record<string, string | null>): boolean {
  const secret = process.env.UNIPILE_WEBHOOK_SECRET;
  if (!secret) return true; // no secret configured = open (dev mode)
  const header = headers["unipile-auth"] ?? headers["Unipile-Auth"];
  return header === secret;
}

// ── Direction Helper ─────────────────────────────────────────────────────────

/**
 * 3-tier message direction logic from production experience.
 * 1. Trust is_sender if present
 * 2. Compare sender_id against the other participant's provider_id
 * 3. Default to inbound (false)
 */
export function resolveMessageDirection(
  msg: UnipileMessage,
  participantProviderId?: string | null,
): boolean {
  if (msg.is_sender != null) return !!msg.is_sender;
  if (participantProviderId && msg.sender_id) {
    return msg.sender_id !== participantProviderId;
  }
  return false; // default inbound
}
