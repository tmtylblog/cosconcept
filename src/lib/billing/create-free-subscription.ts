import { db } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";

/**
 * Create a free subscription row for a newly created organization.
 * Called after org creation (from auth callbacks or API).
 *
 * Free orgs don't have a Stripe customer yet — the customer is
 * created lazily when they first attempt to upgrade.
 */
export async function createFreeSubscription(organizationId: string) {
  // [ANALYTICS] trackEvent("subscription_created", { organizationId, plan: "free" })
  await db
    .insert(subscriptions)
    .values({
      id: crypto.randomUUID(),
      organizationId,
      stripeCustomerId: `pending_${organizationId}`,
      plan: "free",
      status: "active",
    })
    .onConflictDoNothing();
}
