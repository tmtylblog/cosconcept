import { tool } from "ai";
import { z } from "zod/v4";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { serviceFirms, partnerPreferences } from "@/lib/db/schema";

/** Fields that map to serviceFirms.enrichmentData.confirmed */
const FIRM_FIELDS = new Set([
  "firmCategory",
  "services",
  "clients",
  "skills",
  "markets",
  "languages",
  "industries",
]);

/** Column mapping for partner preference fields → DB columns */
const PARTNER_COLUMN_MAP: Record<string, string> = {
  preferredPartnerTypes: "preferredFirmTypes",
  partnershipModels: "partnershipModels",
  dealBreakers: "dealBreakers",
  growthGoals: "growthGoals",
};

/** Generate a short unique ID */
function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const profileFieldSchema = z.enum([
  "firmCategory",
  "services",
  "clients",
  "skills",
  "markets",
  "languages",
  "industries",
  "preferredPartnerTypes",
  "partnershipModels",
  "dealBreakers",
  "growthGoals",
]);

const toolInputSchema = z.object({
  field: profileFieldSchema.describe(
    "The profile field to update. Firm fields: firmCategory, services, clients, skills, markets, languages, industries. " +
    "Partner preference fields: preferredPartnerTypes, partnershipModels, dealBreakers, growthGoals."
  ),
  value: z.union([
    z.string(),
    z.array(z.string()),
  ]).describe(
    "The confirmed value. Use a string for single-value fields (firmCategory, growthGoals). " +
    "Use an array of strings for multi-value fields (services, skills, etc.)."
  ),
});

type ToolInput = z.infer<typeof toolInputSchema>;

/**
 * Creates Ossy AI tools with DB access baked in.
 * Tools execute server-side and persist confirmed data.
 */
export function createOssyTools(organizationId: string, firmId: string) {
  // Suppress unused var warning — organizationId is kept for future use (e.g. audit logging)
  void organizationId;

  return {
    update_profile: tool({
      description:
        "Update the user's firm profile or partner preferences when they confirm a data point. " +
        "Call this AFTER the user confirms information, not while still suggesting. " +
        "You can call this multiple times per response for different fields.",
      inputSchema: toolInputSchema,
      execute: async ({ field, value }: ToolInput) => {
        try {
          if (FIRM_FIELDS.has(field)) {
            // Merge into serviceFirms.enrichmentData under a "confirmed" key
            const [firm] = await db
              .select({ enrichmentData: serviceFirms.enrichmentData })
              .from(serviceFirms)
              .where(eq(serviceFirms.id, firmId))
              .limit(1);

            const existing = (firm?.enrichmentData as Record<string, unknown>) || {};
            const confirmed = (existing.confirmed as Record<string, unknown>) || {};
            confirmed[field] = value;

            await db
              .update(serviceFirms)
              .set({
                enrichmentData: { ...existing, confirmed },
                updatedAt: new Date(),
              })
              .where(eq(serviceFirms.id, firmId));
          } else {
            // Upsert into partnerPreferences table
            const dbColumn = PARTNER_COLUMN_MAP[field] || field;
            const [existing] = await db
              .select({ id: partnerPreferences.id })
              .from(partnerPreferences)
              .where(eq(partnerPreferences.firmId, firmId))
              .limit(1);

            if (existing) {
              await db
                .update(partnerPreferences)
                .set({
                  [dbColumn]: value,
                  updatedAt: new Date(),
                })
                .where(eq(partnerPreferences.firmId, firmId));
            } else {
              await db.insert(partnerPreferences).values({
                id: uid("pref"),
                firmId,
                [dbColumn]: value,
              });
            }
          }

          return { success: true as const, field, value };
        } catch (err) {
          console.error(`[Ossy Tools] Failed to update ${field}:`, err);
          return { success: false as const, field, error: String(err) };
        }
      },
    }),
  };
}
