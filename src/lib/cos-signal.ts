/**
 * COS Signal System — unified signals for Ossy context awareness.
 *
 * Covers both navigation events (user clicks a nav link) and
 * in-page action events (user views a profile, requests an intro, etc.).
 */

export type PageMode =
  | "dashboard"
  | "discover"
  | "firm-overview"
  | "firm-offering"
  | "firm-experts"
  | "firm-experience"
  | "firm-preferences"
  | "partner-matching"
  | "partnerships"
  | "network"
  | "settings-profile"
  | "settings-team"
  | "settings-billing"
  | "settings-notifications"
  | "settings-security"
  | "settings-network";

export type CosSignal =
  | { kind: "nav"; page: PageMode }
  | {
      kind: "action";
      page: PageMode;
      action: string;
      entityType?: string;
      entityId?: string;
      displayName?: string;
      meta?: Record<string, string | number>;
    };

/**
 * Emit a COS signal that ChatPanel and OssyContext will pick up.
 * Safe to call from any component — no-ops during SSR.
 */
export function emitCosSignal(signal: CosSignal): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("cos:signal", { detail: signal }));
}

/** Map nav hrefs to PageMode values */
export const HREF_TO_PAGE_MODE: Record<string, PageMode> = {
  "/dashboard": "dashboard",
  "/discover": "discover",
  "/firm": "firm-overview",
  "/firm/offering": "firm-offering",
  "/firm/experts": "firm-experts",
  "/firm/experience": "firm-experience",
  "/firm/preferences": "firm-preferences",
  "/partner-matching": "partner-matching",
  "/partnerships": "partnerships",
  "/network": "network",
  "/settings": "settings-profile",
  "/settings/profile": "settings-profile",
  "/settings/team": "settings-team",
  "/settings/billing": "settings-billing",
  "/settings/notifications": "settings-notifications",
  "/settings/security": "settings-security",
  "/settings/network": "settings-network",
};
