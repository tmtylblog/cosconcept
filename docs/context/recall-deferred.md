# Recall.ai Integration — Deferred

**Status:** Code exists in repo — NOT tested, NOT live in production.
**Deferred to:** Future sprint (post-MVP)
**Date noted:** 2026-03-09

---

## What exists

The codebase contains early scaffolding for Recall.ai integration:

- A webhook handler for Recall.ai bot events (inbound meeting recordings/transcripts)
- An Inngest function to join a meeting via a Recall.ai bot
- Environment variable references: `RECALLAI_API_KEY`

## What doesn't exist

- No end-to-end testing has been done
- No Recall.ai workspace has been provisioned or configured
- The bot join flow is not wired to any UI
- No meeting data is being stored or processed
- The webhook signature verification may be a stub

## Why deferred

Call intelligence (recording, transcript, summarisation) is a Phase 6+ feature per
the build roadmap. The current priority is:

1. Onboarding funnel (Phase 2)
2. Search & matching engine (Phase 4)
3. Partnerships (Phase 5)

## What to do when picking this up

1. Provision a Recall.ai account and set `RECALLAI_API_KEY`
2. Register the webhook endpoint with Recall.ai dashboard
3. Implement webhook signature verification (shared secret)
4. Test bot join → recording → transcript pipeline end-to-end
5. Store transcripts in a `call_transcripts` table (new schema migration needed)
6. Wire up the Calls UI (`/calls` page) to trigger bot joins from meeting links
