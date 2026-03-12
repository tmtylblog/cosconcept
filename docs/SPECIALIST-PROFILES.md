# Specialist Profiles — Dedicated Quality Process

> **Status:** Planning. Specialist profile generation has been intentionally REMOVED from the automatic expert-linkedin enrichment handler. It will be rebuilt as a separate, dedicated process.

## Context

Previously, specialist profiles were auto-generated during expert enrichment using a single Gemini Flash call. This produced profiles that were functional but lacked the quality bar we want. Specialist profiles are THE core unit of matchability — they're what gets searched, ranked, and presented to potential partners. They deserve their own dedicated process.

## What the Base Enrichment Does (Current)

The `expert-linkedin` handler now captures the **factual base layer** only:

- **PDL Person Data:** full name, headline, title, location, bio/summary
- **Work History:** full job history with company names, industries, titles, dates
- **Skills:** PDL self-reported skills, mapped to our L3 taxonomy (18K entries)
- **Education:** schools, degrees, dates
- **Seniority:** job title levels (cxo, vp, director, senior, etc.) + title class
- **Division:** lightweight heuristic bucket (leader/member/associate) from title levels
- **Graph:** Person node, CURRENTLY_AT edge, WORKED_AT edges, HAS_SKILL edges

This data is stored in:
- `expert_profiles` table (PG) — identity, PDL data JSONB, topSkills, topIndustries
- `Neo4j` — Person node with edges to Company, Skill, ServiceFirm nodes

## What Specialist Profiles Should Be (Future)

TODO: Design the dedicated specialist profile generation process. Key considerations:

### Quality Requirements
- Each profile should represent a genuine, provable area of expertise
- Must be grounded in actual work history (not just skills lists)
- Should include concrete examples from real engagements
- Quality score must reflect actual evidence, not just completeness

### Process Design Questions
- Should generation be a multi-step pipeline (draft → review → publish)?
- Should there be human-in-the-loop review for key profiles?
- What AI model(s) should generate them? (More capable model than Flash?)
- Should experts be able to edit/approve their own profiles?
- How do we handle experts with thin work histories?
- Should firm context (case studies, services) inform profile generation?

### Data Inputs Available
- PDL work history (companies, titles, dates, industries)
- PDL skills (self-reported)
- Firm's case studies (if enriched)
- Firm's service offerings
- Firm's classification (categories, industries, markets)
- Expert's team classification (expert/potential/not_expert)

### Integration Points
- `specialist_profiles` table — already exists in schema
- `specialist_profile_examples` table — links profiles to evidence
- Neo4j SpecialistProfile nodes — for graph-based matching
- Search/matching engine — queries SpecialistProfile nodes

## Files Reference

| File | Role |
|------|------|
| `src/lib/enrichment/specialist-generator.ts` | Old auto-generation (NOT called by enrichment anymore) |
| `src/lib/expert/quality-score.ts` | Profile quality scoring |
| `src/lib/db/schema.ts` | `specialistProfiles` + `specialistProfileExamples` tables |
| `src/lib/enrichment/graph-writer.ts` | `writeSpecialistProfileToGraph()` |
| `src/lib/jobs/handlers/expert-linkedin.ts` | Base enrichment (no specialist profiles) |
