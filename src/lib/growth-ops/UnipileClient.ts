const BASE_URL = process.env.UNIPILE_BASE_URL!;
const API_KEY = process.env.UNIPILE_API_KEY!;

async function req(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE_URL}/api/v1${path}`, {
    method,
    headers: {
      "X-API-KEY": API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Unipile ${method} ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

export const UnipileClient = {
  generateHostedAuthLink: (callbackUrl: string) =>
    req("POST", "/hosted/accounts/link", {
      type: "create",
      providers: ["LINKEDIN"],
      api_url: BASE_URL,
      expiresOn: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      success_redirect_url: callbackUrl,
      failure_redirect_url: callbackUrl,
    }),

  generateReconnectLink: (accountId: string, callbackUrl: string) =>
    req("POST", "/hosted/accounts/link", {
      type: "reconnect",
      reconnect_account: accountId,
      api_url: BASE_URL,
      expiresOn: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      success_redirect_url: callbackUrl,
      failure_redirect_url: callbackUrl,
    }),

  listAccounts: () => req("GET", "/accounts"),

  listChats: (accountId: string, cursor?: string) =>
    req("GET", `/chats?account_id=${accountId}${cursor ? `&cursor=${cursor}` : ""}`),

  getChatMessages: (chatId: string) =>
    req("GET", `/chats/${chatId}/messages`),

  sendMessage: (chatId: string, text: string) =>
    req("POST", `/chats/${chatId}/messages`, { text }),

  resolveLinkedInUser: (linkedinUrl: string, accountId: string) =>
    req("POST", "/users/search", { linkedin_url: linkedinUrl, account_id: accountId }),

  sendInvite: (providerId: string, accountId: string, message?: string) =>
    req("POST", "/users/invite", {
      provider_id: providerId,
      account_id: accountId,
      ...(message ? { message } : {}),
    }),
};
