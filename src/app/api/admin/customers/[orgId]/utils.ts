import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

/**
 * Shared admin helper: verify superadmin session and resolve the best firm
 * for a given orgId (same scoring logic as the main admin customer detail route).
 */
export async function resolveAdminFirm(orgId: string) {
  // Auth check
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  if (!session?.user || session.user.role !== "superadmin") {
    return { error: "Forbidden" as const, status: 403, firm: null };
  }

  // Pick best non-legacy firm by data richness
  const firmResult = await db.execute(sql`
    SELECT id, name, website, organization_id AS "organizationId"
    FROM service_firms
    WHERE organization_id = ${orgId}
      AND id NOT LIKE 'firm_leg_%'
    ORDER BY
      CASE WHEN jsonb_array_length(COALESCE(enrichment_data->'extracted'->'clients', '[]'::jsonb)) > 0 THEN 100 ELSE 0 END
      + CASE WHEN jsonb_array_length(COALESCE(enrichment_data->'extracted'->'services', '[]'::jsonb)) > 0 THEN 50 ELSE 0 END
      + CASE WHEN enrichment_status = 'enriched' THEN 30 ELSE 0 END
      + CASE WHEN website IS NOT NULL AND website NOT LIKE '%joincollectiveos.com%' THEN 20 ELSE 0 END
      DESC
    LIMIT 1
  `);

  // Fallback: any firm for this org
  const firm = firmResult.rows[0]
    ?? (await db.execute(sql`
      SELECT id, name, website, organization_id AS "organizationId"
      FROM service_firms
      WHERE organization_id = ${orgId}
      ORDER BY created_at ASC
      LIMIT 1
    `)).rows[0]
    ?? null;

  if (!firm) {
    return { error: "Firm not found" as const, status: 404, firm: null };
  }

  return {
    error: null,
    status: 200,
    firm: firm as { id: string; name: string; website: string | null; organizationId: string },
  };
}
