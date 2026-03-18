/**
 * Fix bad conversation names and missing avatars by enriching via Unipile profile lookup.
 *
 * Queries all conversations with empty/bad names or missing avatars,
 * then calls Unipile getProfile for each participant to resolve real names.
 *
 * Usage: node scripts/fix-conversation-names.mjs
 */

import { config } from "dotenv";
// Load .env.local first (has DATABASE_URL), then .env.vercel-prod for Unipile keys
// dotenv won't override already-set vars by default
config({ path: ".env.local" });
config({ path: ".env.vercel-prod" });

import { neon } from "@neondatabase/serverless";

const BASE_URL = process.env.UNIPILE_BASE_URL?.trim().replace(/\\n/g, "");
const API_KEY = process.env.UNIPILE_API_KEY?.trim().replace(/\\n/g, "");

if (!BASE_URL || !API_KEY) {
  console.error("UNIPILE_BASE_URL and UNIPILE_API_KEY required");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

const BATCH_SIZE = 5;
const DELAY_MS = 1500; // rate limit between batches

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getProfile(providerId, accountId) {
  const url = `${BASE_URL}/api/v1/users/${encodeURIComponent(providerId)}?account_id=${accountId}&linkedin_sections=*`;
  const res = await fetch(url, {
    headers: { "X-API-KEY": API_KEY, accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Unipile ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function main() {
  // Get all LinkedIn accounts
  const accounts = await sql`
    SELECT id, unipile_account_id, display_name FROM growth_ops_linkedin_accounts
  `;
  console.log(`Found ${accounts.length} LinkedIn accounts`);

  // Get conversations needing fixes
  const bad = await sql`
    SELECT id, participant_name, participant_provider_id, linkedin_account_id, chat_id
    FROM growth_ops_conversations
    WHERE (
      participant_name IS NULL
      OR participant_name = ''
      OR participant_name ~ '^[a-zA-Z0-9_-]{15,}$'
      OR LOWER(TRIM(participant_name)) IN ('referral?', 'referral', 'inmail', 'sponsored', 'hi', 'hey', 'hello')
      OR participant_avatar_url IS NULL
    )
    AND participant_provider_id IS NOT NULL
    AND participant_provider_id != ''
    ORDER BY last_message_at DESC NULLS LAST
  `;

  console.log(`Found ${bad.length} conversations to fix\n`);

  if (bad.length === 0) {
    console.log("Nothing to fix!");
    return;
  }

  // Build account ID map (db id → unipile account id)
  const acctMap = new Map(accounts.map((a) => [a.id, a.unipile_account_id]));

  let fixed = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < bad.length; i += BATCH_SIZE) {
    const batch = bad.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (conv) => {
        const unipileAccountId = acctMap.get(conv.linkedin_account_id);
        if (!unipileAccountId) {
          skipped++;
          return;
        }

        try {
          const profile = await getProfile(conv.participant_provider_id, unipileAccountId);
          const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ");
          const headline = profile.headline ?? null;
          const avatarUrl = profile.profile_picture_url ?? null;
          const publicId = profile.public_identifier;
          const profileUrl = publicId ? `https://linkedin.com/in/${publicId}` : null;

          if (!name && !avatarUrl) {
            console.log(`  [${i + batch.indexOf(conv) + 1}/${bad.length}] SKIP ${conv.participant_provider_id.slice(0, 20)}... — no profile data`);
            skipped++;
            return;
          }

          await sql`
            UPDATE growth_ops_conversations
            SET
              participant_name = COALESCE(${name || null}, participant_name),
              participant_headline = COALESCE(${headline}, participant_headline),
              participant_avatar_url = COALESCE(${avatarUrl}, participant_avatar_url),
              participant_profile_url = COALESCE(${profileUrl}, participant_profile_url),
              updated_at = NOW()
            WHERE id = ${conv.id}
          `;

          console.log(`  [${i + batch.indexOf(conv) + 1}/${bad.length}] ✓ ${name || "(no name)"} — ${headline?.slice(0, 50) || ""}`);
          fixed++;
        } catch (err) {
          console.log(`  [${i + batch.indexOf(conv) + 1}/${bad.length}] ✗ ${conv.participant_provider_id.slice(0, 20)}... — ${err.message?.slice(0, 80)}`);
          failed++;
        }
      })
    );

    // Rate limit between batches
    if (i + BATCH_SIZE < bad.length) {
      await sleep(DELAY_MS);
    }
  }

  console.log(`\n✅ Done: ${fixed} fixed, ${failed} failed, ${skipped} skipped`);

  // Verify
  const [remaining] = await sql`
    SELECT COUNT(*) as count FROM growth_ops_conversations
    WHERE (participant_name IS NULL OR participant_name = '' OR participant_avatar_url IS NULL)
    AND participant_provider_id IS NOT NULL AND participant_provider_id != ''
  `;
  console.log(`Remaining to fix: ${remaining.count}`);
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
