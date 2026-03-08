"use client";

import { useEffect, useState } from "react";
import { Mail, AlertTriangle, CheckCircle, Save } from "lucide-react";

export default function EmailSettingsPage() {
  const [testMode, setTestMode] = useState(true);
  const [whitelist, setWhitelist] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/settings?key=email_test_mode").then((r) => r.json()),
      fetch("/api/admin/settings?key=email_test_whitelist").then((r) => r.json()),
    ])
      .then(([modeRes, wlRes]) => {
        setTestMode(modeRes.value !== "false");
        setWhitelist(wlRes.value ?? "");
      })
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setSaved(false);
    await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        { key: "email_test_mode", value: testMode ? "true" : "false" },
        { key: "email_test_whitelist", value: whitelist },
      ]),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 rounded-cos-md bg-cos-border" />
        <div className="h-40 rounded-cos-xl bg-cos-border/50" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-cos-midnight">
          Email Settings
        </h1>
        <p className="mt-1 text-sm text-cos-slate">
          Control how Ossy sends emails. Test mode redirects all outgoing mail to a safe whitelist.
        </p>
      </div>

      {/* Test Mode Banner */}
      {testMode && (
        <div className="flex items-start gap-3 rounded-cos-xl border border-cos-warm/30 bg-cos-warm/8 px-5 py-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-cos-warm mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-cos-midnight">Test mode is active</p>
            <p className="mt-0.5 text-sm text-cos-slate">
              All outgoing emails are redirected to the whitelist below. No real users will
              receive email from Ossy until test mode is turned off.
            </p>
          </div>
        </div>
      )}

      {/* Settings card */}
      <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-6 space-y-6">
        {/* Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-cos-midnight">Test Mode</p>
            <p className="mt-0.5 text-xs text-cos-slate">
              When ON, all emails are intercepted and redirected to the whitelist.
            </p>
          </div>
          <button
            onClick={() => setTestMode((v) => !v)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none ${
              testMode ? "bg-cos-warm" : "bg-cos-border"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                testMode ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {/* Whitelist */}
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-cos-midnight">
            Whitelist Emails
          </label>
          <p className="text-xs text-cos-slate">
            Comma-separated. Only these addresses will receive intercepted emails in test mode.
          </p>
          <textarea
            value={whitelist}
            onChange={(e) => setWhitelist(e.target.value)}
            rows={3}
            placeholder="fred@example.com, jacqui@example.com"
            className="w-full resize-none rounded-cos-lg border border-cos-border bg-cos-cloud px-4 py-3 font-mono text-sm text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none"
          />
        </div>

        {/* Save button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {saved && (
              <>
                <CheckCircle className="h-4 w-4 text-cos-signal" />
                <span className="text-sm text-cos-signal">Saved</span>
              </>
            )}
          </div>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 rounded-cos-lg bg-cos-electric px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving…" : "Save Settings"}
          </button>
        </div>
      </div>

      {/* Info box */}
      <div className="rounded-cos-xl border border-cos-electric/20 bg-cos-electric/5 px-5 py-4">
        <div className="flex items-start gap-3">
          <Mail className="h-5 w-5 shrink-0 text-cos-electric mt-0.5" />
          <div className="text-sm text-cos-slate space-y-1">
            <p className="font-semibold text-cos-midnight">How test mode works</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>Every email from <code className="font-mono">sendEmail()</code> is intercepted — no exceptions</li>
              <li>Recipients are replaced with the whitelist addresses</li>
              <li>Subject is prefixed with <code className="font-mono">[TEST → original@email.com]</code></li>
              <li>A yellow banner is added to the email body</li>
              <li>Auto-approved emails are downgraded to pending in test mode</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
