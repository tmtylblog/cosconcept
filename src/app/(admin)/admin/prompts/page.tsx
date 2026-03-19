"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FileCode2,
  ChevronDown,
  ChevronRight,
  Save,
  RotateCcw,
  CheckCircle,
  AlertCircle,
  Loader2,
  Cpu,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface PromptData {
  key: string;
  title: string;
  description: string;
  model: string;
  sourceFile: string;
  currentText: string;
  defaultText: string;
  isCustom: boolean;
}

export default function KeyPromptsPage() {
  const [prompts, setPrompts] = useState<PromptData[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [flash, setFlash] = useState<{
    key: string;
    type: "success" | "error";
    message: string;
  } | null>(null);

  const fetchPrompts = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/prompts");
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setPrompts(data.prompts ?? []);
    } catch (err) {
      console.error("Failed to fetch prompts:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrompts();
  }, [fetchPrompts]);

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleSave = async (key: string) => {
    const text = edits[key];
    if (!text || text.trim().length < 20) {
      setFlash({ key, type: "error", message: "Prompt must be at least 20 characters" });
      return;
    }

    setSaving(key);
    setFlash(null);
    try {
      const res = await fetch("/api/admin/prompts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, text }),
      });
      if (res.ok) {
        setFlash({ key, type: "success", message: "Saved" });
        setPrompts((prev) =>
          prev.map((p) =>
            p.key === key ? { ...p, currentText: text, isCustom: true } : p
          )
        );
        setEdits((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      } else {
        const err = await res.json();
        setFlash({ key, type: "error", message: err.error || "Save failed" });
      }
    } catch {
      setFlash({ key, type: "error", message: "Network error" });
    } finally {
      setSaving(null);
    }
  };

  const handleReset = async (key: string) => {
    setSaving(key);
    setFlash(null);
    try {
      const res = await fetch("/api/admin/prompts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, text: null }),
      });
      if (res.ok) {
        const prompt = prompts.find((p) => p.key === key);
        setFlash({ key, type: "success", message: "Reset to default" });
        setPrompts((prev) =>
          prev.map((p) =>
            p.key === key
              ? { ...p, currentText: p.defaultText, isCustom: false }
              : p
          )
        );
        setEdits((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      } else {
        const err = await res.json();
        setFlash({ key, type: "error", message: err.error || "Reset failed" });
      }
    } catch {
      setFlash({ key, type: "error", message: "Network error" });
    } finally {
      setSaving(null);
    }
  };

  const getEditText = (prompt: PromptData): string => {
    return edits[prompt.key] ?? prompt.currentText;
  };

  const hasUnsavedChanges = (prompt: PromptData): boolean => {
    return edits[prompt.key] !== undefined && edits[prompt.key] !== prompt.currentText;
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <FileCode2 className="h-5 w-5 text-[var(--cos-primary)]" />
          <h1 className="text-xl font-semibold text-[var(--cos-text-primary)]">
            Key Prompts
          </h1>
        </div>
        <p className="text-sm text-[var(--cos-text-muted)]">
          All major AI prompts that drive the platform. View, edit, and override
          any prompt &mdash; changes take effect immediately on the next AI call.
        </p>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4 mb-6 text-sm">
        <span className="text-[var(--cos-text-muted)]">
          {prompts.length} prompts registered
        </span>
        <span className="text-[var(--cos-text-muted)]">&bull;</span>
        <span className="text-[var(--cos-text-muted)]">
          {prompts.filter((p) => p.isCustom).length} custom overrides active
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-[var(--cos-text-muted)]">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Loading prompts...
        </div>
      ) : (
        <div className="space-y-3">
          {prompts.map((prompt) => {
            const isExpanded = expanded.has(prompt.key);
            const isSaving = saving === prompt.key;
            const promptFlash =
              flash?.key === prompt.key ? flash : null;
            const isReadOnly = prompt.key === "ossy_system";
            const unsaved = hasUnsavedChanges(prompt);

            return (
              <div
                key={prompt.key}
                className="bg-white rounded-xl border border-[var(--cos-border)] overflow-hidden"
              >
                {/* Header row */}
                <button
                  onClick={() => toggleExpand(prompt.key)}
                  className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-50/50 transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-[var(--cos-text-muted)] shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-[var(--cos-text-muted)] shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-[var(--cos-text-primary)]">
                        {prompt.title}
                      </h3>
                      {prompt.isCustom && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">
                          Custom
                        </span>
                      )}
                      {unsaved && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700">
                          Unsaved
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--cos-text-muted)] mt-0.5 line-clamp-1">
                      {prompt.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-[10px] font-medium text-slate-600">
                      <Cpu className="h-2.5 w-2.5" />
                      {prompt.model}
                    </span>
                  </div>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-[var(--cos-border)] px-5 py-4 space-y-3">
                    {/* Metadata */}
                    <div className="flex items-center gap-4 text-xs text-[var(--cos-text-muted)]">
                      <span className="font-mono">{prompt.sourceFile}</span>
                      <span>&bull;</span>
                      <span>
                        {getEditText(prompt).length.toLocaleString()} chars
                      </span>
                    </div>

                    {/* Flash message */}
                    {promptFlash && (
                      <div
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
                          promptFlash.type === "success"
                            ? "bg-green-50 text-green-700 border border-green-200"
                            : "bg-red-50 text-red-700 border border-red-200"
                        }`}
                      >
                        {promptFlash.type === "success" ? (
                          <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        )}
                        {promptFlash.message}
                      </div>
                    )}

                    {/* Prompt editor */}
                    {isReadOnly ? (
                      <div className="rounded-lg border border-[var(--cos-border)] bg-slate-50 p-4">
                        <p className="text-xs text-[var(--cos-text-muted)] mb-2">
                          This prompt is too large and complex for inline editing.
                          Edit it directly in the source file:
                        </p>
                        <code className="text-xs font-mono text-[var(--cos-primary)]">
                          {prompt.sourceFile}
                        </code>
                      </div>
                    ) : (
                      <>
                        <textarea
                          value={getEditText(prompt)}
                          onChange={(e) =>
                            setEdits((prev) => ({
                              ...prev,
                              [prompt.key]: e.target.value,
                            }))
                          }
                          rows={16}
                          className="w-full rounded-lg border border-[var(--cos-border)] px-4 py-3 text-xs font-mono text-[var(--cos-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--cos-primary)]/30 resize-y leading-relaxed"
                        />

                        {/* Actions */}
                        <div className="flex items-center justify-end gap-2">
                          {prompt.isCustom && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleReset(prompt.key)}
                              disabled={isSaving}
                            >
                              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                              Reset to Default
                            </Button>
                          )}
                          <Button
                            size="sm"
                            onClick={() => handleSave(prompt.key)}
                            disabled={isSaving || !unsaved}
                          >
                            {isSaving ? (
                              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                            ) : (
                              <Save className="h-3.5 w-3.5 mr-1.5" />
                            )}
                            {isSaving ? "Saving..." : "Save"}
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
