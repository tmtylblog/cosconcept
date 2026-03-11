# 1. Architecture & Stack

> Last updated: 2026-03-11

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | Next.js 15 (App Router) + TypeScript | React 19, strict mode |
| Styling | Tailwind CSS 4 | `cos-` design token prefix via `@theme` |
| UI Components | shadcn/ui + Radix primitives | Lucide icons |
| Validation | Zod v4 | Runtime validation for AI outputs, API requests, env vars |
| Relational DB | Neon PostgreSQL + Drizzle ORM | Replaced Prisma — lighter, SQL-native, edge-friendly |
| Vector Store | pgvector on Neon | Phase 3+ (not yet live for queries) |
| Graph DB | Neo4j Aura | Knowledge graph — firm/expert/client relationships |
| Auth | Better Auth v1.5.4 | Database-first, org/role plugins, stores in Neon |
| AI Models | Vercel AI SDK v6 (multi-model) | Claude Sonnet, Gemini Flash/Pro, OpenAI embeddings |
| Voice STT | Deepgram Nova-3 | Real-time streaming |
| Voice TTS | ElevenLabs / Deepgram Aura | Ossy voice output |
| Background Jobs | Inngest | Durable serverless orchestration |
| Billing | Stripe | Subscriptions + webhooks |
| Email | Resend | ossy@joincollectiveos.com |
| File Storage | Vercel Blob | Logos, audio, documents |
| Cache | Upstash Redis | Phase 4+ |
| Monitoring | Sentry | Error tracking |
| Deployment | Vercel | git push → auto-deploy |

## AI Model Strategy (Multi-Model)

| Model | Provider | Use Case | Cost Tier |
|-------|----------|----------|-----------|
| Claude Sonnet | OpenRouter | Conversational UX, voice, bio generation | Medium |
| Gemini 2.0 Flash | OpenRouter | Matching, ranking, classification | Low |
| Gemini 2.0 Pro | OpenRouter | Deep ranking with explanations | Medium |
| OpenAI text-embedding-3-small | Direct | Vector embeddings for semantic search | Very low |

## Project Structure

```
COS CONCEPT 2/
├── src/
│   ├── app/                    # Next.js App Router pages & API
│   │   ├── (app)/              # Authenticated app routes
│   │   ├── (admin)/admin/      # Admin dashboard routes
│   │   ├── (auth)/             # Auth pages (login, org select)
│   │   ├── api/                # All API endpoints (~70+)
│   │   ├── globals.css         # Tailwind + cos- design tokens
│   │   ├── layout.tsx          # Root layout
│   │   └── page.tsx            # Landing page
│   ├── components/             # Shared UI components
│   │   ├── ui/                 # shadcn/ui primitives
│   │   ├── chat/               # Chat-specific components
│   │   ├── experts/            # Expert profile components
│   │   └── admin/              # Admin dashboard components
│   └── lib/                    # Core libraries
│       ├── db/                 # Drizzle schema & connection
│       │   ├── index.ts        # Neon connection (lazy-init)
│       │   └── schema.ts       # All Drizzle tables (~43)
│       ├── ai/                 # AI orchestration
│       ├── enrichment/         # Enrichment pipeline (~13 modules)
│       ├── matching/           # Search engine (~6 modules)
│       ├── billing/            # Stripe & feature gates
│       ├── email/              # Email client
│       ├── voice/              # Voice I/O
│       ├── neo4j.ts            # Neo4j driver singleton
│       ├── auth.ts             # Better Auth server config
│       ├── auth-client.ts      # Better Auth client hooks
│       ├── env.ts              # Zod env validation
│       ├── stripe.ts           # Stripe client
│       └── utils.ts            # cn() utility
├── data/                       # Reference CSV files
├── docs/                       # Architecture docs & specs
│   └── context/                # Living knowledge files (this system)
├── scripts/                    # Migration & seeding utilities
├── drizzle/                    # Generated DB migrations
├── drizzle.config.ts           # Drizzle Kit config
├── next.config.ts              # Next.js config
├── package.json                # Dependencies
└── .env.example                # Required env vars
```

## Deployment

- **Automatic:** `git push origin main` → Vercel builds, lints, deploys (~2-3 min)
- **No special deploy steps needed** — pipeline handles everything
- **Preview deployments:** Vercel creates preview URLs for PRs automatically

## Critical Environment Variables

```
# AI
OPENROUTER_API_KEY          # Claude/Gemini access via OpenRouter
OPENAI_API_KEY              # Embeddings only

# Databases
DATABASE_URL                # Neon PostgreSQL connection string
NEO4J_URI                   # Neo4j Aura bolt URI (migrated to 13a38041 on 2026-03-11)
NEO4J_USERNAME              # Neo4j auth (default: neo4j)
NEO4J_PASSWORD              # Neo4j auth (rotated 2026-03-11 — get from Vercel or team)

# Auth
GOOGLE_CLIENT_ID            # Google OAuth
GOOGLE_CLIENT_SECRET        # Google OAuth
BETTER_AUTH_URL             # Auth base URL (production domain)
BETTER_AUTH_SECRET           # Session signing key

# Billing
STRIPE_SECRET_KEY           # Stripe API
STRIPE_WEBHOOK_SECRET       # Stripe webhook verification
STRIPE_PRO_MONTHLY_PRICE_ID # Stripe price ID for Pro plan

# Email
RESEND_API_KEY              # Resend email sending
RESEND_DEV_OVERRIDE         # (optional) Redirect all emails to dev address

# Enrichment
JINA_READER_API_KEY         # Jina web scraping
PROXYCURL_API_KEY           # LinkedIn enrichment

# Infrastructure
INNGEST_SIGNING_KEY         # Inngest job auth
INNGEST_EVENT_KEY           # Inngest event publishing
SENTRY_DSN                  # Error tracking
BLOB_READ_WRITE_TOKEN       # Vercel Blob storage

# Partner Sync
PARTNER_SYNC_API_KEY        # Shared secret for server-to-server partner sync API (x-api-key header)
```

## Key Design Principles

1. **Ground Truth Principle:** What firms have actually done matters more than what they say
2. **Abstraction Layer:** Hidden normalized profiles derived from actual work
3. **Cascading Search:** Structured → Vector → LLM (99% filtered before LLM)
4. **Cost Consciousness:** Cheapest model that can do the job; AI cost gateway tracks everything
5. **Bidirectional Matching:** Both parties must want what the other offers
6. **Progressive Disclosure:** Get basic info first, enrich over time
