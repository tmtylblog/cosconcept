import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Normalize a LinkedIn URL to ensure it's a valid clickable link.
 * PDL often returns "linkedin.com/in/username" without the protocol.
 */
export function normalizeLinkedInUrl(url: string | null | undefined): string | null {
  if (!url || !url.trim()) return null;
  let normalized = url.trim().replace(/\/+$/, "");
  if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
    normalized = `https://${normalized}`;
  }
  return normalized;
}
