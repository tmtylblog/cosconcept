/**
 * Inngest Function: LinkedIn Invite Scheduler
 *
 * Hourly cron (Mon-Sat) that sends due LinkedIn connection
 * invites via Unipile.
 */

import { inngest } from "../client";
import { handleLinkedInInviteScheduler } from "@/lib/jobs/handlers/linkedin-invite-scheduler";

export const linkedinInviteScheduler = inngest.createFunction(
  {
    id: "cron-linkedin-invite-scheduler",
    name: "LinkedIn Invite Scheduler",
    retries: 1,
  },
  { cron: "0 * * * 1-6" }, // Top of every hour, Mon-Sat
  async ({ step }) => {
    return step.run("linkedin-invite-scheduler", () => handleLinkedInInviteScheduler({}));
  }
);
