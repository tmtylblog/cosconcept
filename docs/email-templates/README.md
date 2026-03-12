# COS Email Templates

> Templates designed for Customer.io, following COS brand principles.
> Label prefix: **[COS CONCEPT]**

## Why HTML files, not API creation

Customer.io's App API does not expose an endpoint to create or modify transactional templates
(POST/PUT `/v1/transactional` returns 404). Templates must be created via the Customer.io UI.

**How to use:**
1. Go to Customer.io → Journeys → Content → Transactional Messages
2. Click "New transactional message"
3. Name it `[COS CONCEPT] <template name>` (with the label prefix)
4. Set queue_drafts = true to prevent accidental sends
5. Paste the HTML from the corresponding file below into the "Custom HTML" editor
6. Save — do NOT connect a trigger until ready to go live

## Templates

| File | Template Name | Purpose |
|------|--------------|---------|
| `welcome.html` | [COS CONCEPT] Welcome to Collective OS | First email after account approval |
| `new-match.html` | [COS CONCEPT] New Match Alert | Ossy found a new potential partner |
| `partnership-request.html` | [COS CONCEPT] Partnership Request | Someone wants to partner with you |
| `partnership-accepted.html` | [COS CONCEPT] Partnership Accepted | Confirmation when both sides accept |
| `weekly-digest.html` | [COS CONCEPT] Weekly Digest | Weekly summary of matches and activity |

## Design System (Email)

| Element | Value |
|---------|-------|
| Header background | `#0A0F1E` (cos-midnight) |
| Accent / CTA | `#2563EB` (cos-electric) |
| Body background | `#F8FAFC` (cos-cloud) |
| Card background | `#FFFFFF` |
| Primary text | `#0A0F1E` |
| Secondary text | `#64748B` (cos-slate) |
| Border | `#E2E8F0` |
| Success green | `#10B981` (cos-signal) |
| Max width | 600px |
| Font stack | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif` |

## Variable Placeholders

Customer.io uses Liquid syntax. Standard variables:
- `{{customer.name}}` — recipient's name
- `{{customer.email}}` — recipient's email
- `{{data.firm_name}}` — their firm name
- `{{data.match_name}}` — matched firm name
- `{{data.cta_url}}` — call-to-action link
- `{{data.match_score}}` — match strength (0–100)

## Safety Note

These templates have `queue_drafts: false` in their metadata but **must not be connected to any
campaign trigger** until the account owner signs off. Customer.io transactional messages only fire
when explicitly triggered by code via `POST /v1/send/email` — they cannot self-trigger.
