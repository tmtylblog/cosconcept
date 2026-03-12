# Pricing Tiers — Free vs Pro

> Last updated: 2026-03-11
> Source of truth for what is gated by plan. Update this file whenever limits change.
> Implementation: `src/lib/billing/plan-limits.ts`

---

## Plans

| | **Free** | **Pro ($199/mo)** | **Enterprise** |
|---|---|---|---|
| Tagline | Explore the Network | Harness the Network | Custom Solutions |
| Target | Firms just getting started | Active growth firms | Large agencies / platforms |

---

## Profile Data Limits

These limits govern how much data we pull from external sources (PDL, web crawls) and how much is visible on a firm's public profile. They protect our API costs on free accounts while giving paid users full access.

| Feature | Free | Pro | Enterprise |
|---|---|---|---|
| **Expert roster (PDL)** | 5 people (sample) | Full roster (up to 500) | Full roster |
| **Case studies displayed** | 5 | All | All |
| **Client logos / names shown** | 20 | All | All |

### Why these limits?

- **Expert roster** — PDL charges 1 credit per person returned. A 5-person teaser shows the feature's value and gives the firm enough to understand what they'd unlock. For an average 50-person agency, the full pull costs ~50 credits at $0.28 = ~$14/firm. We need paying customers to cover that.

- **Case studies** — We crawl unlimited case studies during deep enrichment and store them all. The display limit (5 on free) is a soft gate in the UI — the data exists, we just don't show it all. Upgrading unlocks the full portfolio view.

- **Client logos** — Similar to case studies: all clients are extracted and stored during enrichment. Free accounts show up to 20 on their public profile. The message: "You've worked with 47 clients — upgrade to show them all."

---

## Network & Matching Limits

| Feature | Free | Pro | Enterprise |
|---|---|---|---|
| **Monthly network searches** | 10 | Unlimited | Unlimited |
| **Potential matches per week** | 5 | 12 | Unlimited |
| **AI Perfect Matches per month** | 1 (trial) | 2 | Unlimited |
| **Opportunity responses per month** | 0 | 3 | Unlimited |

---

## Messaging & Collaboration

| Feature | Free | Pro | Enterprise |
|---|---|---|---|
| **Unlimited messaging** | No | Yes | Yes |
| **Team seats** | 1 | 3 | Unlimited |
| **Enhanced profile listing** | No | Yes | Yes |

---

## Platform Features

| Feature | Free | Pro | Enterprise |
|---|---|---|---|
| **Call intelligence** | No | Yes | Yes |
| **Email agent** | No | No | Yes |
| **Data export** | No | Yes | Yes |

---

## Upgrade Hooks (Where to Show the Gate)

These are the moments where we prompt a free user to upgrade. Each should include a clear explanation of what they'd unlock:

1. **Expert Roster page** — "You're seeing 5 of 47 team members. Upgrade to Pro to unlock your full expert roster and appear in more searches."

2. **Case Studies page** — "Showing 5 of 23 case studies. Your full portfolio is what gets you found — upgrade to display them all."

3. **Clients section** — "Showing 20 of 58 clients. Upgrade to showcase your full client list and boost credibility."

4. **Network search** — "You've used 10 of 10 searches this month. Upgrade to search the network without limits."

5. **Matching** — "You've used your 1 AI Perfect Match trial. Upgrade to Pro for 2/month and Pro-quality recommendations."

---

## Future Limits (Not Yet Implemented)

These are planned but not yet wired up:

- **Graph connections displayed** — free: 20 partners shown, pro: all
- **Saved searches** — free: 0, pro: 5, enterprise: unlimited
- **Custom categories** — free: use standard taxonomy, pro: add custom sub-categories
- **API access** — enterprise only

---

## Implementation Notes

- Hard limits (PDL credits, job queue) are enforced in the job handler and API routes.
- Display limits (case studies, clients) are currently UI-only — data is still stored for all tiers.
- Plan is stored in `subscriptions.plan` (Neon) and referenced via `PLAN_LIMITS` in `plan-limits.ts`.
- To check a plan in an API route: query `subscriptions` table by `organization_id`, look up `PLAN_LIMITS[plan]`.
