"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import remarkGfm from "remark-gfm";
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
  Hash,
  PanelLeftClose,
  PanelLeft,
  Clock,
  Type,
  Eye,
  Target,
  Lightbulb,
  CheckSquare,
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

function wordCount(text: string): string {
  const count = text.split(/\s+/).filter(Boolean).length;
  if (count < 1000) return `${count} words`;
  return `${(count / 1000).toFixed(1)}k words`;
}

function readingTime(text: string): string {
  const words = text.split(/\s+/).filter(Boolean).length;
  const mins = Math.max(1, Math.round(words / 200));
  return `${mins} min read`;
}

/** Category icon colors */
const CATEGORY_COLORS: Record<string, string> = {
  product: "text-blue-500",
  context: "text-emerald-500",
  sessions: "text-amber-500",
  "email-templates": "text-purple-500",
};

/** AI prompt suggestions */
const AI_SUGGESTIONS = [
  "Add Vision / Release Scope / Future Ideas sections",
  "Write the Release Scope checklist",
  "Update to reflect recent changes",
  "Make this more concise",
  "Add code examples",
];

/** Parse markdown into structured sections (Vision, Release Scope, Future Ideas, and rest) */
interface DocSection {
  type: "vision" | "release" | "future" | "content";
  title: string;
  content: string;
}

function parseDocSections(markdown: string): { sections: DocSection[]; hasStructure: boolean } {
  const lines = markdown.split("\n");
  const sections: DocSection[] = [];
  let currentType: DocSection["type"] = "content";
  let currentTitle = "";
  let currentLines: string[] = [];
  let hasStructure = false;

  const flush = () => {
    const content = currentLines.join("\n").trim();
    if (content || currentType !== "content") {
      sections.push({ type: currentType, title: currentTitle, content });
    }
    currentLines = [];
  };

  for (const line of lines) {
    const h2Match = line.match(/^##\s+(.+)$/);
    if (h2Match) {
      const heading = h2Match[1].trim().toLowerCase();
      if (heading === "vision" || heading.startsWith("vision")) {
        flush();
        currentType = "vision";
        currentTitle = h2Match[1].trim();
        hasStructure = true;
        continue;
      } else if (heading === "release scope" || heading.startsWith("release scope") || heading === "release checklist") {
        flush();
        currentType = "release";
        currentTitle = h2Match[1].trim();
        hasStructure = true;
        continue;
      } else if (heading === "future ideas" || heading.startsWith("future ideas") || heading === "future" || heading === "forward looking") {
        flush();
        currentType = "future";
        currentTitle = h2Match[1].trim();
        hasStructure = true;
        continue;
      } else {
        // Regular H2 — flush current and start new content section
        flush();
        currentType = "content";
        currentTitle = "";
      }
    }
    currentLines.push(line);
  }
  flush();

  return { sections, hasStructure };
}

const SECTION_STYLES: Record<string, { border: string; bg: string; icon: string; headerBg: string; headerText: string }> = {
  vision: { border: "border-blue-200", bg: "bg-blue-50/50", icon: "text-blue-500", headerBg: "bg-blue-100/60", headerText: "text-blue-800" },
  release: { border: "border-amber-200", bg: "bg-amber-50/50", icon: "text-amber-500", headerBg: "bg-amber-100/60", headerText: "text-amber-800" },
  future: { border: "border-slate-200", bg: "bg-slate-50/50", icon: "text-slate-400", headerBg: "bg-slate-100/60", headerText: "text-slate-600" },
};

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const totalFiles = useMemo(
    () => categories.reduce((s, c) => s + c.files.length, 0),
    [categories]
  );

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
  const handleAiEdit = async (instruction?: string) => {
    const text = instruction || aiInstruction.trim();
    if (!text || !selectedFile) return;
    setAiLoading(true);
    setAiInstruction(text);
    try {
      const res = await fetch("/api/admin/docs/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: text,
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
      <div
        className={`shrink-0 overflow-y-auto border-r border-[var(--cos-border)] bg-gradient-to-b from-white to-slate-50/80 transition-all duration-200 ${
          sidebarCollapsed ? "w-0 overflow-hidden" : "w-72"
        }`}
      >
        <div className="p-4">
          {/* Header */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--cos-primary)]/10">
                <BookOpen className="h-4 w-4 text-[var(--cos-primary)]" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-[var(--cos-text-primary)]">Docs</h2>
                <p className="text-[10px] text-[var(--cos-text-muted)]">{totalFiles} documents</p>
              </div>
            </div>
            <button
              onClick={() => setSidebarCollapsed(true)}
              className="rounded-md p-1 text-[var(--cos-text-muted)] hover:bg-slate-100 transition-colors"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--cos-text-muted)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search docs..."
              className="w-full pl-8 pr-3 py-2 rounded-lg border border-[var(--cos-border)] bg-white text-xs focus:outline-none focus:ring-2 focus:ring-[var(--cos-primary)]/30 focus:border-[var(--cos-primary)]/30"
            />
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-[var(--cos-text-muted)]">
              <Loader2 className="h-5 w-5 animate-spin mb-2" />
              <p className="text-xs">Loading docs...</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredCategories.map((cat) => {
                const colorClass = CATEGORY_COLORS[cat.key] ?? "text-slate-500";
                return (
                  <div key={cat.key}>
                    <button
                      onClick={() => toggleSection(cat.key)}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-[var(--cos-text-secondary)] hover:bg-white transition-colors"
                    >
                      {expandedSections.has(cat.key) ? (
                        <ChevronDown className="h-3.5 w-3.5 text-[var(--cos-text-muted)]" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-[var(--cos-text-muted)]" />
                      )}
                      <FolderOpen className={`h-3.5 w-3.5 ${colorClass}`} />
                      <span className="flex-1 text-left">{cat.name}</span>
                      <span className="rounded-full bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-medium text-[var(--cos-text-muted)]">
                        {cat.files.length}
                      </span>
                    </button>
                    {expandedSections.has(cat.key) && (
                      <div className="ml-4 space-y-0.5 border-l-2 border-slate-100 pl-2">
                        {cat.files.map((file) => {
                          const isActive = selectedFile === file.path;
                          return (
                            <button
                              key={file.path}
                              onClick={() => loadFile(file.path)}
                              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-all ${
                                isActive
                                  ? "bg-[var(--cos-primary)]/10 text-[var(--cos-primary)] font-medium shadow-sm"
                                  : "text-[var(--cos-text-secondary)] hover:bg-white hover:shadow-sm"
                              }`}
                            >
                              <FileText className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-[var(--cos-primary)]" : "text-slate-400"}`} />
                              <span className="truncate flex-1 text-left">{file.title}</span>
                              <span className="shrink-0 text-[10px] text-[var(--cos-text-muted)] opacity-60">
                                {formatSize(file.size)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ─── Content Area ─── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-white">
        {!selectedFile ? (
          /* ─── Empty State ─── */
          <div className="flex flex-col items-center justify-center h-full px-8">
            <div className="w-full max-w-md text-center">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--cos-primary)]/10 to-[var(--cos-primary)]/5">
                <BookOpen className="h-10 w-10 text-[var(--cos-primary)] opacity-60" />
              </div>
              <h2 className="text-lg font-semibold text-[var(--cos-text-primary)] mb-2">
                Documentation Hub
              </h2>
              <p className="text-sm text-[var(--cos-text-muted)] mb-6">
                Browse, search, and edit all platform documentation. Select a doc from the sidebar to get started.
              </p>
              <div className="grid grid-cols-2 gap-3 text-left">
                <div className="rounded-xl border border-[var(--cos-border)] bg-slate-50/50 p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Hash className="h-3.5 w-3.5 text-blue-500" />
                    <span className="text-xs font-semibold text-[var(--cos-text-primary)]">Product Docs</span>
                  </div>
                  <p className="text-[10px] text-[var(--cos-text-muted)]">Architecture, vision, brand guidelines, and feature specs</p>
                </div>
                <div className="rounded-xl border border-[var(--cos-border)] bg-slate-50/50 p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Hash className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-xs font-semibold text-[var(--cos-text-primary)]">Context Files</span>
                  </div>
                  <p className="text-[10px] text-[var(--cos-text-muted)]">Database schema, API reference, AI system, and roadmap</p>
                </div>
              </div>
              {sidebarCollapsed && (
                <button
                  onClick={() => setSidebarCollapsed(false)}
                  className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--cos-primary)] hover:underline"
                >
                  <PanelLeft className="h-3.5 w-3.5" />
                  Show sidebar
                </button>
              )}
            </div>
          </div>
        ) : fileLoading ? (
          <div className="flex items-center justify-center h-full text-[var(--cos-text-muted)]">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading document...
          </div>
        ) : editing ? (
          /* ─── Edit Mode ─── */
          <div className="flex flex-col h-full">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--cos-border)] bg-gradient-to-r from-white to-slate-50/50 shrink-0">
              <div className="flex items-center gap-3">
                {sidebarCollapsed && (
                  <button
                    onClick={() => setSidebarCollapsed(false)}
                    className="rounded-md p-1.5 text-[var(--cos-text-muted)] hover:bg-slate-100"
                  >
                    <PanelLeft className="h-4 w-4" />
                  </button>
                )}
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-100">
                  <Pencil className="h-3.5 w-3.5 text-amber-600" />
                </div>
                <div>
                  <span className="text-sm font-semibold text-[var(--cos-text-primary)]">
                    {fileTitle}
                  </span>
                  <span className="ml-2 text-[10px] text-[var(--cos-text-muted)]">
                    {wordCount(editContent)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setEditing(false); setAiResult(null); }}
                  className="h-8"
                >
                  <X className="h-3.5 w-3.5 mr-1" />
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving} className="h-8">
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
              <div className="w-1/2 border-r border-[var(--cos-border)] flex flex-col">
                <div className="px-4 py-1.5 border-b border-slate-100 bg-slate-50/50">
                  <span className="text-[10px] font-medium text-[var(--cos-text-muted)] uppercase tracking-wider">Markdown</span>
                </div>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full flex-1 p-4 text-[13px] font-mono leading-relaxed resize-none focus:outline-none bg-slate-50/30 text-[var(--cos-text-secondary)]"
                  spellCheck={false}
                />
              </div>
              {/* Preview */}
              <div className="w-1/2 flex flex-col">
                <div className="px-4 py-1.5 border-b border-slate-100 bg-slate-50/50">
                  <span className="text-[10px] font-medium text-[var(--cos-text-muted)] uppercase tracking-wider">Preview</span>
                </div>
                <div className="flex-1 overflow-y-auto p-6">
                  <article className="prose prose-sm max-w-none prose-headings:text-[var(--cos-text-primary)] prose-headings:font-semibold prose-p:text-[var(--cos-text-secondary)] prose-p:leading-relaxed prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-[13px] prose-code:font-medium prose-code:text-pink-600 prose-pre:bg-[#1e1e2e] prose-pre:rounded-xl prose-pre:shadow-lg prose-table:text-sm prose-th:bg-slate-50 prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-2 prose-tr:border-b prose-tr:border-slate-100 prose-blockquote:border-l-[var(--cos-primary)] prose-blockquote:bg-[var(--cos-primary)]/5 prose-blockquote:py-1 prose-blockquote:rounded-r-lg prose-a:text-[var(--cos-primary)] prose-a:no-underline hover:prose-a:underline prose-img:rounded-xl prose-hr:border-slate-200">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{editContent}</ReactMarkdown>
                  </article>
                </div>
              </div>
            </div>

            {/* AI Result Banner */}
            {aiResult && (
              <div className="shrink-0 border-t-2 border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 px-5 py-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    AI suggested changes
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setAiResult(null)}
                      className="h-7 text-xs border-amber-200 text-amber-700 hover:bg-amber-100"
                    >
                      Discard
                    </Button>
                    <Button
                      size="sm"
                      onClick={applyAiResult}
                      className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white"
                    >
                      Apply Changes
                    </Button>
                  </div>
                </div>
                <pre className="text-[11px] text-amber-900/70 max-h-24 overflow-y-auto font-mono whitespace-pre-wrap rounded-lg bg-amber-100/50 p-2">
                  {aiResult.slice(0, 500)}
                  {aiResult.length > 500 && "..."}
                </pre>
              </div>
            )}

            {/* AI Assistant Bar */}
            <div className="shrink-0 border-t border-[var(--cos-border)] bg-gradient-to-r from-white to-[var(--cos-primary)]/[0.02] px-5 py-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--cos-primary)]/10 shrink-0">
                  <Sparkles className="h-4 w-4 text-[var(--cos-primary)]" />
                </div>
                <input
                  type="text"
                  value={aiInstruction}
                  onChange={(e) => setAiInstruction(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && aiInstruction.trim() && !aiLoading) {
                      handleAiEdit();
                    }
                  }}
                  placeholder="Tell AI how to edit this doc..."
                  className="flex-1 rounded-lg border border-[var(--cos-border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cos-primary)]/30"
                  disabled={aiLoading}
                />
                <Button
                  size="sm"
                  onClick={() => handleAiEdit()}
                  disabled={aiLoading || !aiInstruction.trim()}
                  className="h-9"
                >
                  {aiLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5 mr-1" />
                      Ask AI
                    </>
                  )}
                </Button>
              </div>
              {/* Suggestion chips */}
              {!aiLoading && (
                <div className="flex items-center gap-1.5 mt-2 ml-10">
                  {AI_SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleAiEdit(s)}
                      className="rounded-full border border-[var(--cos-border)] bg-white px-2.5 py-1 text-[10px] text-[var(--cos-text-muted)] hover:border-[var(--cos-primary)]/30 hover:text-[var(--cos-primary)] transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ─── Viewer Mode ─── */
          <div className="flex flex-col h-full">
            {/* Doc header */}
            <div className="shrink-0 border-b border-[var(--cos-border)] bg-gradient-to-r from-white to-slate-50/50 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {sidebarCollapsed && (
                    <button
                      onClick={() => setSidebarCollapsed(false)}
                      className="rounded-md p-1.5 text-[var(--cos-text-muted)] hover:bg-slate-100 mr-1"
                    >
                      <PanelLeft className="h-4 w-4" />
                    </button>
                  )}
                  <div>
                    <h1 className="text-lg font-bold text-[var(--cos-text-primary)]">
                      {fileTitle}
                    </h1>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="flex items-center gap-1 text-[11px] text-[var(--cos-text-muted)]">
                        <FileText className="h-3 w-3" />
                        {selectedFile}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] text-[var(--cos-text-muted)]">
                        <Type className="h-3 w-3" />
                        {wordCount(fileContent)}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] text-[var(--cos-text-muted)]">
                        <Clock className="h-3 w-3" />
                        {readingTime(fileContent)}
                      </span>
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditContent(fileContent);
                    setEditing(true);
                  }}
                  className="h-9"
                >
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Edit
                </Button>
              </div>
            </div>

            {/* Markdown content — section-aware renderer */}
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-4xl mx-auto px-8 py-8">
                {(() => {
                  const { sections, hasStructure } = parseDocSections(fileContent);
                  const proseClasses = "prose prose-sm max-w-none prose-headings:text-[var(--cos-text-primary)] prose-headings:font-semibold prose-h1:text-2xl prose-h1:border-b prose-h1:border-slate-200 prose-h1:pb-3 prose-h2:text-xl prose-h2:mt-8 prose-h3:text-base prose-p:text-[var(--cos-text-secondary)] prose-p:leading-relaxed prose-li:text-[var(--cos-text-secondary)] prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-[13px] prose-code:font-medium prose-code:text-pink-600 prose-code:before:content-none prose-code:after:content-none prose-pre:bg-[#1e1e2e] prose-pre:rounded-xl prose-pre:shadow-lg prose-pre:border prose-pre:border-slate-700 prose-table:text-sm prose-table:border prose-table:border-slate-200 prose-table:rounded-lg prose-table:overflow-hidden prose-th:bg-slate-50 prose-th:px-4 prose-th:py-2.5 prose-th:text-left prose-th:font-semibold prose-th:text-[var(--cos-text-primary)] prose-td:px-4 prose-td:py-2 prose-tr:border-b prose-tr:border-slate-100 prose-blockquote:border-l-4 prose-blockquote:border-l-[var(--cos-primary)] prose-blockquote:bg-[var(--cos-primary)]/5 prose-blockquote:py-1 prose-blockquote:px-4 prose-blockquote:rounded-r-lg prose-blockquote:not-italic prose-a:text-[var(--cos-primary)] prose-a:font-medium prose-a:no-underline hover:prose-a:underline prose-strong:text-[var(--cos-text-primary)] prose-hr:border-slate-200 prose-hr:my-8 prose-img:rounded-xl";

                  if (!hasStructure) {
                    return (
                      <article className={proseClasses}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{fileContent}</ReactMarkdown>
                      </article>
                    );
                  }

                  const sectionIcon = (type: string) => {
                    if (type === "vision") return <Eye className="h-4 w-4" />;
                    if (type === "release") return <Target className="h-4 w-4" />;
                    if (type === "future") return <Lightbulb className="h-4 w-4" />;
                    return null;
                  };

                  return (
                    <div className="space-y-6">
                      {sections.map((section, i) => {
                        if (section.type === "content") {
                          return (
                            <article key={i} className={proseClasses}>
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{section.content}</ReactMarkdown>
                            </article>
                          );
                        }

                        const style = SECTION_STYLES[section.type];
                        return (
                          <div key={i} className={`rounded-xl border-2 ${style.border} ${style.bg} overflow-hidden`}>
                            <div className={`flex items-center gap-2.5 px-5 py-3 ${style.headerBg}`}>
                              <span className={style.icon}>{sectionIcon(section.type)}</span>
                              <h2 className={`text-sm font-bold ${style.headerText}`}>{section.title}</h2>
                              {section.type === "release" && (() => {
                                const total = (section.content.match(/- \[[ x]\]/g) || []).length;
                                const checked = (section.content.match(/- \[x\]/g) || []).length;
                                if (total === 0) return null;
                                return (
                                  <span className="ml-auto flex items-center gap-1.5 text-[11px] font-semibold text-amber-700">
                                    <CheckSquare className="h-3.5 w-3.5" />
                                    {checked}/{total} done
                                  </span>
                                );
                              })()}
                            </div>
                            <div className="px-5 py-4">
                              <article className={`${proseClasses} prose-h3:text-sm prose-h3:mt-4`}>
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{section.content}</ReactMarkdown>
                              </article>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
