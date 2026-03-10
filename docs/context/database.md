# 2. Database Schema

> Last updated: 2026-03-09

**Source:** `src/lib/db/schema.ts` (Drizzle ORM, Neon PostgreSQL)
**Migrations:** `drizzle/` directory (3 migrations applied)
**All PKs:** `text("id")` (application-generated UUIDs unless noted)
**Timestamps:** All tables have `created_at` (defaultNow). Most have `updated_at`.

---

## Enums

| Enum | Values |
|------|--------|
| `size_band` | individual, micro_1_10, small_11_50, emerging_51_200, mid_201_500, upper_mid_501_1000, large_1001_5000, major_5001_10000, global_10000_plus |
| `firm_type` | fractional_interim, staff_augmentation, embedded_teams, boutique_agency, project_consulting, managed_service_provider, advisory, global_consulting, freelancer_network, agency_collective |
| `member_role` | owner, admin, member |
| `subscription_plan` | free, pro, enterprise |
| `subscription_status` | trialing, active, past_due, canceled, unpaid, incomplete |
| `partnership_status` | suggested, requested, accepted, declined, inactive |
| `partnership_type` | trusted_partner, collective, vendor_network |
| `opportunity_status` | new, in_review, actioned, dismissed |
| `lead_status` | open, shared, claimed, won, lost, expired |
| `case_study_status` | pending, ingesting, active, blocked, failed, deleted |
| `scheduled_call_status` | pending, recording, done, failed, cancelled |
| `meeting_platform` | google_meet, zoom, teams, other |
| `call_type` | partnership, client, unknown |
| `transcript_status` | pending, processing, done, failed |
| `solution_partner_category` | crm, marketing_automation, ecommerce, analytics, project_management, developer_tools, cloud_infrastructure, communication, design, payments, customer_support, data_integration, other |
| `expert_division` | collective_member, expert, trusted_expert |
| `specialist_profile_source` | ai_generated, user_created, ai_suggested_user_confirmed |
| `specialist_profile_status` | draft, published, archived |
| `quality_status` | strong, partial, weak, incomplete |
| `example_type` | project, role |

---

## Auth & Identity

### `users`
Core user table (Better Auth). Every authenticated user has a row here.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| name | text NOT NULL | |
| email | text NOT NULL UNIQUE | |
| email_verified | boolean (default false) | |
| image | text | Avatar URL |
| role | text (default "user") | user \| admin \| superadmin |
| banned | boolean (default false) | Admin plugin |
| ban_reason | text | |
| ban_expires | timestamp | |

### `sessions`
Active login sessions (Better Auth).

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| user_id | text FK -> users (cascade) | |
| token | text NOT NULL UNIQUE | Session token |
| expires_at | timestamp NOT NULL | |
| ip_address | text | |
| user_agent | text | |
| impersonated_by | text | Admin impersonation tracking |

### `accounts`
OAuth/credential provider links (Better Auth).

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| user_id | text FK -> users (cascade) | |
| account_id | text NOT NULL | Provider-side user ID |
| provider_id | text NOT NULL | e.g., "google", "credentials" |
| access_token, refresh_token | text | OAuth tokens |
| access_token_expires_at, refresh_token_expires_at | timestamp | |
| scope | text | OAuth scopes |
| id_token | text | OIDC token |
| password | text | Hashed password (credentials provider) |

### `verifications`
Email verification / magic link tokens (Better Auth).

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| identifier | text NOT NULL | Email or purpose |
| value | text NOT NULL | Token value |
| expires_at | timestamp NOT NULL | |

---

## Organizations & Membership

### `organizations`
Better Auth organization plugin. Each org maps 1:1 to a `service_firms` row.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| name | text NOT NULL | |
| slug | text NOT NULL UNIQUE | URL-safe identifier |
| logo | text | |
| metadata | text | Serialized JSON |

### `members`
Organization membership. Links users to organizations with a role.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| user_id | text FK -> users (cascade) | |
| organization_id | text FK -> organizations (cascade) | |
| role | member_role (default "member") | owner \| admin \| member |

### `invitations`
Pending org invitations.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| email | text NOT NULL | |
| organization_id | text FK -> organizations (cascade) | |
| role | member_role (default "member") | |
| inviter_id | text FK -> users (cascade) | |
| status | text (default "pending") | pending \| accepted \| declined |
| expires_at | timestamp NOT NULL | |

---

## Billing & Subscriptions

### `subscriptions`
One subscription per organization. Stripe-integrated.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| organization_id | text FK -> organizations (cascade) UNIQUE | 1:1 with org |
| stripe_customer_id | text NOT NULL | |
| stripe_subscription_id | text UNIQUE | Null if free plan |
| stripe_price_id | text | |
| plan | subscription_plan (default "free") | |
| status | subscription_status (default "active") | |
| current_period_start, current_period_end | timestamp | |
| cancel_at_period_end | boolean (default false) | |
| trial_start, trial_end | timestamp | |

### `subscription_events`
Stripe webhook event log for audit/debugging.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| stripe_event_id | text NOT NULL UNIQUE | Idempotency key |
| event_type | text NOT NULL | Stripe event type string |
| organization_id | text FK -> organizations (set null) | |
| data | jsonb | Full event payload |
| processed_at | timestamp | When handler ran |

---

## COS Domain (Service Firms)

### `service_firms`
Central entity: a professional services firm on the platform.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| organization_id | text FK -> organizations (cascade) NOT NULL | 1:1 with org |
| name | text NOT NULL | |
| website | text | |
| description | text | |
| founded_year | integer | |
| size_band | size_band enum | |
| firm_type | firm_type enum | |
| is_platform_member | boolean (default false) | |
| profile_completeness | real (default 0) | 0-1 score |
| partnership_readiness_score | real | |
| response_velocity | real | |
| enrichment_data | jsonb | Full enrichment response |
| enrichment_status | text (default "pending") | pending \| enriched \| verified |
| classification_confidence | real | |

### `partner_preferences`
What kind of partners a firm is looking for (from onboarding interview).

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| firm_id | text FK -> service_firms (cascade) | |
| preferred_firm_types | jsonb (string[]) | |
| preferred_size_bands | jsonb (string[]) | |
| preferred_industries | jsonb (string[]) | |
| preferred_markets | jsonb (string[]) | |
| partnership_models | jsonb (string[]) | |
| deal_breakers | jsonb (string[]) | |
| growth_goals | text | |
| raw_onboarding_data | jsonb | Full interview Q&A |

### `abstraction_profiles`
AI-generated "hidden layer" profile for firms, experts, or case studies.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| entity_type | text NOT NULL | firm \| expert \| case_study |
| entity_id | text NOT NULL | Polymorphic FK |
| hidden_narrative | text | AI-generated narrative |
| top_services | jsonb (string[]) | |
| top_skills | jsonb (string[]) | |
| top_industries | jsonb (string[]) | |
| typical_client_profile | text | |
| partnership_readiness | jsonb | { openToPartnerships, preferredPartnerTypes, partnershipGoals } |
| confidence_scores | jsonb | |
| evidence_sources | jsonb | |
| last_enriched_at | timestamp | |
| enrichment_version | integer (default 1) | |

**Note:** `embedding: vector(1536)` column planned but not live (requires pgvector extension).

### `solution_partners`
Tech platforms tracked in the knowledge graph (e.g., Salesforce, HubSpot).

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| name | text NOT NULL | |
| domain | text NOT NULL UNIQUE | e.g., "salesforce.com" |
| category | solution_partner_category enum | |
| description | text | |
| logo_url, website_url | text | |
| graph_node_id | text | Neo4j node ID |
| is_verified | boolean (default false) | |
| meta | jsonb | |

---

## Chat (Ossy AI)

### `conversations`
Chat threads between a user and Ossy.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| user_id | text FK -> users (cascade) | |
| organization_id | text FK -> organizations (cascade) | Optional org context |
| title | text | |
| mode | text (default "general") | general \| onboarding |

### `messages`
Individual messages in a conversation.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| conversation_id | text FK -> conversations (cascade) | |
| role | text NOT NULL | user \| assistant |
| content | text NOT NULL | |

### `memory_entries`
Ossy's per-user memory system. Stores extracted facts from conversations.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| user_id | text FK -> users (cascade) | |
| organization_id | text FK -> organizations (cascade) | |
| theme | text NOT NULL | e.g., "partner_preferences", "firm_capabilities" |
| content | text NOT NULL | The memory content |
| confidence | real (default 0.8) | |
| source_conversation_id | text FK -> conversations (set null) | |
| source_message_id | text | |
| expires_at | timestamp | Optional TTL |

**Note:** `embedding: vector(1536)` column planned but not live.

### `memory_themes`
Aggregated theme summaries for Ossy's memory.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| user_id | text FK -> users (cascade) | |
| organization_id | text FK -> organizations (cascade) | |
| theme | text NOT NULL | |
| summary | text | AI-generated rollup |
| entry_count | integer (default 0) | |

---

## Partnerships

### `partnerships`
Relationship between two service firms.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| firm_a_id | text FK -> service_firms (cascade) | |
| firm_b_id | text FK -> service_firms (cascade) | |
| status | partnership_status (default "suggested") | |
| type | partnership_type (default "trusted_partner") | |
| initiated_by | text FK -> users (set null) | |
| match_score | real | From matching engine |
| match_explanation | text | LLM "why this match" |
| notes | text | |
| accepted_at, declined_at | timestamp | |

### `partnership_events`
Activity log for a partnership (requested, accepted, referral, etc.).

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| partnership_id | text FK -> partnerships (cascade) | |
| event_type | text NOT NULL | requested \| accepted \| declined \| message \| referral \| intro_sent |
| actor_id | text FK -> users (set null) | |
| metadata | jsonb | |

---

## Opportunities & Referrals

### `opportunities`
Private intelligence extracted from calls, emails, or manually — never shared directly with the network. Must be promoted to a Lead first.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| firm_id | text FK -> service_firms (cascade) | Owning firm |
| created_by | text FK -> users (cascade) | |
| title | text NOT NULL | |
| description | text | |
| evidence | text | Verbatim quote or signal that triggered this |
| signal_type | text (default "direct") | direct \| latent |
| priority | text (default "medium") | low \| medium \| high |
| resolution_approach | text (default "network") | network \| internal \| hybrid |
| required_skills | jsonb (string[]) | L2 skill vocabulary |
| required_industries | jsonb (string[]) | |
| required_categories | jsonb (string[]) | Uses 30 COS firm category vocabulary |
| required_markets | jsonb (string[]) | Uses COS market vocabulary |
| estimated_value | text | "10k-25k", "50k-100k", etc. |
| timeline | text | "immediate", "1-3 months", etc. |
| client_domain | text | Links to enrichmentCache domain key |
| client_name | text | Display name (can be anonymized) |
| anonymize_client | boolean (default false) | Hide client identity when promoting to lead |
| client_size_band | size_band enum | |
| source | text (default "manual") | manual \| call \| email \| ossy |
| source_id | text | FK to source record (transcript ID, email thread ID, etc.) |
| attachments | jsonb | [{name, url, type, size}] — RFPs, briefs, etc. |
| status | opportunity_status (default "new") | new \| in_review \| actioned \| dismissed |

### `leads`
Shareable version of an opportunity. Promoted from an opportunity. Quality-scored to prevent "bad leads" in the network.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| firm_id | text FK -> service_firms (cascade) | Posting firm |
| created_by | text FK -> users (cascade) | |
| opportunity_id | text FK -> opportunities (set null) | Source opportunity (nullable — can create lead directly) |
| title | text NOT NULL | |
| description | text | |
| required_skills | jsonb (string[]) | |
| required_industries | jsonb (string[]) | |
| required_categories | jsonb (string[]) | |
| required_markets | jsonb (string[]) | |
| estimated_value | text | |
| timeline | text | |
| client_domain | text | |
| client_name | text | |
| anonymize_client | boolean (default false) | |
| client_size_band | size_band enum | |
| attachments | jsonb | |
| quality_score | integer | 0-100, internal only |
| quality_breakdown | jsonb | Detailed scoring breakdown |
| source | text | |
| status | lead_status (default "open") | open \| shared \| claimed \| won \| lost \| expired |

### `lead_shares`
Tracks which firms a lead was shared with.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| lead_id | text FK -> leads (cascade) | |
| shared_with_firm_id | text FK -> service_firms (cascade) | |
| shared_by | text FK -> users (cascade) | |
| viewed_at | timestamp | |
| claimed_at | timestamp | |

### `referrals`
Tracks referral flow and conversion between firms.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| partnership_id | text FK -> partnerships (set null) | |
| opportunity_id | text FK -> opportunities (set null) | |
| referring_firm_id | text FK -> service_firms (cascade) | |
| receiving_firm_id | text FK -> service_firms (cascade) | |
| status | text (default "pending") | pending \| converted \| lost |
| estimated_value, actual_value | text | |
| converted_at | timestamp | |

---

## Email System

### `email_threads`
Tracked email conversations tied to a firm and optionally a partnership/opportunity.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| firm_id | text FK -> service_firms (cascade) | |
| subject | text NOT NULL | |
| participants | jsonb (string[]) | Email addresses |
| partnership_id | text FK -> partnerships (set null) | |
| opportunity_id | text FK -> opportunities (set null) | |
| status | text (default "active") | active \| archived \| resolved |
| intent | text | opportunity \| follow_up \| context \| question \| intro |
| last_message_at | timestamp | |

### `email_messages`
Individual emails within a thread.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| thread_id | text FK -> email_threads (cascade) | |
| external_message_id | text | Resend/provider message ID |
| direction | text NOT NULL | inbound \| outbound |
| from_email | text NOT NULL | |
| from_name | text | |
| to_emails | jsonb (string[]) NOT NULL | |
| cc_emails | jsonb (string[]) | |
| subject | text NOT NULL | |
| body_html, body_text | text | |
| extracted_intent | text | AI-classified intent |
| extracted_entities | jsonb | { firmNames, personNames, skills, industries, values } |
| confidence | real | |
| processed_at | timestamp | |

### `email_approval_queue`
Human-in-the-loop approval for AI-drafted outbound emails.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| firm_id | text FK -> service_firms (cascade) | |
| user_id | text FK -> users (cascade) | |
| email_type | text NOT NULL | intro \| follow_up \| opportunity_share \| digest |
| to_emails | jsonb (string[]) NOT NULL | |
| cc_emails | jsonb (string[]) | |
| subject | text NOT NULL | |
| body_html | text NOT NULL | |
| body_text | text | |
| context | jsonb | { partnershipId, opportunityId, reason } |
| status | text (default "pending") | pending \| approved \| rejected \| sent |
| reviewed_by | text FK -> users | |
| reviewed_at, sent_at | timestamp | |
| external_message_id | text | |

---

## Call Intelligence

### `scheduled_calls`
Calendar-sourced meeting entries for a firm.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| firm_id | text FK -> service_firms (cascade) | |
| user_id | text FK -> users (set null) | |
| meeting_title | text | |
| meeting_time | timestamp | |
| meeting_link | text | |
| platform | meeting_platform (default "other") | |
| participants | jsonb (string[]) | |
| partnership_id | text FK -> partnerships (set null) | |
| call_type | call_type (default "unknown") | |
| source_email_thread_id | text FK -> email_threads (set null) | |
| transcript_id | text | FK set after call |
| recall_bot_id | text | Recall.ai bot ID |
| status | scheduled_call_status (default "pending") | |

### `call_recordings`
Recorded call metadata.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| firm_id | text FK -> service_firms (cascade) | |
| user_id | text FK -> users (set null) | |
| scheduled_call_id | text FK -> scheduled_calls (set null) | |
| call_type | call_type (default "unknown") | |
| partner_firm_id | text FK -> service_firms (set null) | The other party |
| platform | meeting_platform (default "other") | |
| duration_seconds | integer | |
| processed_at | timestamp | |

### `call_transcripts`
Transcriptions of recorded calls (via Deepgram).

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| call_recording_id | text FK -> call_recordings (cascade) | |
| scheduled_call_id | text FK -> scheduled_calls (set null) | |
| full_text | text | |
| segments | jsonb | Array of { speaker, startMs, endMs, text } |
| processing_status | transcript_status (default "pending") | |
| deepgram_job_id | text | |
| coaching_report_id | text | FK set after coaching runs |

### `coaching_reports`
AI-generated call coaching analysis.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| call_recording_id | text FK -> call_recordings (cascade) | |
| scheduled_call_id | text FK -> scheduled_calls (set null) | |
| talking_time_ratio | jsonb | { userPercent, otherPercent, assessment } |
| value_proposition | jsonb | { clarity, mentioned, feedback } |
| question_quality | jsonb | { discoveryQuestions, closedQuestions, score, feedback } |
| topics_covered | jsonb (string[]) | |
| next_steps | jsonb | { established, items } |
| action_items | jsonb | Array of { description, assignee, deadline? } |
| overall_score | integer | |
| top_recommendation | text | |
| recommended_experts | jsonb | Array of { name, firm, reason, profileUrl? } |
| recommended_case_studies | jsonb | Array of { title, firm, relevance, url? } |
| sent_to_firm_a_at, sent_to_firm_b_at | timestamp | |

---

## Expert Profiles

### `expert_profiles`
Canonical expert entity. Replaces `imported_contacts` as primary profile once enriched via PDL.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| firm_id | text FK -> service_firms (cascade) | |
| user_id | text FK -> users (set null) | If expert is also a platform user |
| imported_contact_id | text FK -> imported_contacts (set null) | Legacy source link |
| first_name, last_name, full_name | text | |
| email | text | |
| title, headline | text | |
| photo_url, linkedin_url | text | |
| location | text | |
| bio | text | |
| pdl_id | text | People Data Labs ID |
| pdl_data | jsonb | Structured PDL response (experience, skills, education) |
| pdl_enriched_at | timestamp | |
| top_skills | jsonb (string[]) | Denormalized from specialist profiles |
| top_industries | jsonb (string[]) | |
| division | expert_division enum | |
| is_public | boolean (default true) | |
| profile_completeness | real (default 0) | |

**Indexes:** `firm_id`, `user_id`

### `specialist_profiles`
User-curated niche profiles (e.g., "Fractional CMO for B2B SaaS"). Search-facing when quality is high.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| expert_profile_id | text FK -> expert_profiles (cascade) | |
| firm_id | text FK -> service_firms (cascade) | |
| title | text | Profile title |
| body_description | text | Long-form description |
| skills | jsonb (string[]) | L2 COS skills |
| industries | jsonb (string[]) | |
| services | jsonb (string[]) | |
| quality_score | real (default 0) | |
| quality_status | quality_status (default "incomplete") | strong \| partial \| weak \| incomplete |
| source | specialist_profile_source (default "user_created") | |
| is_searchable | boolean (default false) | |
| is_primary | boolean (default false) | |
| status | specialist_profile_status (default "draft") | |

**Indexes:** `expert_profile_id`, `firm_id`, `is_searchable`

### `specialist_profile_examples`
Up to 3 proof-point work examples per specialist profile.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| specialist_profile_id | text FK -> specialist_profiles (cascade) | |
| example_type | example_type (default "project") | project \| role |
| title | text | |
| subject | text | |
| company_name, company_industry | text | |
| start_date, end_date | text | |
| is_current | boolean (default false) | |
| is_pdl_source | boolean (default false) | Seeded from PDL experience |
| pdl_experience_index | integer | |
| position | integer (default 1) | Display order |

**Index:** `specialist_profile_id`

---

## Enrichment & AI Tracking

### `enrichment_cache`
Domain-keyed cache for enrichment results. No auth/org required — guests and auth users both write here. The lookup endpoint checks this first (before service_firms and Neo4j) to avoid re-calling paid APIs.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | domain as id (e.g. "chameleoncollective.com") |
| domain | text NOT NULL UNIQUE | |
| firm_name | text | |
| enrichment_data | jsonb NOT NULL | Full enrichment result |
| has_pdl | boolean (default false) | Whether PDL stage completed |
| has_scrape | boolean (default false) | Whether scrape stage completed |
| has_classify | boolean (default false) | Whether classification completed |
| hit_count | integer (default 0) | Times this cache entry was used |

### `enrichment_audit_log`
Full audit trail of every enrichment step (PDL, Jina, classifier, etc.).

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| firm_id | text FK -> service_firms (set null) | |
| user_id | text FK -> users (set null) | |
| phase | text NOT NULL | pdl \| jina \| classifier \| linkedin \| case_study \| onboarding \| memory \| deep_crawl |
| source | text NOT NULL | URL, API name, etc. |
| raw_input | text | What was sent |
| raw_output | text | What came back |
| extracted_data | jsonb | Structured data stored |
| model | text | AI model used |
| cost_usd | real | |
| confidence | real | |
| duration_ms | integer | |
| status | text (default "success") | success \| error \| skipped |
| error_message | text | |

### `ai_usage_log`
Token/cost tracking across all AI features.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| organization_id | text FK -> organizations (set null) | |
| user_id | text FK -> users (set null) | |
| model | text NOT NULL | e.g., "gpt-4o-mini" |
| feature | text NOT NULL | enrichment \| matching \| chat \| voice \| classification |
| input_tokens, output_tokens | integer | |
| cost_usd | real | |
| entity_type, entity_id | text | What was processed |
| duration_ms | integer | |

### `onboarding_events`
Funnel analytics for the onboarding flow.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| user_id | text FK -> users (set null) | |
| organization_id | text FK -> organizations (set null) | |
| firm_id | text FK -> service_firms (set null) | |
| domain | text | Firm domain being onboarded |
| stage | text NOT NULL | domain_submitted \| cache_lookup \| enrichment_stage_done \| enrichment_complete \| interview_answer \| onboarding_complete |
| event | text NOT NULL | Specific event (e.g., cache_hit_full, pdl_done) |
| metadata | jsonb | Stage-specific context |

---

## Legacy Data Import (n8n Migration)

### `imported_companies`
Companies imported from legacy n8n platform. ICP classification + enrichment data.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| source_id | text NOT NULL | Original n8n companies.id |
| source | text (default "n8n") | |
| name | text NOT NULL | |
| domain, logo_url, description | text | |
| industry, sector, industry_group, sub_industry | text | Clearbit classification |
| size, employee_count_exact, employee_range | text/int | |
| revenue, estimated_revenue | text | |
| location, city, state, country, country_code | text | |
| founded_year | integer | |
| company_type, parent_domain | text | |
| website_url, linkedin_url, twitter_url, facebook_url | text | |
| tech_stack, tags | jsonb (string[]) | |
| funding_raised, latest_funding_stage | text | |
| is_icp | boolean | true = professional services firm |
| icp_classification | text | "professional_services" \| "saas" \| etc. |
| classification_confidence | real | |
| graph_node_id | text | Neo4j node ID |
| service_firm_id | text FK -> service_firms (set null) | Linked platform firm |
| enriched_at | timestamp | |
| enrichment_sources | jsonb | { pdl: "date", clearbit: "date" } |
| review_tags | jsonb (string[], default []) | |
| meta, legacy_data | jsonb | Provenance + raw n8n row |

### `imported_contacts`
People imported from legacy n8n platform.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| source_id | text NOT NULL | n8n contacts.id |
| source | text (default "n8n") | |
| company_id | text FK -> imported_companies (set null) | |
| first_name, last_name, name | text | |
| email, title, headline, short_bio | text | |
| linkedin_url, photo_url | text | |
| city, state, country | text | |
| is_partner | boolean | |
| is_icp | boolean | |
| profile_match | text | |
| profile_match_justification | text | |
| expert_classification | text | expert \| internal \| ambiguous |
| graph_node_id | text | Neo4j node ID |
| review_tags | jsonb (string[], default []) | |
| meta, legacy_data | jsonb | |

### `imported_outreach`
Historical outreach messages from n8n `fact.messages`.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| source_id | text NOT NULL | n8n message_id |
| source | text (default "n8n") | |
| company_id | text FK -> imported_companies (set null) | |
| contact_id | text FK -> imported_contacts (set null) | |
| message_type, message_module | text | From n8n |
| message | text | |
| direction | text | outbound \| inbound |
| sender_org_id, recipient_org_id | text | |
| opportunity_title | text | |
| sent_at | timestamp | |
| meta, legacy_data | jsonb | |

### `imported_clients`
Client companies from the legacy platform. Heavily enriched with Clearbit/PDL data.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| source_id | text NOT NULL | Legacy client company UUID |
| source | text (default "legacy") | |
| name | text NOT NULL | |
| domain, logo_url, description | text | |
| industry, sector, industry_group, sub_industry | text | |
| employee_count (text), employee_count_exact (int), employee_range | mixed | |
| estimated_revenue, annual_revenue | text | |
| location, city, state, country, country_code | text | |
| website, founded_year, company_type, parent_domain | mixed | |
| linkedin_url, twitter_url, facebook_url | text | |
| tech_stack, tags | jsonb (string[]) | |
| funding_raised, latest_funding_stage | text | |
| service_firm_source_id | text | Legacy organisation.id |
| service_firm_name | text | Denormalized |
| imported_company_id | text FK -> imported_companies (set null) | |
| enriched_at | timestamp | |
| enrichment_sources | jsonb | |
| legacy_data, meta | jsonb | |

### `imported_case_studies`
Case studies from legacy platform.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| source_id | text | Legacy authorId |
| source | text (default "legacy") | |
| author_org_source_id, author_org_name | text | |
| content | text | HTML content |
| status | text (default "published") | |
| client_companies | jsonb | Array of { id, name } |
| industries, skills | jsonb | Array of { id, name } |
| links | jsonb (string[]) | |
| markets | jsonb (string[]) | |
| expert_users | jsonb | Array of { id, name } |
| imported_company_id | text FK -> imported_companies (set null) | Author firm |
| legacy_data, meta | jsonb | |

---

## Firm Case Studies (User-Managed)

### `firm_case_studies`
Case studies submitted by firms (URL-based ingestion).

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| firm_id | text FK -> service_firms (cascade) | |
| organization_id | text NOT NULL | |
| source_url | text NOT NULL | User-provided URL |
| source_type | text (default "url") | url \| pdf_url |
| user_notes | text | |
| status | case_study_status (default "pending") | |
| status_message | text | Error/progress message |
| title | text | AI-generated |
| summary | text | AI-generated 2-sentence summary |
| auto_tags | jsonb | { skills, industries, services, clientName } |
| cos_analysis | jsonb | Full AI analysis |
| graph_node_id | text | Neo4j node ID |
| abstraction_profile_id | text | |
| ingested_at, last_ingested_at | timestamp | |

---

## Infrastructure

### `migration_batches`
Tracks legacy data import batch progress.

| Column | Type | Notes |
|--------|------|-------|
| id | text PK | |
| source | text (default "n8n") | |
| entity_type | text NOT NULL | companies \| contacts \| outreach \| research |
| batch_number | integer NOT NULL | |
| total_in_batch | integer NOT NULL | |
| imported, skipped, errors | integer (default 0) | |
| error_details | jsonb | |
| status | text (default "pending") | pending \| processing \| complete \| failed |
| started_at, completed_at | timestamp | |

### `settings`
Global key-value configuration store.

| Column | Type | Notes |
|--------|------|-------|
| key | text PK | |
| value | text | |
| updated_at | timestamp | |

---

## Relationship Map (Foreign Keys)

```
users ──┬── sessions
        ├── accounts
        ├── members ──── organizations ──┬── subscriptions
        ├── invitations ─────────────────┘    │
        ├── conversations ── messages         │
        ├── memory_entries                    │
        ├── memory_themes                     │
        ├── ai_usage_log                      │
        └── onboarding_events                 │
                                              │
organizations ── service_firms ──┬── partner_preferences
                                 ├── expert_profiles ── specialist_profiles ── specialist_profile_examples
                                 ├── firm_case_studies
                                 ├── partnerships ──┬── partnership_events
                                 │                  └── referrals
                                 ├── opportunities ── opportunity_shares
                                 ├── email_threads ── email_messages
                                 ├── email_approval_queue
                                 ├── scheduled_calls
                                 ├── call_recordings ── call_transcripts
                                 │                  └── coaching_reports
                                 ├── enrichment_audit_log
                                 └── imported_companies ──┬── imported_contacts
                                                          ├── imported_outreach
                                                          ├── imported_clients
                                                          └── imported_case_studies
```

---

## Migration History

| File | Tag | Description |
|------|-----|-------------|
| `0000_mute_blink.sql` | Initial | All base tables: auth (users, sessions, accounts, verifications), orgs (organizations, members, invitations), billing (subscriptions, subscription_events), domain (service_firms, partner_preferences, abstraction_profiles, conversations, messages, ai_usage_log) |
| `0001_happy_mantis.sql` | Phase 2 expansion | Partnerships, opportunities, referrals, email system (threads, messages, approval queue), call intelligence (scheduled_calls, call_recordings, call_transcripts, coaching_reports), enrichment (enrichment_audit_log, onboarding_events, memory system), legacy import tables (imported_companies/contacts/outreach/clients/case_studies, migration_batches), settings, solution_partners. Also added enrichment columns to service_firms. |
| `0002_cold_frank_castle.sql` | Expert profiles | New tables: expert_profiles, specialist_profiles, specialist_profile_examples, firm_case_studies, onboarding_events. New enums: case_study_status, expert_division, specialist_profile_source/status, quality_status, example_type. Extended abstraction_profiles with top_services/skills/industries/typicalClientProfile/partnershipReadiness. Extended imported_clients and imported_companies with enrichment columns (Clearbit/PDL fields). |
| `0002_expert_profiles.sql` | Manual migration | Standalone script for expert profile tables with IF NOT EXISTS guards and explicit indexes. Not tracked in Drizzle journal (run manually). |

**Drizzle journal version:** 7 (PostgreSQL dialect)

---

## Conventions

- **All IDs:** Application-generated text (UUIDs via `nanoid` or `crypto.randomUUID`)
- **Cascade deletes:** Auth tables cascade from `users`. Domain tables cascade from `service_firms`. Partnership-adjacent tables use `set null` for cross-entity FKs.
- **jsonb arrays:** Typed with `.$type<string[]>()` in Drizzle but stored as plain jsonb in PostgreSQL.
- **Timestamps:** All `timestamp` without timezone. Default `now()`.
- **No indexes in schema.ts:** Indexes are defined in manual migration `0002_expert_profiles.sql` only. The main schema relies on PK and unique constraints.
- **Polymorphic FK:** `abstraction_profiles.entity_type` + `entity_id` (no DB-level FK constraint).
- **Neo4j sync:** Tables with `graph_node_id` column are synced to Neo4j knowledge graph.
