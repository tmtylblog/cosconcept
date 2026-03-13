# Case Studies — Full Feature Spec

> Created: 2026-03-12
> Status: Built — backend complete, frontend complete
> Branch: worktree-CaseStudy

---

## Overview & Goals

Case studies are the **ground truth** of what a firm has actually delivered. This feature
replaces simple URL-scraping with a full multi-format ingestion pipeline, a proprietary AI
abstraction layer, complete knowledge graph mapping, and a polished read-only UX for firm
owners to review their indexed work.

**What users cannot do:** Edit, tag, or annotate case studies. The system owns all
interpretation. Users can hide/unhide and add new sources.

**What the system does:** Ingests from 6 source types → AI-extracts structured analysis →
generates a visible summary layer + hidden abstraction layer → writes full graph relationships
→ generates a device-mockup preview image via Nano Banana Pro.

---

## Source Types

| Type | Detection Pattern | Content Strategy |
|------|-------------------|-----------------|
| `url` | Any HTTP(S) URL (default fallback) | Jina scrape → AI extract |
| `youtube` | `youtube.com` / `youtu.be` | YouTube Data API v3 (metadata + captions) |
| `vimeo` | `vimeo.com` | Vimeo API (metadata + transcript) |
| `google_slides` | `docs.google.com/presentation` | Export `/export/txt` endpoint (no API key) |
| `powerpoint_online` | `onedrive.live.com` / `1drv.ms` / `sharepoint.com` | Jina scrape of viewer URL (best-effort) |
| `pdf_upload` | File upload (`.pdf` only) | Direct browser → Vercel Blob → `pdf-parse` |

### URL Classifier (`classifySourceUrl.ts`)

```typescript
export function classifySourceUrl(url: string): CaseStudySourceType {
  if (/youtube\.com\/watch|youtu\.be\//.test(url)) return "youtube";
  if (/vimeo\.com\/\d+/.test(url)) return "vimeo";
  if (/docs\.google\.com\/presentation/.test(url)) return "google_slides";
  if (/onedrive\.live\.com|1drv\.ms|sharepoint\.com/.test(url)) return "powerpoint_online";
  return "url";
}
```

Rejected non-PDF uploads return a friendly error:
> "Only PDF files are supported for uploads. Export your file to PDF (File → Save As → PDF) then try again."

---

## Schema Changes

### `firm_case_studies` — new columns

```sql
-- Add to existing firm_case_studies table
file_storage_key    text                    -- Vercel Blob key for uploaded PDFs
source_metadata     jsonb                   -- {videoDuration, slideCount, transcriptLength, videoId, thumbnailSource}
preview_image_url   text                    -- Device mockup composite image (Nano Banana Pro output)
```

Update `source_type` accepted values (text column — soft change):
```
"url" | "youtube" | "vimeo" | "google_slides" | "powerpoint_online" | "pdf_upload"
```

### Drizzle schema additions

```typescript
fileStorageKey: text("file_storage_key"),
sourceMetadata: jsonb("source_metadata").$type<{
  videoDuration?: string;
  slideCount?: number;
  transcriptLength?: number;
  videoId?: string;
  thumbnailSource?: string; // URL of raw thumbnail before mockup composition
}>(),
previewImageUrl: text("preview_image_url"),
```

---

## Backend Architecture

### New Enrichment Modules (`src/lib/enrichment/`)

#### `source-classifier.ts`
- `classifySourceUrl(url: string): CaseStudySourceType`
- `getSourceTypeLabel(type: CaseStudySourceType): string` — human-readable label for UI badges
- `getSourceTypeIcon(type: CaseStudySourceType): string` — icon name for placeholder rendering

#### `youtube-ingestor.ts`
- Uses **YouTube Data API v3** (`YOUTUBE_API_KEY`)
- `extractYouTubeId(url)` — handles `watch?v=`, `youtu.be/`, `embed/` formats
- `fetchYouTubeMetadata(videoId)` → title, description, channel, duration, thumbnail URL
- `fetchYouTubeTranscript(videoId)` → `youtube-transcript` npm package (auto-captions)
- Composes rawText: `{title}\n{description}\n\n[TRANSCRIPT]\n{transcript}`
- Returns `{ rawText, thumbnailUrl, sourceMetadata }`

#### `vimeo-ingestor.ts`
- Uses **Vimeo API** (`VIMEO_ACCESS_TOKEN`)
- `extractVimeoId(url)` — handles `vimeo.com/{id}` patterns
- `fetchVimeoMetadata(videoId)` → oEmbed API (free, no token needed for public videos)
- `fetchVimeoTranscript(videoId)` → Vimeo API texttracks endpoint (requires token)
- Fallback if no transcript: combine title + description + tags
- Returns `{ rawText, thumbnailUrl, sourceMetadata }`

#### `slides-ingestor.ts`
- **Google Slides**: Extract presentation ID from URL → fetch `https://docs.google.com/presentation/d/{id}/export/txt`
  - If export fails (private/restricted): Jina scrape the `/pub` URL as fallback
- **PowerPoint Online**: Jina scrape the viewer URL (best-effort HTML render)
- Returns `{ rawText, thumbnailUrl: null, sourceMetadata: { slideCount } }`

#### `pdf-upload-ingestor.ts`
- Replace placeholder `extractTextFromPdf()` with `pdf-parse`
- `extractPdfText(buffer: Buffer): Promise<string>` — uses `pdf-parse` for robust text extraction
- `downloadFromBlob(storageKey: string): Promise<Buffer>` — fetch PDF from Vercel Blob
- Returns extracted text capped at 50k characters

### Updated `case-study-ingestor.ts`

Extend `CaseStudySourceType` to include all 6 types. Add routing:

```typescript
case "youtube": {
  const result = await ingestYouTube(input.url!);
  rawText = result.rawText;
  thumbnailUrl = result.thumbnailUrl;
  sourceMetadata = result.sourceMetadata;
  break;
}
case "vimeo": { ... }
case "google_slides": { ... }
case "powerpoint_online": { ... }
case "pdf_upload": {
  const buffer = await downloadFromBlob(input.fileStorageKey!);
  rawText = await extractPdfText(buffer);
  break;
}
```

### Updated `firm-case-study-ingest.ts` (Inngest)

Add two new steps after existing Step 8 (`finalize`):

#### Step 9: `generate-preview`
- Skip if `previewImageUrl` already set and source unchanged
- Source-specific thumbnail acquisition:
  - `youtube` / `vimeo`: use `thumbnailUrl` from ingestor (already a high-quality image)
  - `url` / `google_slides` / `powerpoint_online`: call screenshot API (ScreenshotOne or Microlink as interim until Nano Banana Pro key provided)
  - `pdf_upload`: render first page via `pdfjs-dist` canvas → base64 image
- Pass thumbnail/screenshot to **Nano Banana Pro API** → returns device mockup composite URL
- **Fallback** (when API key not yet set): store raw thumbnail/screenshot URL directly in `previewImageUrl`
- Update `firmCaseStudies.previewImageUrl`

#### Step 10: `link-entities`
- Fuzzy-match extracted `clientName` against `serviceFirms.name` (Levenshtein distance ≤ 2, case-insensitive)
- If match confidence ≥ 0.75 → write `FOR_CLIENT` edge to matched `Company` node
- If no match → create/merge `Client` node with string name (existing behaviour)

### Knowledge Graph — Full Edge Set

Every ingested case study writes these edges in `writeCaseStudyToGraph()`:

| Edge | From | To | Notes |
|------|------|----|-------|
| `CREATED_BY` | CaseStudy | Company:ServiceFirm | Always — the uploading workspace |
| `FOR_CLIENT` | CaseStudy | Company or Client | Client from AI extraction; matched to ServiceFirm if possible |
| `DEMONSTRATES_SKILL` | CaseStudy | Skill | All `skillsDemonstrated` — normalized to L2/L3 |
| `USES_SERVICE` | CaseStudy | Service | All `servicesUsed` |
| `IN_INDUSTRY` | CaseStudy | Industry | All `industries` |
| `IN_MARKET` | CaseStudy | Market | From abstraction `taxonomyMapping` |
| `HAS_SOURCE_TYPE` | CaseStudy | SourceType string prop | Stored as property, not separate node |

**`CaseStudy` node properties** (update `graph-writer.ts`):
```
id, firmId, organizationId, title, description, sourceUrl, sourceType,
status, outcomes[], previewImageUrl, evidenceStrength, confidence, updatedAt
```

`CREATED_BY` edge creation:
```cypher
MERGE (cs:CaseStudy {id: $caseStudyId})
MERGE (f:Company {id: $firmId})
MERGE (cs)-[:CREATED_BY]->(f)
```

---

## PDF Upload Flow (Vercel Blob)

Direct browser → Blob upload pattern (bypasses Vercel's 4.5MB API body limit):

```
1. Client requests upload token: POST /api/firm/case-studies/upload-token
   → Server calls Vercel Blob handleUpload() → returns clientToken
2. Client uploads directly to Vercel Blob using @vercel/blob/client
   → Returns { url, pathname }
3. Client sends: POST /api/firm/case-studies { sourceType: "pdf_upload", fileStorageKey: pathname, filename }
   → Server creates firmCaseStudies row
   → Fires enrich/firm-case-study-ingest Inngest event with fileStorageKey
4. Inngest job downloads from Blob, extracts text, runs full pipeline
```

**Limits:** 50MB max file size. PDF only (enforced client + server side).
**Setup:** Enable Vercel Blob in Vercel dashboard → Storage → Create Blob store → `BLOB_READ_WRITE_TOKEN` env var.

---

## API Endpoints

### New endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `POST /api/firm/case-studies/upload-token` | POST | Generate Vercel Blob client upload token |
| `GET /api/firm/case-studies/[id]` | GET | Fetch single case study detail (owner only) |

### Existing endpoints (no changes needed)

| Endpoint | Notes |
|----------|-------|
| `POST /api/firm/case-studies` | Already handles URL submission — extend to accept `fileStorageKey`, `sourceType` |
| `PATCH /api/firm/case-studies/[id]` | Already handles hide/unhide |

---

## Environment Variables

Add to `.env.example` and Vercel:

```bash
# Case Study Ingestion
YOUTUBE_API_KEY=             # Google Cloud Console → YouTube Data API v3
VIMEO_ACCESS_TOKEN=          # vimeo.com/settings/apps → read + video_files scope
NANO_BANANA_PRO_API_KEY=     # Case study asset generation (preview mockups)

# File Storage
BLOB_READ_WRITE_TOKEN=       # Vercel Blob (enable in Vercel dashboard → Storage)
```

---

## Frontend

### `/firm/experience` — Rich Grid List Page

**Layout:** 2-column grid on desktop, 1-column on mobile. Each card is a clickable surface
navigating to `/firm/experience/[id]`.

**Card anatomy (Google Material card pattern):**
```
┌────────────────────────────────────┐
│  [Preview Image / Source Placeholder] │  ← 16:9 aspect ratio, rounded top corners
│                                    │
│  [Source Badge]        [Hide btn]  │  ← "YouTube" / "PDF" / "Web" etc.
│  Title                             │
│  Client name (if extracted)        │
│  [Skill] [Industry] [+2 more]      │  ← max 3 tags, overflow count
│  Evidence: ●●○ Moderate            │  ← dot indicator, only if active
└────────────────────────────────────┘
```

**Placeholder when no preview image yet:**
- `youtube` → YouTube play button icon (red) on dark background
- `vimeo` → Vimeo logo icon on dark blue background
- `google_slides` → Slides icon on green background
- `powerpoint_online` → PowerPoint icon on orange background
- `pdf_upload` → PDF icon on cos-ember/10 background
- `url` → Globe icon on cos-midnight/5 background
- All use `animate-pulse` shimmer overlay while `status === "ingesting"`

**Add button:** Prominent `+ Add Case Study` button in the page header row (next to title),
styled as primary CTA (`bg-cos-electric`). Opens the submission dialog (modal overlay).

**Processing banner:** Inline progress bar (existing) — keep as-is.

**Page header area:**
```
Experience & Case Studies          [+ Add Case Study]
{N} case studies · auto-discovered from {domain}
```

### `/firm/experience/[id]` — Case Study Detail Page (Read-Only)

**Layout strategy (Google UX — F-pattern reading, content-first):**

```
┌─────────────────────────────────────────────────────┐
│ ← Back to Experience                                 │
│                                                       │
│ [Source Badge]  [Source Type Icon]  [Open Original ↗]│
│ TITLE (large, cos-midnight, font-heading)             │
│ Client: Acme Corp · Healthcare · 3 months · Team of 4 │
│                                                       │
│ ┌─────────────────────┐  ┌──────────────────────────┐│
│ │                     │  │ CHALLENGE                 ││
│ │  [PREVIEW IMAGE]    │  │ {challenge text}           ││
│ │  Device Mockup      │  │                           ││
│ │  (aspect ratio 4:3) │  │ SOLUTION                  ││
│ │                     │  │ {solution text}            ││
│ └─────────────────────┘  │                           ││
│                           │ APPROACH                  ││
│                           │ {approach text}           ││
│                           └──────────────────────────┘│
│                                                       │
│ OUTCOMES                                              │
│ • {outcome 1}                                         │
│ • {outcome 2}                                         │
│                                                       │
│ METRICS                         (highlight cards)     │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐               │
│ │ 150%     │ │ $2M      │ │ 3 months │               │
│ │ Revenue  │ │ Pipeline │ │ Duration │               │
│ └──────────┘ └──────────┘ └──────────┘               │
│                                                       │
│ CAPABILITIES DEMONSTRATED                             │
│ Skills: [Figma] [Shopify] [React] ...                 │
│ Services: [Brand Strategy] [Web Design] ...           │
│ Industries: [DTC] [Healthcare] ...                    │
│                                                       │
│ EVIDENCE QUALITY          [●●● Strong]                │
│ {evidenceReasoning text}                              │
└─────────────────────────────────────────────────────┘
```

**Layout rationale:**
- Preview image + narrative side-by-side (58%/42% split on desktop) for above-the-fold impact
- Metrics as highlight cards — scannable at a glance (Material "stat chip" pattern)
- Tags below narrative — secondary information, not the lead
- Evidence strength at bottom — internal signal, not the focus

**Responsive behaviour:**
- Mobile: Preview image full-width → narrative stacked below → metrics scroll horizontally

**No edit controls.** The only interactive element is the "Open Original" link (opens `sourceUrl`
in new tab) and the back navigation.

### Submission Dialog — `CaseStudySubmissionDialog`

Triggered by the `+ Add Case Study` button. Full-screen modal on mobile, centered dialog
(max-w-lg) on desktop.

**Layout:**

```
┌─────────────────────────────────────────────┐
│ Add a Case Study                        [×] │
│                                             │
│ ┌─────────────────────────────────────┐     │
│ │ 🔗 Paste a link...                  │     │
│ └─────────────────────────────────────┘     │
│                                             │
│ ✓ YouTube video detected                   │  ← live detection badge
│   "How We Helped Acme Scale to $10M"       │  ← video title preview
│                                             │
│ ─────────────── or ───────────────          │
│                                             │
│ ┌─────────────────────────────────────┐     │
│ │  ↑  Drag & drop a PDF here          │     │
│ │     or click to browse              │     │
│ │     PDF only · max 50 MB            │     │
│ └─────────────────────────────────────┘     │
│                                             │
│         [Cancel]   [Analyze & Add →]        │
└─────────────────────────────────────────────┘
```

**Smart URL input behaviour:**
- On paste/type: debounced (300ms) URL classification
- Shows badge: `YouTube` (red) / `Vimeo` (blue) / `Google Slides` (green) / `PowerPoint` (orange) / `Website` (cos-electric) / `Unknown format` (cos-warm warning)
- For YouTube/Vimeo: fetches oEmbed title preview immediately (free, client-side proxy)
- For Google Slides: shows "Presentation detected"
- Invalid URL: soft warning, not a hard block (let the server validate)

**PDF drop zone:**
- Accepts `.pdf` only (`accept=".pdf"`)
- Blocks `.pptx`, `.ppt`, `.key`, `.docx` with friendly message:
  > "Export to PDF first: File → Save As → PDF, then upload here."
- 50MB limit enforced client-side before upload begins
- Shows filename + size on selection
- Drag active state: border becomes `cos-electric`, background `cos-electric/5`

**Submit states:**
1. Idle → "Analyze & Add →"
2. Uploading PDF → "Uploading... {X}%" (progress bar)
3. Submitting → spinner + "Submitting..."
4. Done → dialog closes, new card appears in grid with shimmer (status: ingesting)

**Validation rules:**
- URL and PDF are mutually exclusive (URL input clears when PDF dropped, and vice versa)
- URL must be non-empty or PDF must be selected to enable submit
- No text/paste mode

---

## Legacy JSON Import Script

**File:** `scripts/import-legacy-case-studies.ts`

**Source:** `data/legacy/Data Dump (JSON)/Step 3_ Organization Content Data/case-studies.json`

**Strategy:** Option B — fresh AI pipeline from public URL. Skip case studies without links.

```
For each case_study in JSON:
  1. Extract URLs from case_study_links[]
  2. Skip if no links found (log as "no_url")
  3. For each URL:
     a. Check if firmCaseStudies row already exists for this URL (idempotent)
     b. Match firm via case_study_companies[0].company.name → serviceFirms.name
        - Exact match first
        - Levenshtein fuzzy match (distance ≤ 2) fallback
        - If no match: log as "firm_not_found", skip
     c. Create firmCaseStudies row: status="pending", sourceType="url"
     d. Fire enrich/firm-case-study-ingest Inngest event
  4. Log summary: matched, skipped_no_url, firm_not_found, duplicate
```

Run with: `npx tsx scripts/import-legacy-case-studies.ts`
Dry-run mode: `--dry-run` flag logs matches without writing.

---

## Preview Generation — Nano Banana Pro Integration

**File:** `src/lib/enrichment/preview-generator.ts`

```typescript
export async function generateCaseStudyPreview(input: {
  sourceType: CaseStudySourceType;
  rawThumbnailUrl?: string;  // YouTube/Vimeo thumbnail
  sourceUrl: string;
  title: string;
}): Promise<string | null>
```

**Logic:**
1. Acquire raw image:
   - `youtube` / `vimeo`: use `rawThumbnailUrl` directly
   - `pdf_upload`: render first page via `pdfjs-dist` → base64 PNG → upload to Blob → get URL
   - All others: call screenshot API to capture `sourceUrl`
2. Pass raw image URL to Nano Banana Pro API → returns device mockup composite URL
3. If `NANO_BANANA_PRO_API_KEY` not set → return raw image URL as fallback (graceful degradation)
4. Store result in `firmCaseStudies.previewImageUrl`

**Screenshot API (interim until Nano Banana Pro key provided):**
Use Microlink.io free tier: `https://api.microlink.io?url={encoded}&screenshot=true&embed=screenshot.url`

---

## Build Order

| # | Task | Files Affected |
|---|------|----------------|
| 1 | Schema migration (new columns) | `schema.ts`, new drizzle migration |
| 2 | `pdf-parse` integration (replace placeholder) | `case-study-ingestor.ts` |
| 3 | `source-classifier.ts` | new file |
| 4 | `youtube-ingestor.ts` | new file |
| 5 | `vimeo-ingestor.ts` | new file |
| 6 | `slides-ingestor.ts` (Google Slides + PowerPoint) | new file |
| 7 | Extend `case-study-ingestor.ts` with all source types | existing file |
| 8 | Vercel Blob upload token endpoint | new `upload-token/route.ts` |
| 9 | Extend `firm-case-study-ingest.ts` (Steps 9+10) | existing file |
| 10 | Update `graph-writer.ts` (CREATED_BY + full edge set) | existing file |
| 11 | `preview-generator.ts` (Nano Banana Pro + fallback) | new file |
| 12 | `/firm/experience` list page → rich grid redesign | existing page |
| 13 | `CaseStudySubmissionDialog` component | new component |
| 14 | `/firm/experience/[id]` detail page | new page |
| 15 | Legacy import script | new script |
| 16 | Update `.env.example` and context docs | env file, this file |

---

## Dependencies to Install

```bash
npm install pdf-parse @types/pdf-parse
npm install youtube-transcript
npm install @vercel/blob
npm install pdfjs-dist  # for PDF first-page rendering in preview step
```

---

## Context Files to Update After Build

- `docs/context/database.md` — new columns on `firm_case_studies`
- `docs/context/enrichment.md` — new ingestor modules
- `docs/context/inngest-jobs.md` — Steps 9+10 on firm-case-study-ingest
- `docs/context/knowledge-graph.md` — CREATED_BY edge, updated CaseStudy properties
- `docs/context/api-reference.md` — new upload-token endpoint
