const BASE_URL = "https://api.instantly.ai/api/v2";
const API_KEY = process.env.INSTANTLY_API_KEY!;

async function req(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Instantly ${method} ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

export const InstantlyClient = {
  listCampaigns: (limit = 100) => req("GET", `/campaigns?limit=${limit}`),
  getCampaign: (id: string) => req("GET", `/campaigns/${id}`),
  // Analytics endpoint not available in v2 — use listLeads to aggregate
  listLeads: (campaignId: string, limit = 100, cursor?: string) =>
    req("POST", "/leads/list", {
      campaign_id: campaignId,
      limit,
      ...(cursor ? { starting_after: cursor } : {}),
    }),
  listEmailAccounts: () => req("GET", "/accounts?limit=100"),
};
