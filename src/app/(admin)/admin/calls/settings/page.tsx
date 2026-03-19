"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Settings, ArrowLeft, Save, RotateCcw, CheckCircle, AlertCircle } from "lucide-react";
import Link from "next/link";
import { FIRM_CATEGORIES, MARKETS } from "@/lib/ai/extraction-vocab";

export default function CallSettingsPage() {
  const [prompt, setPrompt] = useState("");
  const [defaultPrompt, setDefaultPrompt] = useState("");
  const [isCustom, setIsCustom] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/calls/settings")
      .then((r) => r.json())
      .then((data) => {
        setPrompt(data.prompt);
        setDefaultPrompt(data.defaultPrompt);
        setIsCustom(data.isCustom);
      })
      .catch(() => setFlash({ type: "error", message: "Failed to load settings" }))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setFlash(null);
    try {
      const res = await fetch("/api/admin/calls/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (res.ok) {
        setIsCustom(true);
        setFlash({ type: "success", message: "Prompt saved successfully" });
      } else {
        const err = await res.json();
        setFlash({ type: "error", message: err.error || "Save failed" });
      }
    } catch {
      setFlash({ type: "error", message: "Network error" });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setPrompt(defaultPrompt);
    setFlash({ type: "success", message: "Reset to default prompt (save to apply)" });
  };

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <p className="text-sm text-[var(--cos-text-muted)]">Loading settings&hellip;</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/admin/calls"
          className="inline-flex items-center gap-1 text-xs text-[var(--cos-text-muted)] hover:text-[var(--cos-primary)] mb-3 transition-colors"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Call Transcripts
        </Link>
        <div className="flex items-center gap-3">
          <Settings className="h-5 w-5 text-[var(--cos-primary)]" />
          <h1 className="text-xl font-semibold text-[var(--cos-text-primary)]">
            Call Intelligence Settings
          </h1>
        </div>
        <p className="text-sm text-[var(--cos-text-muted)] mt-1">
          Configure the AI prompt used to extract opportunities from call transcripts.
        </p>
      </div>

      {/* Flash message */}
      {flash && (
        <div
          className={`flex items-center gap-2 px-4 py-3 rounded-lg mb-4 text-sm ${
            flash.type === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {flash.type === "success" ? (
            <CheckCircle className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          {flash.message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Prompt editor */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-[var(--cos-border)] p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[var(--cos-text-primary)]">
                Extraction Prompt
              </h2>
              {isCustom && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                  Custom
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--cos-text-muted)] mb-3">
              This prompt tells the AI how to identify opportunities in transcripts. The system automatically
              prepends the transcript text and appends the categories/markets vocabulary &mdash;
              you only need to define the extraction instructions here.
            </p>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={20}
              className="w-full rounded-lg border border-[var(--cos-border)] px-4 py-3 text-sm font-mono text-[var(--cos-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--cos-primary)]/30 focus:border-[var(--cos-primary)] resize-y leading-relaxed"
            />
            <div className="flex items-center justify-between mt-3">
              <p className="text-xs text-[var(--cos-text-muted)]">
                {prompt.length.toLocaleString()} characters
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleReset}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  Reset to Default
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving || prompt.length < 50}>
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  {saving ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Reference panel */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-[var(--cos-border)] p-5">
            <h3 className="text-sm font-semibold text-[var(--cos-text-primary)] mb-2">
              How It Works
            </h3>
            <div className="text-xs text-[var(--cos-text-secondary)] space-y-2">
              <p>
                When a transcript is uploaded, the AI receives:
              </p>
              <ol className="list-decimal list-inside space-y-1 ml-1">
                <li>The transcript text (first 6,000 chars)</li>
                <li>The firm categories vocabulary (30 items)</li>
                <li>The markets vocabulary (16 items)</li>
                <li>Your extraction instructions (below)</li>
              </ol>
              <p>
                The AI outputs structured opportunities with categories, skills, evidence,
                and a confidence score. Only opportunities with confidence &ge; 0.5 are kept.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-[var(--cos-border)] p-5">
            <h3 className="text-sm font-semibold text-[var(--cos-text-primary)] mb-2">
              Firm Categories (30)
            </h3>
            <div className="max-h-48 overflow-y-auto">
              <ul className="text-xs text-[var(--cos-text-secondary)] space-y-0.5">
                {FIRM_CATEGORIES.map((c) => (
                  <li key={c} className="truncate">&bull; {c}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-[var(--cos-border)] p-5">
            <h3 className="text-sm font-semibold text-[var(--cos-text-primary)] mb-2">
              Markets (16)
            </h3>
            <ul className="text-xs text-[var(--cos-text-secondary)] space-y-0.5">
              {MARKETS.map((m) => (
                <li key={m}>&bull; {m}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
