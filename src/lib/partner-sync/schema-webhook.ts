/**
 * Partner Sync — Outbound Schema Change Webhook
 *
 * Fires a notification to registered partners when COS changes its
 * taxonomy or graph schema. Call this manually after schema changes.
 *
 * Usage:
 *   await fireSchemaChangedWebhook([
 *     { type: "node_added", details: "Added TechPlatform node type" },
 *   ]);
 */

interface SchemaChange {
  type:
    | "node_added"
    | "edge_added"
    | "property_added"
    | "node_removed"
    | "edge_removed"
    | "property_removed";
  details: string;
}

interface PartnerWebhookConfig {
  partnerId: string;
  webhookUrl: string;
}

/** Registered partner webhook endpoints */
const PARTNER_WEBHOOKS: PartnerWebhookConfig[] = [
  {
    partnerId: "chameleon-collective",
    webhookUrl: "https://core.chameleoncollective.com/api/graph-sync/schema-changed",
  },
];

/**
 * Notify all registered partners about schema changes.
 * Returns results per partner.
 */
export async function fireSchemaChangedWebhook(
  changes: SchemaChange[],
  newVersion?: string
): Promise<{ partnerId: string; success: boolean; error?: string }[]> {
  const apiKey = process.env.PARTNER_SYNC_API_KEY;
  if (!apiKey) {
    console.warn("[Schema Webhook] PARTNER_SYNC_API_KEY not set, skipping");
    return [];
  }

  const version = newVersion ?? "1.0.0";
  const results: { partnerId: string; success: boolean; error?: string }[] = [];

  for (const partner of PARTNER_WEBHOOKS) {
    try {
      const res = await fetch(partner.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          source: "COS",
          version,
          changes,
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        results.push({
          partnerId: partner.partnerId,
          success: false,
          error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
        });
      } else {
        results.push({ partnerId: partner.partnerId, success: true });
      }

      console.log(
        `[Schema Webhook] ${partner.partnerId}: ${res.ok ? "OK" : `FAILED ${res.status}`}`
      );
    } catch (err) {
      results.push({
        partnerId: partner.partnerId,
        success: false,
        error: String(err),
      });
    }
  }

  return results;
}
