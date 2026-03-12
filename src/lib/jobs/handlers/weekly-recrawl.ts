/**
 * Handler: weekly-recrawl
 * Queues deep-crawl jobs for all firms with websites.
 * Triggered by Vercel Cron every Sunday at 2 AM UTC.
 */

import { db } from "@/lib/db";
import { serviceFirms } from "@/lib/db/schema";
import { isNotNull } from "drizzle-orm";
import { enqueue } from "../queue";

export async function handleWeeklyRecrawl(
  _payload: Record<string, unknown>
): Promise<unknown> {
  const firms = await db
    .select({
      id: serviceFirms.id,
      organizationId: serviceFirms.organizationId,
      name: serviceFirms.name,
      website: serviceFirms.website,
    })
    .from(serviceFirms)
    .where(isNotNull(serviceFirms.website));

  let queued = 0;
  for (const firm of firms) {
    if (!firm.website) continue;
    await enqueue("deep-crawl", {
      firmId: firm.id,
      organizationId: firm.organizationId,
      website: firm.website,
      firmName: firm.name,
    });
    queued++;
  }

  return { firmsFound: firms.length, crawlsQueued: queued };
}
