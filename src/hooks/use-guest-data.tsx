"use client";

import {
  createContext,
  useContext,
  useCallback,
  useState,
  useEffect,
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
}

// ─── SessionStorage Keys ─────────────────────────────────

const PREFS_KEY = "cos_guest_preferences";
const MSGS_KEY = "cos_guest_messages";

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

// ─── Context ─────────────────────────────────────────────

const GuestDataContext = createContext<GuestDataContextValue>({
  guestPreferences: {},
  setGuestPreference: () => {},
  guestMessages: [],
  setGuestMessages: () => {},
  hasGuestData: false,
  clearGuestData: () => {},
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

  // Hydrate from sessionStorage on mount
  useEffect(() => {
    setPrefsState(
      loadFromStorage<Record<string, string | string[]>>(PREFS_KEY, {})
    );
    setMsgsState(loadFromStorage<UIMessage[]>(MSGS_KEY, []));
    setHydrated(true);
  }, []);

  // Persist preferences to sessionStorage
  useEffect(() => {
    if (!hydrated) return;
    saveToStorage(PREFS_KEY, guestPreferences);
  }, [guestPreferences, hydrated]);

  // Persist messages to sessionStorage
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

  const clearGuestData = useCallback(() => {
    setPrefsState({});
    setMsgsState([]);
    try {
      sessionStorage.removeItem(PREFS_KEY);
      sessionStorage.removeItem(MSGS_KEY);
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
      }}
    >
      {children}
    </GuestDataContext.Provider>
  );
}
