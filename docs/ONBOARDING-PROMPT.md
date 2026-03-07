# COS CONCEPT — Onboarding Prompt & Conversational Flow

## Overview
When a new firm joins Collective OS, Ossy conducts a conversational interview to understand their partnership preferences. This can happen via text chat or voice. The goal is to collect enough information to start generating matches — without overwhelming the user.

**Principle:** Progressive disclosure. Get the basics first, enrich over time.

---

## The 8 Preference Dimensions

These are the core dimensions Ossy explores during onboarding. They form the firm's "partnership dating profile."

### 1. Service Offerings & Capabilities
- What services does your firm provide?
- What are your core competencies vs. things you can do but don't lead with?
- What do you NOT do (and wish you had a partner for)?

### 2. Industry & Vertical Focus
- What industries do you primarily serve?
- Are there industries you want to break into?
- Are there industries you avoid?

### 3. Geographic Markets
- Where do you operate?
- Are you open to partners in different geographies?
- Do you need local presence or can you work remotely?

### 4. Ideal Partner Profile
- What type of firm do you want to partner with? (agency, consultancy, fractional, etc.)
- What size partner are you looking for?
- What capabilities do you want in a partner?
- Have you had successful partnerships before? What made them work?

### 5. Client Profile & Deal Size
- What type of clients do you serve? (size, industry, stage)
- What's your typical project/contract size?
- Do you work on retainers or project-based?

### 6. Partnership Model Preferences
- How do you prefer to structure partnerships? (subcontracting, co-delivery, referral, white-label)
- Revenue sharing preferences?
- How do you handle client ownership?

### 7. Values & Working Style
- What's your firm's culture like?
- What values matter most in a partner?
- What are deal-breakers?
- How do you communicate? (Slack, email, calls, etc.)

### 8. Growth Goals
- What are you trying to achieve in the next 12 months?
- Are you looking for more clients, better clients, or different types of work?
- What's holding you back from growing faster?

---

## Conversational Flow Design

### Opening
Ossy introduces itself and frames the conversation:
> "Welcome to Collective OS. I'm Ossy, your AI growth consultant. I'd love to learn about your firm so I can start finding the right partners for you. This should take about 5-10 minutes — we can do it by text or voice, whichever you prefer. Ready?"

### Interview Style
- **One question at a time** — don't overwhelm
- **Acknowledge and reflect** — "So you're a brand strategy firm focused on D2C brands — that's great. Let me ask about..."
- **Use their language** — if they say "shops" not "agencies," use "shops"
- **Probe deeper when relevant** — "You mentioned Shopify — do you do custom development or just strategy?"
- **Skip what we already know** — if website scraping already captured their services, confirm don't re-ask
- **Allow tangents** — if they mention a great partnership story, let them tell it (it's data!)

### Closing
> "Thanks for sharing all that. Based on what you've told me, I'm already seeing some interesting potential matches. Give me a moment to analyze your profile, and I'll share my first recommendations."

---

## Pre-Population Strategy
Before the interview, Ossy should already know:
- Firm name, website, basic description (from global database)
- Services listed on their website (from Jina scraping)
- Case studies visible on their website
- Key team members (from LinkedIn/Proxycurl)
- Firm category classification (from our taxonomy)

The interview then CONFIRMS and ENRICHES rather than starting from scratch:
> "I can see from your website that you focus on brand strategy and creative production for D2C brands. Is that still accurate, or has your focus shifted?"

---

## Admin Export Mode
The onboarding data should be exportable in a structured format for admin review:
- JSON export of all 8 preference dimensions
- Match readiness score (how complete is the profile?)
- Flags for manual review (contradictions, unusual preferences, etc.)

---

## Voice-Specific Considerations
When onboarding happens via voice:
- Ossy should speak in shorter sentences
- Allow natural pauses for the user to think
- Confirm understanding: "Just to make sure I got that right — you said..."
- Handle interruptions gracefully (user corrects mid-sentence)
- Offer to switch to text for complex lists ("Would you rather type out your service list? Sometimes that's easier.")

---

## Data Output
The onboarding produces:
1. **Partner preferences** stored in `partner_preferences` table (Neon PostgreSQL)
2. **Service/skill edges** created in Neo4j (OFFERS_SERVICE relationships)
3. **Industry/market edges** created in Neo4j (HAS_EXPERTISE_IN, OPERATES_IN)
4. **Partner type preferences** stored as SEEKS_PARTNER_TYPE edges
5. **Abstraction profile** generated (triggers embedding computation via Inngest)
6. **Initial matches** generated (triggers cascading search pipeline)
