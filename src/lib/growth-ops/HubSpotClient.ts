const BASE_URL = "https://api.hubapi.com";
const TOKEN = process.env.HUBSPOT_ACCESS_TOKEN!;

async function req(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HubSpot ${method} ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

export const HubSpotClient = {
  listPipelines: () => req("GET", "/crm/v3/pipelines/deals"),

  getAllDeals: async (pipelineId: string) => {
    const deals: unknown[] = [];
    let after: string | undefined;
    do {
      const url = `/crm/v3/objects/deals?limit=100&properties=dealname,dealstage,pipeline,amount,closedate,hubspot_owner_id${after ? `&after=${after}` : ""}${pipelineId ? `&filterGroups=[{"filters":[{"propertyName":"pipeline","operator":"EQ","value":"${pipelineId}"}]}]` : ""}`;
      const data = await req("GET", url) as { results: unknown[]; paging?: { next?: { after: string } } };
      deals.push(...data.results);
      after = data.paging?.next?.after;
    } while (after);
    return deals;
  },

  updateDealStage: (dealId: string, stageId: string) =>
    req("PATCH", `/crm/v3/objects/deals/${dealId}`, {
      properties: { dealstage: stageId },
    }),
};
