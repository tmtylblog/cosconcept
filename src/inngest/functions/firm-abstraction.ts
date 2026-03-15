/**
 * Inngest Function: Firm Abstraction
 *
 * Generates a normalized abstraction profile for a firm from all
 * available evidence (services, case studies, experts, classification).
 */

import { inngest } from "../client";
import { handleFirmAbstraction } from "@/lib/jobs/handlers/firm-abstraction";

export const firmAbstraction = inngest.createFunction(
  {
    id: "enrich-firm-abstraction",
    name: "Firm Abstraction Profile",
    retries: 2,
    concurrency: [{ limit: 3 }],
  },
  { event: "enrich/firm-abstraction" },
  async ({ event, step }) => {
    return step.run("firm-abstraction", () => handleFirmAbstraction(event.data));
  }
);
