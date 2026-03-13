# Dev Status

> Update this file before starting and after finishing each task.
> Required by CLAUDE.md multi-dev coordination rules.

---

## Active Worktrees

| Worktree | Branch | Dev | Status |
|----------|--------|-----|--------|
| `CaseStudy` | `worktree-CaseStudy` | Owner | Backend + frontend built — see below |
| `main` | `main` | All | Active production branch |

---

## Current Work — `worktree-CaseStudy`

**Feature:** Case Studies — Multi-format ingestion, rich UX, knowledge graph mapping

**Status:** Built. Awaiting API keys + dependency install + DB migration before deploy.

**Branch:** `worktree-CaseStudy`
**Last updated:** 2026-03-12

---

## What Was Built (Do Not Re-Do)

### Backend — Complete
| File | What |
|------|------|
| `drizzle/0011_case_study_preview.sql` | DB migration — 3 new columns on `firm_case_studies` |
| `src/lib/db/schema.ts` | Added `fileStorageKey`, `sourceMetadata`, `previewImageUrl` to `firmCaseStudies` |
| `src/lib/enrichment/source-classifier.ts` | URL auto-detection for 6 source types |
| `src/lib/enrichment/youtube-ingestor.ts` | YouTube Data API v3 + transcript |
| `src/lib/enrichment/vimeo-ingestor.ts` | Vimeo oEmbed + VTT transcript |
| `src/lib/enrichment/slides-ingestor.ts` | Google Slides `/export/txt` + PowerPoint Jina scrape |
| `src/lib/enrichment/case-study-ingestor.ts` | Real `pdf-parse` + all 6 source types routed |
| `src/lib/enrichment/preview-generator.ts` | Microlink screenshot → Nano Banana Pro (stubbed, fallback active) |
| `src/lib/enrichment/graph-writer.ts` | Added `CREATED_BY`, `USES_SERVICE`, `IN_MARKET` edges |
| `src/app/api/firm/case-studies/upload-token/route.ts` | Vercel Blob direct upload (50MB, PDF only) |
| `src/app/api/firm/case-studies/[id]/route.ts` | GET handler for single case study detail |
| `src/inngest/functions/firm-case-study-ingest.ts` | Added Step 9 (preview gen) + Step 10 (entity linking) |

### Frontend — Complete
| File | What |
|------|------|
| `src/app/(app)/firm/experience/page.tsx` | Rich 2-col grid, source-type icon placeholders, evidence dots |
| `src/components/firm/case-study-submission-dialog.tsx` | Smart URL detection + PDF drag-drop modal |
| `src/app/(app)/firm/experience/[id]/page.tsx` | Server component detail page |
| `src/components/firm/case-study-detail-view.tsx` | Full detail UI: preview + narrative + metrics + capabilities |
| `src/hooks/use-case-studies.ts` | Added `previewImageUrl`, `cosAnalysis` to `CaseStudy` type |

### Scripts
| File | What |
|------|------|
| `scripts/import-legacy-case-studies.ts` | One-time legacy JSON import with `--dry-run` support |

---

## Before Going Live — Required Actions

**1. Install dependencies** (not yet installed):
```bash
npm install pdf-parse @types/pdf-parse youtube-transcript @vercel/blob
```

**2. Run DB migration:**
```bash
npx drizzle-kit migrate
```

**3. Add env vars to Vercel:**
```
YOUTUBE_API_KEY=          # Google Cloud → YouTube Data API v3
VIMEO_ACCESS_TOKEN=       # vimeo.com/settings/apps → read + video_files scope
NANO_BANANA_PRO_API_KEY=  # Case study preview image generation (API key TBD)
BLOB_READ_WRITE_TOKEN=    # Vercel dashboard → Storage → enable Blob store
```

**4. Nano Banana Pro integration:**
- `preview-generator.ts` has a TODO comment at the exact integration point
- Graceful fallback (Microlink raw screenshot) is active until key is set
- Once key + API docs are provided, fill in the stubbed `callNanaBananaPro()` function

**5. Run legacy import (optional):**
```bash
npx tsx scripts/import-legacy-case-studies.ts --dry-run   # verify matches first
npx tsx scripts/import-legacy-case-studies.ts              # run for real
```

---

## What's NOT Built Yet (Next Up)

| Item | Notes |
|------|-------|
| Public case study page `/work/[firmSlug]/[caseStudyId]` | Future — route structure stubbed in spec |
| Admin case study tooling | Out of scope for this build — later |
| Nano Banana Pro real API call | Blocked on API key + docs |
| `pdfjs-dist` first-page render for PDF previews | Preview step uses Microlink fallback for now |

---

## Files Being Modified Right Now

*None — build complete, awaiting deploy steps.*

---

## How to Pick Up This Work

1. `cd` into the worktree: already at `C:\Users\m1227\cosconcept\.claude\worktrees\CaseStudy`
2. Read `docs/context/case-studies.md` — the complete feature spec
3. Read this file for current status
4. Do the "Before Going Live" steps above
5. Check `git diff main` to see all changes before merging
