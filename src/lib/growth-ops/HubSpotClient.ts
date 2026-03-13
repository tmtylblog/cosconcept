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

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function paginate(path: string): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = [];
  let after: string | undefined;
  let page = 0;
  while (true) {
    const sep = path.includes("?") ? "&" : "?";
    const url = `${path}${sep}limit=100${after ? `&after=${after}` : ""}`;
    const data = await req("GET", url) as { results: Record<string, unknown>[]; paging?: { next?: { after: string } } };
    results.push(...data.results);
    after = data.paging?.next?.after;
    if (!after) break;
    page++;
    // Rate limit: HubSpot allows 100 requests per 10 seconds
    if (page % 5 === 0) await delay(1500);
    else await delay(300);
  }
  return results;
}

export const HubSpotClient = {
  // ── Deals ────────────────────────────────────────────
  listPipelines: () =>
    req("GET", "/crm/v3/pipelines/deals"),

  getAllDeals: async (pipelineId?: string) => {
    const base = "/crm/v3/objects/deals?properties=dealname,dealstage,pipeline,amount,closedate,hubspot_owner_id";
    const results = await paginate(base);
    return pipelineId
      ? results.filter((d) => (d.properties as Record<string, string>)?.pipeline === pipelineId)
      : results;
  },

  getDeal: (dealId: string) =>
    req("GET", `/crm/v3/objects/deals/${dealId}?properties=dealname,dealstage,pipeline,amount,closedate`),

  updateDealStage: (dealId: string, stageId: string) =>
    req("PATCH", `/crm/v3/objects/deals/${dealId}`, {
      properties: { dealstage: stageId },
    }),

  updateDeal: (dealId: string, properties: Record<string, string>) =>
    req("PATCH", `/crm/v3/objects/deals/${dealId}`, { properties }),

  // ── Contacts ─────────────────────────────────────────
  getAllContacts: () =>
    paginate("/crm/v3/objects/contacts?properties=email,firstname,lastname,linkedin_url,hubspot_owner_id,associatedcompanyid"),

  getContactByEmail: (email: string) =>
    req("POST", "/crm/v3/objects/contacts/search", {
      filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }],
      properties: ["email", "firstname", "lastname", "linkedin_url", "hs_object_id"],
      limit: 1,
    }),

  updateContact: (contactId: string, properties: Record<string, string>) =>
    req("PATCH", `/crm/v3/objects/contacts/${contactId}`, { properties }),

  // ── Companies ────────────────────────────────────────
  getAllCompanies: () =>
    paginate("/crm/v3/objects/companies?properties=name,domain,industry,numberofemployees"),

  // ── Associations ─────────────────────────────────────
  getContactDeals: (contactId: string) =>
    req("GET", `/crm/v3/objects/contacts/${contactId}/associations/deals`),

  getDealContacts: (dealId: string) =>
    req("GET", `/crm/v3/objects/deals/${dealId}/associations/contacts`),

  getDealCompany: (dealId: string) =>
    req("GET", `/crm/v3/objects/deals/${dealId}/associations/companies`),

  // ── Notes ────────────────────────────────────────────
  createNote: (noteBody: string, contactId?: string, dealId?: string) =>
    req("POST", "/crm/v3/objects/notes", {
      properties: {
        hs_note_body: noteBody,
        hs_timestamp: new Date().toISOString(),
      },
      associations: [
        ...(contactId
          ? [{ to: { id: contactId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 }] }]
          : []),
        ...(dealId
          ? [{ to: { id: dealId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 214 }] }]
          : []),
      ],
    }),
};
