/**
 * Inngest Function: HubSpot Sync
 *
 * Daily cron that pulls HubSpot contacts, companies, and deals
 * into COS-native acq_* tables. Bidirectional sync.
 */

import { inngest } from "../client";
import { handleHubSpotSync } from "@/lib/jobs/handlers/hubspot-sync";

export const hubspotSync = inngest.createFunction(
  {
    id: "cron-hubspot-sync",
    name: "HubSpot CRM Sync",
    retries: 1,
  },
  { cron: "0 0 * * *" }, // Daily at midnight UTC
  async ({ step }) => {
    return step.run("hubspot-sync", () => handleHubSpotSync({}));
  }
);
