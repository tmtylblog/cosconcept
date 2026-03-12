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
  listCampaigns: () => req("GET", "/campaigns?limit=100&status=all"),
  getCampaign: (id: string) => req("GET", `/campaigns/${id}`),
  getCampaignAnalytics: (campaignIds: string[]) =>
    req("POST", "/campaigns/analytics", { campaign_ids: campaignIds }),
  listCampaignLeads: (campaignId: string) =>
    req("GET", `/leads?campaign_id=${campaignId}&limit=100`),
  listEmailAccounts: () => req("GET", "/accounts?limit=100"),
};
