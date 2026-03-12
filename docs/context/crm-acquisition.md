# 20. CRM & Acquisition Pipeline

> Last updated: 2026-03-12

## The Two Pipelines — Critical Distinction

COS has **two completely separate pipeline concepts** that must never be confused:

---

### Pipeline 1: COS Acquisition Pipeline (Freddie selling the platform)

**"Who is COS trying to convert into paying platform customers?"**

This is Freddie's outbound sales motion — agencies, consultancies, and fractional leaders that COS is pitching the platform to. These are prospective COS customers who do not yet have accounts.

- **External system**: HubSpot CRM (synced bidirectionally)
- **Outbound tools**: Instantly (email campaigns), Unipile/LinkedIn (connection + DM campaigns)
- **COS tables**: `acq_contacts`, `acq_companies`, `acq_deals`
- **Attribution**: When a prospective customer signs up to COS, did they come via Instantly? LinkedIn? Direct?
- **Single HubSpot user today**: freddie.laker@joincollectiveos.com

**HubSpot Deal stages** represent the COS sales funnel:
→ Prospect → Contacted → Qualified → Demo → Proposal → **Customer** (converted = COS user created)

---

### Pipeline 2: COS Marketplace (platform customers working together)

**"How are COS platform members partnering with each other?"**

This is the core product — firms that are already on the platform finding partners, sharing leads, and doing referrals with each other. These are entirely internal to COS and have nothing to do with HubSpot.

- **COS tables**: `partnerships`, `opportunities`, `leads`, `lead_shares`, `referrals`
- **Opportunities** = private intelligence a firm extracts from a call/email (e.g., "client needs a PR firm")
- **Leads** = a promoted opportunity shared with the network so other firms can claim it
- **Partnerships** = bilateral trusted relationships between platform firms
- **Referrals** = tracked revenue flow when a lead converts

**These are NOT HubSpot Deals.** A HubSpot Deal is "Acme Agency considering buying COS Pro". A COS Lead is "Acme Agency (already a COS customer) has a client who needs a branding firm — who on the platform can help?"

---

## HubSpot Sync Architecture

### Direction 1: HubSpot → COS (pull sync)

Scheduled job (`hubspot-sync`) runs periodically. Pulls all HubSpot data into COS-native tables.

| HubSpot Object | COS Table | Sync Strategy |
|---|---|---|
| Contact | `acq_contacts` | UPSERT on `hubspot_contact_id` |
| Company | `acq_companies` | UPSERT on `hubspot_company_id` |
| Deal | `acq_deals` | UPSERT on `hubspot_deal_id` |
| Associations | FK columns on `acq_contacts`, `acq_deals` | Updated during sync |

### Direction 2: COS → HubSpot (push on events)

| COS Event | HubSpot Action |
|---|---|
| New user signs up | Find matching contact by email → set `cos_user_id` custom property → move deal to "Customer" stage |
| Attribution found at signup | Add note to HubSpot contact with source (Instantly campaign name, LinkedIn campaign name) |

---

## COS-Native Acquisition Tables

These tables own the data in COS. HubSpot is a sync target, not the source of truth. If COS ever replaces HubSpot, these tables remain unchanged.

### `acq_companies`
Companies being pitched to become COS platform customers.

| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| name | text NOT NULL | |
| domain | text | Company website domain |
| industry | text | |
| size_estimate | text | e.g. "10-50" |
| hubspot_company_id | text UNIQUE | HubSpot object ID |
| hubspot_synced_at | timestamp | Last sync from HubSpot |
| cos_org_id | text | Set when they become a COS customer (FK → organizations) |
| created_at | timestamp | |
| updated_at | timestamp | |

### `acq_contacts`
Individual people being prospected.

| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| email | text UNIQUE | Primary key for attribution matching |
| first_name | text | |
| last_name | text | |
| linkedin_url | text | For LinkedIn attribution |
| company_id | text FK → acq_companies | |
| hubspot_contact_id | text UNIQUE | HubSpot object ID |
| hubspot_owner_id | text | HubSpot owner (Freddie) |
| hubspot_synced_at | timestamp | |
| cos_user_id | text UNIQUE | Set when they become a COS user (FK → users) |
| created_at | timestamp | |
| updated_at | timestamp | |

### `acq_deals`
Sales opportunities in the COS acquisition funnel.

| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| name | text NOT NULL | e.g. "Acme Agency — COS Pro" |
| contact_id | text FK → acq_contacts | Primary contact |
| company_id | text FK → acq_companies | |
| hubspot_deal_id | text UNIQUE | HubSpot object ID |
| hubspot_pipeline_id | text | |
| hubspot_stage_id | text | |
| stage_label | text | Human-readable stage name |
| deal_value | text | Estimated ARR |
| closed_at | timestamp | When won/lost |
| status | text (default 'open') | open \| won \| lost |
| hubspot_synced_at | timestamp | |
| created_at | timestamp | |
| updated_at | timestamp | |

### `attribution_events`
Records how a COS signup was sourced from the acquisition pipeline.

| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| user_id | text UNIQUE FK → users | The new COS user |
| contact_id | text FK → acq_contacts | Matched acquisition contact |
| instantly_campaign_id | text | Instantly campaign UUID if matched |
| instantly_campaign_name | text | |
| linkedin_campaign_id | text FK → growth_ops_invite_campaigns | LinkedIn campaign if matched |
| linkedin_invite_target_id | text FK → growth_ops_invite_targets | Specific invite target |
| match_method | text | email_exact \| linkedin_url \| name_domain \| none |
| matched_at | timestamp | |
| created_at | timestamp | |

---

## Attribution Logic

When a new user signs up (triggered via Better Auth `onUserCreated` hook or post-signup job):

1. **Email exact match** → check `acq_contacts.email` and `growth_ops_invite_targets` (if we have their email)
2. **Instantly match** → query `POST /api/v2/leads/list` filtering by email; if found, record campaign name
3. **LinkedIn match** → if user provided LinkedIn URL in onboarding, match against `growth_ops_invite_targets.linkedin_url`
4. **Name + domain match** → fallback: match first_name + email domain against `acq_contacts`
5. Record result in `attribution_events` regardless (match_method = "none" if no match)

---

## HubSpot Custom Properties

These should be created in HubSpot to enable COS→HubSpot writes:

| Object | Property Name | Type | Purpose |
|---|---|---|---|
| Contact | `cos_user_id` | text | COS user ID once they sign up |
| Contact | `cos_signup_date` | date | When they became a COS user |
| Contact | `cos_attribution_source` | text | instantly / linkedin / direct |
| Contact | `cos_attribution_campaign` | text | Campaign name |
| Deal | `cos_customer` | checkbox | true = they signed up to COS |

---

## HubSpot Private App Scopes Required

Create at: HubSpot → Settings → Integrations → Private Apps

| Scope | Purpose |
|---|---|
| `crm.objects.contacts.read` | Sync contacts for acquisition pipeline |
| `crm.objects.contacts.write` | Update contact with COS user ID on signup |
| `crm.objects.companies.read` | Sync companies |
| `crm.objects.deals.read` | Sync deals / Kanban |
| `crm.objects.deals.write` | Update deal stage when contact converts |
| `crm.objects.notes.write` | Log attribution as a HubSpot note |
| `crm.associations.read` | Link contacts ↔ deals ↔ companies |
| `crm.schemas.deals.read` | Read pipeline + stage definitions |
| `crm.objects.owners.read` | Deal/contact owner info |

---

## Environment Variables

| Var | Status |
|---|---|
| `HUBSPOT_ACCESS_TOKEN` | ⏳ Pending — Freddie to create Private App and paste token |

---

## Future: COS Replaces HubSpot

If COS eventually replaces HubSpot as the acquisition CRM:
- The `acq_contacts`, `acq_companies`, `acq_deals` tables stay — they become the sole source of truth
- The `hubspot_*` columns become nullable/unused
- The Kanban board (`/admin/growth-ops/hubspot`) switches to reading from `acq_deals` directly
- The bidirectional sync job is removed
- Attribution logic is unchanged (already reads from COS-native tables)
