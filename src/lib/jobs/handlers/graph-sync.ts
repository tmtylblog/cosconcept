/**
 * Handler: graph-sync
 * Syncs a firm's enrichment data to Neo4j.
 */

import { writeFirmToGraph } from "@/lib/enrichment/graph-writer";

interface Payload {
  firmId: string;
  organizationId: string;
  firmName: string;
  website?: string;
}

export async function handleGraphSync(
  payload: Record<string, unknown>
): Promise<unknown> {
  const { firmId, organizationId, firmName, website } = payload as unknown as Payload;

  const result = await writeFirmToGraph({
    firmId,
    organizationId,
    name: firmName,
    website,
  });

  return { firmId, result };
}
