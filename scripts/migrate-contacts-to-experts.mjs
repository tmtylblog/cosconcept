/**
 * One-time migration: importedContacts → expertProfiles
 *
 * For each importedContacts row:
 * 1. Create an expertProfiles record with importedContactId link
 * 2. Pull PDL enrichment data from enrichmentAuditLog for that contact
 * 3. Import AI-generated specialist profiles with quality scores
 *    - Score >= 50 → published
 *    - Score < 50 → draft
 *
 * Run: node scripts/migrate-contacts-to-experts.mjs
 * (requires DATABASE_URL in .env.local)
 */

import postgres from "postgres";
import { config } from "dotenv";
import { randomBytes } from "crypto";

config({ path: ".env.local" });

const sql = postgres(process.env.DATABASE_URL);

function nanoid() {
  return randomBytes(12).toString("base64url");
}

/** Simplified quality score for migration (mirrors quality-score.ts logic) */
function scoreProfile({ title, bodyDescription, examples = [] }) {
  let score = 0;
  if (title?.trim()) score += 15;
  const bodyLen = bodyDescription?.trim().length ?? 0;
  if (bodyLen >= 100) score += 20;
  if (bodyLen >= 300) score += 5;
  if (examples.length >= 1) score += 10;
  if (examples.length >= 2) score += 10;
  if (examples.length >= 3) score += 10;
  // Example completeness
  for (const ex of examples.slice(0, 3)) {
    if (ex.title?.trim() && ex.subject?.trim()) score += 5;
  }
  // Coherence not calculated here — assume partial for migration
  return Math.min(score, 100);
}

function scoreToStatus(score) {
  if (score >= 80) return "strong";
  if (score >= 50) return "partial";
  if (score >= 20) return "weak";
  return "incomplete";
}

async function main() {
  console.log("🚀 Starting importedContacts → expertProfiles migration...\n");

  // 1. Get all imported contacts that have a firmId via importedCompanies→serviceFirms link
  const contacts = await sql`
    SELECT
      ic.id,
      ic.source_id,
      ic."first_name",
      ic."last_name",
      ic."name",
      ic.email,
      ic.title,
      ic."linkedin_url",
      ic."photo_url",
      ic.headline,
      ic."short_bio",
      ic.city,
      ic.state,
      ic.country,
      ic."legacy_data",
      ic."meta",
      sf.id AS "firm_id"
    FROM imported_contacts ic
    LEFT JOIN imported_companies ico ON ic."company_id" = ico.id
    LEFT JOIN service_firms sf ON ico."service_firm_id" = sf.id
    WHERE sf.id IS NOT NULL
    ORDER BY ic."created_at" ASC
  `;

  console.log(`Found ${contacts.length} contacts linked to service firms.`);

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const contact of contacts) {
    try {
      // Check if expertProfile already exists for this importedContact
      const existing = await sql`
        SELECT id FROM expert_profiles WHERE "imported_contact_id" = ${contact.id} LIMIT 1
      `;

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      // Try to find PDL enrichment for this contact
      const pdlRows = await sql`
        SELECT "extracted_data"
        FROM enrichment_audit_log
        WHERE phase = 'pdl'
          AND source LIKE ${'%' + (contact.email ?? contact.linkedin_url ?? contact.name ?? '') + '%'}
        ORDER BY "created_at" DESC
        LIMIT 1
      `;

      const pdlData = pdlRows[0]?.extracted_data ?? null;
      const pdlId = pdlData?.id ?? null;

      // Build location string
      const locationParts = [contact.city, contact.state, contact.country].filter(Boolean);
      const location = locationParts.join(", ") || null;

      // Create expertProfile
      const epId = nanoid();
      await sql`
        INSERT INTO expert_profiles (
          id, "firm_id", "imported_contact_id",
          "first_name", "last_name", "full_name", email, title,
          headline, "photo_url", "linkedin_url", location, bio,
          "pdl_id", "pdl_data", "pdl_enriched_at",
          "top_skills", "top_industries",
          "is_public", "profile_completeness",
          "created_at", "updated_at"
        ) VALUES (
          ${epId}, ${contact.firm_id}, ${contact.id},
          ${contact.first_name}, ${contact.last_name},
          ${contact.name ?? [contact.first_name, contact.last_name].filter(Boolean).join(" ") || null},
          ${contact.email}, ${contact.title},
          ${contact.headline}, ${contact.photo_url}, ${contact.linkedin_url},
          ${location}, ${contact.short_bio},
          ${pdlId}, ${pdlData ? JSON.stringify(pdlData) : null},
          ${pdlData ? new Date() : null},
          ${pdlData?.skills ? JSON.stringify(pdlData.skills.slice(0, 10)) : JSON.stringify([])},
          ${JSON.stringify([])},
          true, 0,
          NOW(), NOW()
        )
        ON CONFLICT DO NOTHING
      `;

      // Check for AI-generated specialist profiles in enrichment audit log
      const spRows = await sql`
        SELECT "extracted_data"
        FROM enrichment_audit_log
        WHERE source = 'specialist-generator'
          AND ("firm_id" IS NOT NULL)
          AND "extracted_data" IS NOT NULL
          AND "extracted_data"->>'contactId' = ${contact.id}
        ORDER BY "created_at" DESC
        LIMIT 5
      `;

      // Import any specialist profiles found
      let isPrimarySet = false;
      for (const row of spRows) {
        const spData = row.extracted_data;
        if (!spData?.title) continue;

        const examples = spData.examples ?? [];
        const score = scoreProfile({
          title: spData.title,
          bodyDescription: spData.bodyDescription ?? spData.summary ?? "",
          examples,
        });
        const status = scoreToStatus(score);
        const isSearchable = score >= 80;
        const publishStatus = score >= 50 ? "published" : "draft";
        const isPrimary = !isPrimarySet && isSearchable;
        if (isPrimary) isPrimarySet = true;

        const spId = nanoid();
        await sql`
          INSERT INTO specialist_profiles (
            id, "expert_profile_id", "firm_id",
            title, "body_description",
            skills, industries, services,
            "quality_score", "quality_status",
            source, "is_searchable", "is_primary", status,
            "created_at", "updated_at"
          ) VALUES (
            ${spId}, ${epId}, ${contact.firm_id},
            ${spData.title}, ${spData.bodyDescription ?? spData.summary ?? null},
            ${JSON.stringify(spData.skills ?? [])},
            ${JSON.stringify(spData.industries ?? [])},
            ${JSON.stringify(spData.services ?? [])},
            ${score}, ${status},
            'ai_generated', ${isSearchable}, ${isPrimary}, ${publishStatus},
            NOW(), NOW()
          )
          ON CONFLICT DO NOTHING
        `;

        // Insert examples
        for (let i = 0; i < Math.min(examples.length, 3); i++) {
          const ex = examples[i];
          await sql`
            INSERT INTO specialist_profile_examples (
              id, "specialist_profile_id",
              "example_type", title, subject,
              "company_name", "company_industry",
              "start_date", "end_date", "is_current",
              "is_pdl_source", position, "created_at"
            ) VALUES (
              ${nanoid()}, ${spId},
              ${"project"}, ${ex.title ?? null}, ${ex.subject ?? null},
              ${ex.companyName ?? null}, ${ex.companyIndustry ?? null},
              ${ex.startDate ?? null}, ${ex.endDate ?? null}, ${ex.isCurrent ?? false},
              ${ex.isPdlSource ?? false}, ${i + 1}, NOW()
            )
            ON CONFLICT DO NOTHING
          `;
        }
      }

      created++;
      if (created % 25 === 0) {
        console.log(`  ✓ Migrated ${created} contacts...`);
      }
    } catch (err) {
      console.error(`  ✗ Error migrating contact ${contact.id}:`, err.message);
      errors++;
    }
  }

  console.log(`
✅ Migration complete:
   Created: ${created}
   Skipped: ${skipped} (already migrated)
   Errors:  ${errors}
`);

  await sql.end();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
