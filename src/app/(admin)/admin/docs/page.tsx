"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Search,
  Pencil,
  X,
  Save,
  Loader2,
  Sparkles,
  FileText,
  FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// Dynamic import react-markdown to avoid SSR issues
const ReactMarkdown = dynamic(() => import("react-markdown"), { ssr: false });

interface DocFile {
  path: string;
  title: string;
  name: string;
  size: number;
}

interface DocCategory {
  name: string;
  key: string;
  files: DocFile[];
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  const kb = bytes / 1024;
  return kb < 100 ? `${kb.toFixed(1)}KB` : `${Math.round(kb)}KB`;
}

export default function AdminDocsPage() {
  const [categories, setCategories] = useState<DocCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [fileTitle, setFileTitle] = useState("");
  const [fileLoading, setFileLoading] = useState(false);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);

  // AI assistant
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);

  // Sidebar
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["product", "context"]));
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch file list
  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/docs");
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories ?? []);
      }
    } catch (err) {
      console.error("Failed to fetch docs:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  // Load a file
  const loadFile = useCallback(async (filePath: string) => {
    setFileLoading(true);
    setEditing(false);
    setAiResult(null);
    try {
      const res = await fetch(`/api/admin/docs?file=${encodeURIComponent(filePath)}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedFile(filePath);
        setFileContent(data.content);
        setFileTitle(data.title);
      }
    } catch (err) {
      console.error("Failed to load file:", err);
    } finally {
      setFileLoading(false);
    }
  }, []);

  // Save edited file
  const handleSave = async () => {
    if (!selectedFile) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/docs?file=${encodeURIComponent(selectedFile)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent }),
      });
      if (res.ok) {
        setFileContent(editContent);
        setEditing(false);
        setAiResult(null);
      } else {
        const err = await res.json();
        alert(`Save failed: ${err.error}`);
      }
    } catch {
      alert("Save failed");
    } finally {
      setSaving(false);
    }
  };

  // AI editing
  const handleAiEdit = async () => {
    if (!aiInstruction.trim() || !selectedFile) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/admin/docs/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: aiInstruction.trim(),
          currentContent: editContent || fileContent,
          filePath: selectedFile,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiResult(data.updatedContent);
      } else {
        const err = await res.json();
        alert(`AI edit failed: ${err.error}`);
      }
    } catch {
      alert("AI edit failed");
    } finally {
      setAiLoading(false);
      setAiInstruction("");
    }
  };

  const applyAiResult = () => {
    if (aiResult) {
      setEditContent(aiResult);
      setAiResult(null);
    }
  };

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Filter files by search
  const filteredCategories = categories
    .map((cat) => ({
      ...cat,
      files: cat.files.filter(
        (f) =>
          !searchQuery ||
          f.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          f.name.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    }))
    .filter((cat) => cat.files.length > 0);

  return (
    <div className="flex h-[calc(100vh-4rem)] -mx-8 -my-8">
      {/* ─── Sidebar: File Tree ─── */}
      <div className="w-64 shrink-0 overflow-y-auto border-r border-[var(--cos-border)] bg-white p-3">
        <div className="mb-3 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-[var(--cos-primary)]" />
          <h2 className="text-sm font-semibold text-[var(--cos-text-primary)]">Documentation</h2>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--cos-text-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter docs..."
            className="w-full pl-7 pr-2 py-1.5 rounded-md border border-[var(--cos-border)] text-xs focus:outline-none focus:ring-2 focus:ring-[var(--cos-primary)]/30"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-xs text-[var(--cos-text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
            Loading...
          </div>
        ) : (
          <div className="space-y-1">
            {filteredCategories.map((cat) => (
              <div key={cat.key}>
                <button
                  onClick={() => toggleSection(cat.key)}
                  className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold text-[var(--cos-text-muted)] uppercase tracking-wider hover:bg-slate-50"
                >
                  {expandedSections.has(cat.key) ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  <FolderOpen className="h-3 w-3" />
                  {cat.name} ({cat.files.length})
                </button>
                {expandedSections.has(cat.key) && (
                  <div className="ml-3 space-y-0.5">
                    {cat.files.map((file) => (
                      <button
                        key={file.path}
                        onClick={() => loadFile(file.path)}
                        className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors ${
                          selectedFile === file.path
                            ? "bg-[var(--cos-primary)]/10 text-[var(--cos-primary)] font-medium"
                            : "text-[var(--cos-text-secondary)] hover:bg-slate-50"
                        }`}
                      >
                        <FileText className="h-3 w-3 shrink-0" />
                        <span className="truncate flex-1 text-left">{file.title}</span>
                        <span className="shrink-0 text-[10px] text-[var(--cos-text-muted)]">
                          {formatSize(file.size)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Content Area ─── */}
      <div className="flex-1 overflow-y-auto">
        {!selectedFile ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--cos-text-muted)]">
            <BookOpen className="h-12 w-12 opacity-20 mb-4" />
            <p className="text-sm">Select a document from the sidebar</p>
            <p className="text-xs mt-1 opacity-60">
              {categories.reduce((s, c) => s + c.files.length, 0)} docs available
            </p>
          </div>
        ) : fileLoading ? (
          <div className="flex items-center justify-center h-full text-[var(--cos-text-muted)]">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading...
          </div>
        ) : editing ? (
          /* ─── Edit Mode ─── */
          <div className="flex flex-col h-full">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--cos-border)] bg-white shrink-0">
              <div className="flex items-center gap-2">
                <Pencil className="h-4 w-4 text-[var(--cos-primary)]" />
                <span className="text-sm font-medium text-[var(--cos-text-primary)]">
                  Editing: {fileTitle}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditing(false);
                    setAiResult(null);
                  }}
                >
                  <X className="h-3.5 w-3.5 mr-1" />
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  ) : (
                    <Save className="h-3.5 w-3.5 mr-1" />
                  )}
                  {saving ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>

            {/* Split view: Editor + Preview */}
            <div className="flex flex-1 min-h-0">
              {/* Editor */}
              <div className="w-1/2 border-r border-[var(--cos-border)]">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full h-full p-4 text-sm font-mono resize-none focus:outline-none bg-slate-50"
                  spellCheck={false}
                />
              </div>
              {/* Preview */}
              <div className="w-1/2 overflow-y-auto p-6">
                <article className="prose prose-sm max-w-none prose-headings:text-[var(--cos-text-primary)] prose-p:text-[var(--cos-text-secondary)] prose-code:bg-slate-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-slate-900">
                  <ReactMarkdown>{editContent}</ReactMarkdown>
                </article>
              </div>
            </div>

            {/* AI Result Banner */}
            {aiResult && (
              <div className="shrink-0 border-t border-amber-200 bg-amber-50 px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-amber-700 flex items-center gap-1">
                    <Sparkles className="h-3.5 w-3.5" />
                    AI suggested changes
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setAiResult(null)}
                      className="h-7 text-xs"
                    >
                      Discard
                    </Button>
                    <Button
                      size="sm"
                      onClick={applyAiResult}
                      className="h-7 text-xs bg-amber-600 hover:bg-amber-700"
                    >
                      Apply Changes
                    </Button>
                  </div>
                </div>
                <pre className="text-xs text-amber-800 max-h-32 overflow-y-auto font-mono whitespace-pre-wrap">
                  {aiResult.slice(0, 500)}
                  {aiResult.length > 500 && "..."}
                </pre>
              </div>
            )}

            {/* AI Assistant Bar */}
            <div className="shrink-0 border-t border-[var(--cos-border)] bg-white px-4 py-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[var(--cos-primary)] shrink-0" />
                <input
                  type="text"
                  value={aiInstruction}
                  onChange={(e) => setAiInstruction(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && aiInstruction.trim() && !aiLoading) {
                      handleAiEdit();
                    }
                  }}
                  placeholder="Ask AI to edit this doc... (e.g. &quot;Add a section about the sandbox feature&quot;)"
                  className="flex-1 rounded-lg border border-[var(--cos-border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cos-primary)]/30"
                  disabled={aiLoading}
                />
                <Button
                  size="sm"
                  onClick={handleAiEdit}
                  disabled={aiLoading || !aiInstruction.trim()}
                >
                  {aiLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Ask AI"
                  )}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          /* ─── Viewer Mode ─── */
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-lg font-semibold text-[var(--cos-text-primary)]">
                  {fileTitle}
                </h1>
                <p className="text-xs text-[var(--cos-text-muted)] font-mono mt-0.5">
                  {selectedFile}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditContent(fileContent);
                  setEditing(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Edit
              </Button>
            </div>
            <article className="prose prose-sm max-w-none prose-headings:text-[var(--cos-text-primary)] prose-p:text-[var(--cos-text-secondary)] prose-code:bg-slate-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-slate-900 prose-table:text-sm">
              <ReactMarkdown>{fileContent}</ReactMarkdown>
            </article>
          </div>
        )}
      </div>
    </div>
  );
}
