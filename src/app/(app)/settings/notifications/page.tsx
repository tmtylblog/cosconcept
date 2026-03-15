"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Prefs {
  newMatches: boolean;
  partnershipUpdates: boolean;
  weeklyDigest: boolean;
  productUpdates: boolean;
}

const ITEMS: { key: keyof Prefs; label: string; description: string }[] = [
  { key: "newMatches",          label: "New match alerts",       description: "Get notified when Ossy finds a new potential partner" },
  { key: "partnershipUpdates",  label: "Partnership updates",    description: "Activity on active partnerships" },
  { key: "weeklyDigest",        label: "Weekly digest",          description: "Summary of matches, messages, and opportunities" },
  { key: "productUpdates",      label: "Product updates",        description: "New features and platform announcements" },
];

export default function NotificationsSettingsPage() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<keyof Prefs | null>(null);

  useEffect(() => {
    fetch("/api/settings/notifications")
      .then((r) => r.json())
      .then((data) => {
        setPrefs(data.preferences);
        setConfigured(data.configured ?? false);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function toggle(key: keyof Prefs) {
    if (!prefs || saving) return;
    const newVal = !prefs[key];
    setPrefs((p) => p ? { ...p, [key]: newVal } : p);
    setSaving(key);
    try {
      await fetch("/api/settings/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: newVal }),
      });
    } catch {
      // Revert on failure
      setPrefs((p) => p ? { ...p, [key]: !newVal } : p);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h2 className="font-heading text-lg font-semibold text-cos-midnight">Notifications</h2>
        <p className="mt-1 text-sm text-cos-slate">Control how and when you receive notifications.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-cos-electric" />
        </div>
      ) : (
        <div className="space-y-2">
          {ITEMS.map((item) => {
            const checked = prefs?.[item.key] ?? true;
            const isSaving = saving === item.key;

            return (
              <div key={item.key} className="flex items-center justify-between rounded-cos-xl border border-cos-border p-4">
                <div>
                  <p className="text-sm font-medium text-cos-midnight">{item.label}</p>
                  <p className="text-xs text-cos-slate">{item.description}</p>
                </div>
                <button
                  role="switch"
                  aria-checked={checked}
                  onClick={() => toggle(item.key)}
                  disabled={isSaving || !configured}
                  className={cn(
                    "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-cos-electric focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
                    checked ? "bg-cos-electric" : "bg-cos-cloud-dim"
                  )}
                >
                  <span className={cn(
                    "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
                    checked ? "translate-x-4" : "translate-x-1"
                  )} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-cos-slate-light">
        {configured
          ? "Preferences are synced with your email subscription settings."
          : "Email notification preferences will be active once connected to the mailing system."}
      </p>
    </div>
  );
}
