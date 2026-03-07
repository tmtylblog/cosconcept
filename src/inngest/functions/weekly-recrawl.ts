/**
 * Inngest Function: Weekly Recrawl
 *
 * Cron job that runs weekly to re-scrape all firm websites,
 * detecting new case studies, team changes, service updates.
 *
 * Runs every Sunday at 2:00 AM UTC.
 */

import { inngest } from "../client";
import { db } from "@/lib/db";
import { serviceFirms } from "@/lib/db/schema";
import { isNotNull } from "drizzle-orm";

export const weeklyRecrawl = inngest.createFunction(
  {
    id: "cron-weekly-recrawl",
    name: "Weekly Website Recrawl",
  },
  { cron: "0 2 * * 0" }, // Every Sunday at 2 AM UTC
  async ({ step }) => {
    // Step 1: Get all firms with websites
    const firms = await step.run("get-firms", async () => {
      return db
        .select({
          id: serviceFirms.id,
          organizationId: serviceFirms.organizationId,
          name: serviceFirms.name,
          website: serviceFirms.website,
        })
        .from(serviceFirms)
        .where(isNotNull(serviceFirms.website));
    });

    // Step 2: Queue deep crawl for each firm
    let queued = 0;
    await step.run("queue-crawls", async () => {
      for (const firm of firms) {
        if (!firm.website) continue;
        await inngest.send({
          name: "enrich/deep-crawl",
          data: {
            firmId: firm.id,
            organizationId: firm.organizationId,
            website: firm.website,
            firmName: firm.name,
          },
        });
        queued++;
      }
    });

    return {
      firmsFound: firms.length,
      crawlsQueued: queued,
    };
  }
);
