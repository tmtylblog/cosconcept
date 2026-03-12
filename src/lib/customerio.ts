/**
 * Customer.io App API client.
 *
 * SAFETY CONTRACT:
 * - Only uses the App API (api.customer.io) — never the Track API (track.customer.io)
 * - App API is a data management API: reads/writes attributes, does NOT trigger campaigns
 * - CUSTOMERIO_TRACKING_SITE_ID and CUSTOMERIO_TRACKING_API_KEY are intentionally
 *   not used here to prevent accidentally firing live campaign workflows.
 */

const BASE = "https://api.customer.io/v1";

function authHeader() {
  const key = process.env.CUSTOMERIO_APP_API_KEY;
  if (!key) throw new Error("CUSTOMERIO_APP_API_KEY is not configured");
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

export interface CioCustomer {
  id: string;
  email: string;
  attributes: Record<string, unknown>;
  // Subscription preferences stored as attributes:
  // pref_new_matches, pref_partnership_updates, pref_weekly_digest, pref_product_updates
}

export interface NotificationPreferences {
  newMatches: boolean;
  partnershipUpdates: boolean;
  weeklyDigest: boolean;
  productUpdates: boolean;
}

const PREF_ATTR_MAP: Record<keyof NotificationPreferences, string> = {
  newMatches: "pref_new_matches",
  partnershipUpdates: "pref_partnership_updates",
  weeklyDigest: "pref_weekly_digest",
  productUpdates: "pref_product_updates",
};

/**
 * Look up a customer by email address.
 * Returns null if they don't exist in Customer.io yet.
 */
export async function getCioCustomerByEmail(email: string): Promise<CioCustomer | null> {
  const res = await fetch(
    `${BASE}/customers?email=${encodeURIComponent(email)}`,
    { headers: authHeader() }
  );
  if (!res.ok) return null;

  const data = await res.json() as {
    results?: { id: string; email: string; attributes: Record<string, unknown> }[];
  };
  const customer = data.results?.[0];
  if (!customer) return null;
  return customer;
}

/**
 * Get notification preferences for a customer.
 * Falls back to all-true defaults if the customer doesn't exist yet.
 */
export async function getNotificationPreferences(email: string): Promise<{
  preferences: NotificationPreferences;
  exists: boolean;
}> {
  const customer = await getCioCustomerByEmail(email);

  if (!customer) {
    return {
      preferences: { newMatches: true, partnershipUpdates: true, weeklyDigest: true, productUpdates: true },
      exists: false,
    };
  }

  const attrs = customer.attributes;
  return {
    preferences: {
      newMatches: attrs[PREF_ATTR_MAP.newMatches] !== false,
      partnershipUpdates: attrs[PREF_ATTR_MAP.partnershipUpdates] !== false,
      weeklyDigest: attrs[PREF_ATTR_MAP.weeklyDigest] !== false,
      productUpdates: attrs[PREF_ATTR_MAP.productUpdates] !== false,
    },
    exists: true,
  };
}

/**
 * Update notification preferences for a customer.
 * Uses App API attribute update — does NOT trigger campaigns.
 * Only updates existing customers; skips silently if not found.
 */
export async function updateNotificationPreferences(
  email: string,
  prefs: Partial<NotificationPreferences>
): Promise<{ ok: boolean; error?: string }> {
  const customer = await getCioCustomerByEmail(email);
  if (!customer) {
    // Don't create customers via the App API — that could trigger onboarding workflows
    return { ok: false, error: "no_cio_record" };
  }

  // Build attribute update object
  const attributes: Record<string, boolean> = {};
  for (const [key, attrName] of Object.entries(PREF_ATTR_MAP)) {
    const val = prefs[key as keyof NotificationPreferences];
    if (val !== undefined) {
      attributes[attrName] = val;
    }
  }

  const res = await fetch(`${BASE}/customers/${customer.id}`, {
    method: "PUT",
    headers: authHeader(),
    body: JSON.stringify({ attributes }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[Customer.io] Update failed:", err);
    return { ok: false, error: "update_failed" };
  }

  return { ok: true };
}
