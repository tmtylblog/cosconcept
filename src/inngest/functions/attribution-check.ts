/**
 * Inngest Function: Attribution Check
 *
 * Runs after a new user signs up. Attempts to attribute their
 * signup to an acquisition campaign or referral source.
 */

import { inngest } from "../client";
import { handleAttributionCheck } from "@/lib/jobs/handlers/attribution-check";

export const attributionCheck = inngest.createFunction(
  {
    id: "growth-attribution-check",
    name: "Attribution Check",
    retries: 1,
    concurrency: [{ limit: 5 }],
  },
  { event: "growth/attribution-check" },
  async ({ event, step }) => {
    return step.run("attribution-check", () => handleAttributionCheck(event.data));
  }
);
