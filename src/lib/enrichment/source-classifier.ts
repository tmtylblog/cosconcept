/**
 * Source Classifier — detects case study source type from URL.
 *
 * Used to route ingestion to the correct ingestor (YouTube, Vimeo,
 * Google Slides, PowerPoint Online, PDF upload, or generic URL scrape).
 */

export type CaseStudySourceType =
  | "url"
  | "youtube"
  | "vimeo"
  | "google_slides"
  | "powerpoint_online"
  | "pdf_upload";

/**
 * Classify a URL into a CaseStudySourceType.
 * Falls back to "url" for any unrecognised HTTP(S) URL.
 */
export function classifySourceUrl(url: string): CaseStudySourceType {
  if (/youtube\.com\/watch|youtu\.be\//.test(url)) return "youtube";
  if (/vimeo\.com\/\d+/.test(url)) return "vimeo";
  if (/docs\.google\.com\/presentation/.test(url)) return "google_slides";
  if (/onedrive\.live\.com|1drv\.ms|sharepoint\.com/.test(url))
    return "powerpoint_online";
  return "url";
}

/** Human-readable label for UI badges. */
export function getSourceTypeLabel(type: CaseStudySourceType): string {
  const labels: Record<CaseStudySourceType, string> = {
    url: "Website",
    youtube: "YouTube",
    vimeo: "Vimeo",
    google_slides: "Google Slides",
    powerpoint_online: "PowerPoint",
    pdf_upload: "PDF",
  };
  return labels[type];
}

/**
 * Lucide icon name for source-type placeholder rendering.
 * The caller is responsible for importing the actual icon component.
 */
export function getSourceTypePlaceholderIcon(type: CaseStudySourceType): string {
  const icons: Record<CaseStudySourceType, string> = {
    url: "Globe",
    youtube: "Youtube",
    vimeo: "Video",
    google_slides: "Presentation",
    powerpoint_online: "FilePresentation",
    pdf_upload: "FileText",
  };
  return icons[type];
}
