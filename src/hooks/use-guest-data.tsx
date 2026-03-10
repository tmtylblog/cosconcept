"use client";

import {
  createContext,
  useContext,
  useCallback,
  useState,
  useEffect,
  useRef,
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

// ─── SessionStorage Keys ─────────────────────────────────

const PREFS_KEY = "cos_guest_preferences";
const MSGS_KEY = "cos_guest_messages";
const DOMAIN_KEY = "cos_guest_domain";

// ─── Helpers ─────────────────────────────────────────────

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage(key: string, data: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(data));
  } catch {
    // quota exceeded or SSR — ignore
  }
}

function getGuestDomain(): string | null {
  try {
    return sessionStorage.getItem(DOMAIN_KEY);
  } catch {
    return null;
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

  // ── Hydrate from sessionStorage first, then DB ────────
  useEffect(() => {
    // 1. Immediate hydration from sessionStorage (fast, synchronous)
    const localPrefs = loadFromStorage<Record<string, string | string[]>>(
      PREFS_KEY,
      {}
    );
    const localMsgs = loadFromStorage<UIMessage[]>(MSGS_KEY, []);
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
          // If DB had fields local didn't, save the merged set back
          if (Object.keys(merged).length > Object.keys(current).length) {
            saveToStorage(PREFS_KEY, merged);
            console.log(
              `[GuestData] Merged ${Object.keys(dbPrefs).length} DB prefs with ${Object.keys(current).length} local prefs → ${Object.keys(merged).length} total`
            );
          }
          return merged;
        });
      });
    }
  }, []);

  // ── Persist preferences to sessionStorage + DB ────────
  useEffect(() => {
    if (!hydrated) return;

    // Always write to sessionStorage (instant)
    saveToStorage(PREFS_KEY, guestPreferences);

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
    saveToStorage(MSGS_KEY, guestMessages);
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

  /** Imperative flush: immediately write current preferences to both sessionStorage and DB.
   *  Call this before login/redirect to ensure nothing is lost. */
  const forceFlushToDb = useCallback(() => {
    // Sync to sessionStorage immediately
    saveToStorage(PREFS_KEY, guestPreferences);

    const domain = getGuestDomain();
    if (domain && Object.keys(guestPreferences).length > 0) {
      console.log(
        `[GuestData] Force-flushing ${Object.keys(guestPreferences).length} prefs for ${domain}`
      );
      syncPrefsToDb(domain, guestPreferences);
      lastSyncedRef.current = JSON.stringify(guestPreferences);
    }
  }, [guestPreferences]);

  const clearGuestData = useCallback(() => {
    setPrefsState({});
    setMsgsState([]);
    lastSyncedRef.current = "";
    try {
      sessionStorage.removeItem(PREFS_KEY);
      sessionStorage.removeItem(MSGS_KEY);
      // Don't remove DOMAIN_KEY — we keep the domain association
    } catch {
      // ignore
    }
  }, []);

  return (
    <GuestDataContext.Provider
      value={{
        guestPreferences,
        setGuestPreference,
        guestMessages,
        setGuestMessages,
        hasGuestData,
        clearGuestData,
        forceFlushToDb,
      }}
    >
      {children}
    </GuestDataContext.Provider>
  );
}
