/**
 * Inngest Function: Network Scan
 *
 * Reads email headers from Gmail or Microsoft Graph for a connected user,
 * scores relationship strength per domain, matches against service_firms.
 */

import { inngest } from "../client";
import { handleNetworkScan } from "@/lib/jobs/handlers/network-scan";

export const networkScan = inngest.createFunction(
  {
    id: "network-scan",
    name: "Network Relationship Scan",
    retries: 2,
    concurrency: [{ limit: 3 }],
  },
  { event: "network/scan" },
  async ({ event, step }) => {
    return step.run("network-scan", () => handleNetworkScan(event.data));
  }
);
