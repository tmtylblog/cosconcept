"use client";

import {
  createContext,
  useContext,
  useCallback,
  useState,
  useEffect,
  useRef,
  useMemo,
} from "react";
import type { ReactNode } from "react";
import type { UIMessage } from "ai";

// ─── Types ───────────────────────────────────────────────

interface GuestDataContextValue {
  /** Accumulated preference data from guest onboarding */
  guestPreferences: Record<string, string | string[]>;
  /** Store a single preference field */
  setGuestPreference: (field: string, value: string | string[]) => void;
  /** Guest chat messages for migration after auth */
  guestMessages: UIMessage[];
  /** Update stored messages */
  setGuestMessages: (msgs: UIMessage[]) => void;
  /** Whether any guest data exists (preferences or messages) */
  hasGuestData: boolean;
  /** Clear all guest data (call after successful migration) */
  clearGuestData: () => void;
  /** Force immediate DB sync of all preferences (call before login prompt) */
  forceFlushToDb: () => void;
}

// ─── Storage Keys ────────────────────────────────────────
// Domain + preferences use localStorage (survives browser close).
// Messages use sessionStorage (less critical, large payload).

const PREFS_KEY = "cos_guest_preferences";
const MSGS_KEY = "cos_guest_messages";
const DOMAIN_KEY = "cos_guest_domain";

// ─── Helpers ─────────────────────────────────────────────

/** Read from localStorage (persistent) with JSON parse */
function loadFromLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Write to localStorage (persistent) */
function saveToLocal(key: string, data: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // quota exceeded or SSR — ignore
  }
}

/** Read from sessionStorage (tab-scoped) */
function loadFromSession<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Write to sessionStorage (tab-scoped) */
function saveToSession(key: string, data: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(data));
  } catch {
    // quota exceeded or SSR — ignore
  }
}

/** Get guest domain from localStorage first, then sessionStorage as fallback */
function getGuestDomain(): string | null {
  try {
    return localStorage.getItem(DOMAIN_KEY) || sessionStorage.getItem(DOMAIN_KEY);
  } catch {
    return null;
  }
}

/** Save domain to BOTH localStorage and sessionStorage */
export function setGuestDomain(domain: string): void {
  try {
    localStorage.setItem(DOMAIN_KEY, domain);
    sessionStorage.setItem(DOMAIN_KEY, domain);
  } catch {
    // ignore
  }
}

// ─── DB sync helpers ─────────────────────────────────────

/** Write preferences to DB (non-blocking, fire-and-forget) */
function syncPrefsToDb(domain: string, preferences: Record<string, string | string[]>) {
  fetch("/api/guest/preferences", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domain, preferences }),
  }).catch((err) => console.warn("[GuestData] DB sync failed:", err));
}

/** Load preferences from DB by domain */
async function loadPrefsFromDb(
  domain: string
): Promise<Record<string, string | string[]> | null> {
  try {
    const res = await fetch(
      `/api/guest/preferences?domain=${encodeURIComponent(domain)}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.preferences || null;
  } catch {
    return null;
  }
}

// ─── Context ─────────────────────────────────────────────

const GuestDataContext = createContext<GuestDataContextValue>({
  guestPreferences: {},
  setGuestPreference: () => {},
  guestMessages: [],
  setGuestMessages: () => {},
  hasGuestData: false,
  clearGuestData: () => {},
  forceFlushToDb: () => {},
});

export function useGuestData() {
  return useContext(GuestDataContext);
}

// ─── Provider ────────────────────────────────────────────

export function GuestDataProvider({ children }: { children: ReactNode }) {
  const [guestPreferences, setPrefsState] = useState<
    Record<string, string | string[]>
  >({});
  const [guestMessages, setMsgsState] = useState<UIMessage[]>([]);
  const [hydrated, setHydrated] = useState(false);
  // Track last-synced state to avoid redundant DB writes
  const lastSyncedRef = useRef<string>("");

  // ── Hydrate: localStorage → sessionStorage → DB ────────
  useEffect(() => {
    // 1. Immediate hydration from localStorage (persistent, survives browser close)
    //    Fall back to sessionStorage for backwards compat with older sessions
    let localPrefs = loadFromLocal<Record<string, string | string[]>>(PREFS_KEY, {});
    if (Object.keys(localPrefs).length === 0) {
      localPrefs = loadFromSession<Record<string, string | string[]>>(PREFS_KEY, {});
      // Migrate to localStorage if found in sessionStorage
      if (Object.keys(localPrefs).length > 0) {
        saveToLocal(PREFS_KEY, localPrefs);
        console.log(`[GuestData] Migrated ${Object.keys(localPrefs).length} prefs from sessionStorage → localStorage`);
      }
    }

    // Messages stay in sessionStorage (large payload, less critical)
    const localMsgs = loadFromSession<UIMessage[]>(MSGS_KEY, []);

    setPrefsState(localPrefs);
    setMsgsState(localMsgs);
    lastSyncedRef.current = JSON.stringify(localPrefs);
    setHydrated(true);

    // 2. Then check DB for any preferences saved from a previous session
    const domain = getGuestDomain();
    if (domain) {
      loadPrefsFromDb(domain).then((dbPrefs) => {
        if (!dbPrefs || Object.keys(dbPrefs).length === 0) return;
        // Merge: DB values fill gaps, local values take priority (more recent)
        setPrefsState((current) => {
          const merged = { ...dbPrefs, ...current };
          const currentCount = Object.keys(current).length;
          const mergedCount = Object.keys(merged).length;
          // If DB had fields local didn't, save the merged set back
          if (mergedCount > currentCount) {
            saveToLocal(PREFS_KEY, merged);
            saveToSession(PREFS_KEY, merged); // keep sessionStorage in sync too
            console.log(
              `[GuestData] Merged ${Object.keys(dbPrefs).length} DB prefs with ${currentCount} local prefs → ${mergedCount} total`
            );
          }
          return merged;
        });
      });
    }
  }, []);

  // ── Persist preferences to localStorage + sessionStorage + DB ────────
  useEffect(() => {
    if (!hydrated) return;

    // Write to both storages (instant)
    saveToLocal(PREFS_KEY, guestPreferences);
    saveToSession(PREFS_KEY, guestPreferences);

    // Only write to DB if preferences actually changed
    const snapshot = JSON.stringify(guestPreferences);
    if (snapshot === lastSyncedRef.current) return;
    if (Object.keys(guestPreferences).length === 0) return;
    lastSyncedRef.current = snapshot;

    const domain = getGuestDomain();
    if (domain) {
      syncPrefsToDb(domain, guestPreferences);
    }
  }, [guestPreferences, hydrated]);

  // ── Persist messages to sessionStorage ─────────────────
  useEffect(() => {
    if (!hydrated) return;
    saveToSession(MSGS_KEY, guestMessages);
  }, [guestMessages, hydrated]);

  const setGuestPreference = useCallback(
    (field: string, value: string | string[]) => {
      setPrefsState((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  const setGuestMessages = useCallback((msgs: UIMessage[]) => {
    setMsgsState(msgs);
  }, []);

  const hasGuestData =
    hydrated &&
    (Object.keys(guestPreferences).length > 0 || guestMessages.length > 0);

  /** Imperative flush: immediately write current preferences to all storages + DB.
   *  Call this before login/redirect to ensure nothing is lost. */
  const guestPrefsRef = useRef(guestPreferences);
  guestPrefsRef.current = guestPreferences;

  const forceFlushToDb = useCallback(() => {
    const prefs = guestPrefsRef.current;
    // Sync to both storages immediately
    saveToLocal(PREFS_KEY, prefs);
    saveToSession(PREFS_KEY, prefs);

    const domain = getGuestDomain();
    if (domain && Object.keys(prefs).length > 0) {
      console.log(
        `[GuestData] Force-flushing ${Object.keys(prefs).length} prefs for ${domain}`
      );
      syncPrefsToDb(domain, prefs);
      lastSyncedRef.current = JSON.stringify(prefs);
    }
  }, []);

  const clearGuestData = useCallback(() => {
    setPrefsState({});
    setMsgsState([]);
    lastSyncedRef.current = "";
    try {
      localStorage.removeItem(PREFS_KEY);
      sessionStorage.removeItem(PREFS_KEY);
      sessionStorage.removeItem(MSGS_KEY);
      // Don't remove DOMAIN_KEY — we keep the domain association
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo(() => ({
    guestPreferences,
    setGuestPreference,
    guestMessages,
    setGuestMessages,
    hasGuestData,
    clearGuestData,
    forceFlushToDb,
  }), [guestPreferences, setGuestPreference, guestMessages, setGuestMessages, hasGuestData, clearGuestData, forceFlushToDb]);

  return (
    <GuestDataContext.Provider value={value}>
      {children}
    </GuestDataContext.Provider>
  );
}
