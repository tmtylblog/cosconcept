"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  Loader2,
  Plus,
  Trash2,
  GripVertical,
  Save,
  AlertCircle,
  X,
  Link2,
  Copy,
  Check,
  ExternalLink,
  AlertTriangle,
  RefreshCw,
  Share2,
  Linkedin,
  Bot,
  Pencil,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────
interface Stage {
  id: string;
  label: string;
  displayOrder: number;
  color: string;
  isClosedWon: boolean;
  isClosedLost: boolean;
  hubspotStageId: string | null;
  parentStageId: string | null;
}

interface DealSource {
  id: string;
  key: string;
  label: string;
  color: string;
  icon: string;
  isSystem: boolean;
  displayOrder: number;
}

interface Account {
  id: string;
  unipileAccountId: string;
  displayName: string;
  linkedinUsername: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
}

interface SyncProgress {
  seeded: number;
  enriched?: number;
  pages: number;
  phase: "fetching" | "enriching" | "complete" | "error";
  error?: string;
}

const TABS = [
  { key: "pipeline", label: "Pipeline", icon: <Share2 className="h-3.5 w-3.5" /> },
  { key: "linkedin", label: "LinkedIn Accounts", icon: <Linkedin className="h-3.5 w-3.5" /> },
  { key: "reply-ai", label: "Reply AI", icon: <Bot className="h-3.5 w-3.5" /> },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const STATUS_STYLE: Record<string, { bg: string; text: string; dot: string }> = {
  OK:          { bg: "bg-emerald-50",  text: "text-emerald-700",  dot: "bg-emerald-500" },
  CONNECTING:  { bg: "bg-amber-50",    text: "text-amber-700",    dot: "bg-amber-500" },
  CREDENTIALS: { bg: "bg-red-50",      text: "text-red-700",      dot: "bg-red-500" },
  ERROR:       { bg: "bg-red-50",      text: "text-red-700",      dot: "bg-red-500" },
};

function AccountNotes({ accountId, initialNotes }: { accountId: string; initialNotes: string }) {
  const [notes, setNotes] = useState(initialNotes);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  function handleChange(value: string) {
    setNotes(value);
    setDirty(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => saveNotes(value), 1000);
  }

  async function saveNotes(value: string) {
    setSaving(true);
    try {
      await fetch("/api/admin/growth-ops/linkedin-accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: accountId, notes: value }),
      });
      setDirty(false);
    } catch { /* silent */ }
    finally { setSaving(false); }
  }

  return (
    <div className="flex items-start gap-2">
      <input
        type="text"
        value={notes}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Add notes about this account..."
        className="flex-1 rounded-cos-md border border-cos-border/50 bg-cos-cloud/30 px-2.5 py-1 text-xs text-cos-slate placeholder:text-cos-slate-dim/50 focus:border-cos-electric focus:outline-none focus:bg-white transition-colors"
      />
      {saving && <span className="text-[10px] text-cos-slate-dim mt-1">Saving...</span>}
      {!saving && dirty && <span className="text-[10px] text-cos-slate-dim mt-1">Unsaved</span>}
    </div>
  );
}

const STAGE_COLORS = ["#6366f1", "#8b5cf6", "#3b82f6", "#06b6d4", "#10b981", "#22c55e", "#f59e0b", "#ef4444", "#ec4899", "#64748b"];
const ICON_OPTIONS = ["globe", "mail", "linkedin", "plus-circle", "phone", "zap", "users", "star", "target", "megaphone"];

export default function GrowthOpsSettingsPage() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as TabKey) || "pipeline";
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function flash(msg: string) {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold text-cos-midnight">Growth Ops Settings</h1>
        <p className="text-sm text-cos-slate mt-1">Configure pipeline stages, deal sources, and connected accounts.</p>
      </div>

      {error && (
        <div className="mb-4 rounded-cos-lg bg-red-50 border border-red-200 px-4 py-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 flex-1">{error}</p>
          <button onClick={() => setError(null)}><X className="h-4 w-4 text-red-400" /></button>
        </div>
      )}

      {success && (
        <div className="mb-4 rounded-cos-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-cos-border">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.key
                ? "border-cos-electric text-cos-electric"
                : "border-transparent text-cos-slate hover:text-cos-midnight"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "pipeline" && (
        <PipelineSettings error={error} setError={setError} flash={flash} />
      )}
      {activeTab === "linkedin" && (
        <LinkedInAccountsSettings setError={setError} />
      )}
      {activeTab === "reply-ai" && (
        <ReplyKnowledgeBaseSettings setError={setError} flash={flash} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Pipeline Settings Tab
// ═══════════════════════════════════════════════════════════════
function PipelineSettings({
  error: _error,
  setError,
  flash,
}: {
  error: string | null;
  setError: (e: string | null) => void;
  flash: (msg: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Stages
  const [stages, setStages] = useState<Stage[]>([]);
  const [editingStage, setEditingStage] = useState<Stage | null>(null);
  const [newStage, setNewStage] = useState(false);
  const [stageForm, setStageForm] = useState({ label: "", color: "#6366f1", isClosedWon: false, isClosedLost: false, parentStageId: null as string | null });

  // Sources
  const [sources, setSources] = useState<DealSource[]>([]);
  const [editingSource, setEditingSource] = useState<DealSource | null>(null);
  const [newSource, setNewSource] = useState(false);
  const [sourceForm, setSourceForm] = useState({ key: "", label: "", color: "#6366f1", icon: "globe" });

  async function loadData() {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/growth-ops/pipeline/settings");
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setStages(data.stages ?? []);
      setSources(data.sources ?? []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Stage actions ─────────────────────────────────────
  async function saveStage() {
    setSaving(true);
    try {
      if (editingStage) {
        await fetch("/api/admin/growth-ops/pipeline/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "updateStage", stageId: editingStage.id, label: stageForm.label, color: stageForm.color, isClosedWon: stageForm.isClosedWon, isClosedLost: stageForm.isClosedLost, parentStageId: stageForm.parentStageId }),
        });
        flash("Stage updated");
      } else {
        // For substages, get max order within the parent; for parent stages, among other parents
        const relevantStages = stageForm.parentStageId
          ? stages.filter((s) => s.parentStageId === stageForm.parentStageId)
          : stages.filter((s) => !s.parentStageId);
        const maxOrder = relevantStages.reduce((m, s) => Math.max(m, s.displayOrder), -1);
        await fetch("/api/admin/growth-ops/pipeline/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "createStage", label: stageForm.label, color: stageForm.color, displayOrder: maxOrder + 1, isClosedWon: stageForm.isClosedWon, isClosedLost: stageForm.isClosedLost, parentStageId: stageForm.parentStageId }),
        });
        flash(stageForm.parentStageId ? "Substage created" : "Stage created");
      }
      setEditingStage(null);
      setNewStage(false);
      setStageForm({ label: "", color: "#6366f1", isClosedWon: false, isClosedLost: false, parentStageId: null });
      await loadData();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function deleteStage(stageId: string) {
    if (!confirm("Delete this stage? Deals in this stage will become unassigned.")) return;
    try {
      await fetch("/api/admin/growth-ops/pipeline/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "deleteStage", stageId }) });
      flash("Stage deleted");
      await loadData();
    } catch (e) { setError(String(e)); }
  }

  async function moveStage(stageId: string, direction: "up" | "down") {
    const idx = stages.findIndex((s) => s.id === stageId);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= stages.length) return;
    const newOrder = stages.map((s, i) => {
      if (i === idx) return { id: s.id, displayOrder: stages[swapIdx].displayOrder };
      if (i === swapIdx) return { id: s.id, displayOrder: stages[idx].displayOrder };
      return { id: s.id, displayOrder: s.displayOrder };
    });
    try {
      await fetch("/api/admin/growth-ops/pipeline/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reorderStages", order: newOrder }) });
      await loadData();
    } catch (e) { setError(String(e)); }
  }

  function startEditStage(stage: Stage) {
    setEditingStage(stage);
    setNewStage(false);
    setStageForm({ label: stage.label, color: stage.color, isClosedWon: stage.isClosedWon, isClosedLost: stage.isClosedLost, parentStageId: stage.parentStageId });
  }

  function startNewStage(parentStageId?: string) {
    setNewStage(true);
    setEditingStage(null);
    if (parentStageId) {
      const parent = stages.find((s) => s.id === parentStageId);
      setStageForm({ label: "", color: parent?.color ?? "#6366f1", isClosedWon: false, isClosedLost: parent?.isClosedLost ?? false, parentStageId });
    } else {
      setStageForm({ label: "", color: "#6366f1", isClosedWon: false, isClosedLost: false, parentStageId: null });
    }
  }

  // ── Source actions ────────────────────────────────────
  async function saveSource() {
    setSaving(true);
    try {
      if (editingSource) {
        await fetch("/api/admin/growth-ops/pipeline/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "updateSource", sourceId: editingSource.id, label: sourceForm.label, color: sourceForm.color, icon: sourceForm.icon }) });
        flash("Source updated");
      } else {
        const maxOrder = sources.reduce((m, s) => Math.max(m, s.displayOrder), -1);
        await fetch("/api/admin/growth-ops/pipeline/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "createSource", key: sourceForm.key, label: sourceForm.label, color: sourceForm.color, icon: sourceForm.icon, displayOrder: maxOrder + 1 }) });
        flash("Source created");
      }
      setEditingSource(null);
      setNewSource(false);
      setSourceForm({ key: "", label: "", color: "#6366f1", icon: "globe" });
      await loadData();
    } catch (e) { setError(String(e)); } finally { setSaving(false); }
  }

  async function deleteSource(sourceId: string) {
    if (!confirm("Delete this deal source?")) return;
    try {
      const res = await fetch("/api/admin/growth-ops/pipeline/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "deleteSource", sourceId }) });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      flash("Source deleted");
      await loadData();
    } catch (e) { setError(String(e)); }
  }

  function startEditSource(source: DealSource) {
    setEditingSource(source);
    setNewSource(false);
    setSourceForm({ key: source.key, label: source.label, color: source.color, icon: source.icon });
  }

  function startNewSource() {
    setNewSource(true);
    setEditingSource(null);
    setSourceForm({ key: "", label: "", color: "#6366f1", icon: "globe" });
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-cos-electric" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Pipeline Stages ──────────────────────────────── */}
      <div className="rounded-cos-xl border border-cos-border bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-cos-midnight">Pipeline Stages</h2>
          <button onClick={() => startNewStage()} className="flex items-center gap-1.5 rounded-cos-lg bg-cos-electric px-3 py-1.5 text-xs font-medium text-white hover:bg-cos-electric-hover transition-colors">
            <Plus className="h-3 w-3" /> Add Stage
          </button>
        </div>

        <div className="space-y-2">
          {stages.filter((s) => !s.parentStageId).map((stage, idx, parentArr) => {
            const substages = stages.filter((s) => s.parentStageId === stage.id).sort((a, b) => a.displayOrder - b.displayOrder);
            return (
              <div key={stage.id}>
                <div className="flex items-center gap-3 rounded-cos-lg border border-cos-border p-3 hover:bg-cos-cloud/30 transition-colors">
                  <div className="flex flex-col gap-0.5">
                    <button onClick={() => moveStage(stage.id, "up")} disabled={idx === 0} className="text-cos-slate-dim hover:text-cos-midnight disabled:opacity-20 text-[10px]">&uarr;</button>
                    <GripVertical className="h-3.5 w-3.5 text-cos-slate-dim" />
                    <button onClick={() => moveStage(stage.id, "down")} disabled={idx === parentArr.length - 1} className="text-cos-slate-dim hover:text-cos-midnight disabled:opacity-20 text-[10px]">&darr;</button>
                  </div>
                  <div className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-cos-midnight">{stage.label}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {stage.isClosedWon && <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700">Won</span>}
                      {stage.isClosedLost && <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-medium text-red-700">Lost</span>}
                      {stage.hubspotStageId && <span className="text-[10px] text-cos-slate-dim">HS: {stage.hubspotStageId.slice(0, 12)}&hellip;</span>}
                      {substages.length > 0 && <span className="text-[10px] text-cos-slate-dim">{substages.length} substage{substages.length !== 1 ? "s" : ""}</span>}
                    </div>
                  </div>
                  <button onClick={() => startNewStage(stage.id)} className="text-[10px] text-cos-electric hover:underline" title="Add substage">+ Sub</button>
                  <button onClick={() => startEditStage(stage)} className="text-xs text-cos-electric hover:underline">Edit</button>
                  <button onClick={() => deleteStage(stage.id)} className="text-cos-slate-dim hover:text-red-500 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Substages indented */}
                {substages.length > 0 && (
                  <div className="ml-8 mt-1 mb-1 space-y-1">
                    {substages.map((sub) => (
                      <div key={sub.id} className="flex items-center gap-3 rounded-cos-md border border-cos-border/60 bg-cos-cloud/20 p-2.5 hover:bg-cos-cloud/50 transition-colors">
                        <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: sub.color }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-cos-midnight">{sub.label}</p>
                          {sub.isClosedLost && <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-medium text-red-700">Lost</span>}
                        </div>
                        <button onClick={() => startEditStage(sub)} className="text-[10px] text-cos-electric hover:underline">Edit</button>
                        <button onClick={() => deleteStage(sub.id)} className="text-cos-slate-dim hover:text-red-500 transition-colors">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {(newStage || editingStage) && (
          <div className="mt-4 rounded-cos-lg border border-cos-electric/30 bg-cos-electric/5 p-4">
            <h3 className="text-sm font-semibold text-cos-midnight mb-3">
              {editingStage ? `Edit: ${editingStage.label}` : stageForm.parentStageId ? `New Substage under "${stages.find((s) => s.id === stageForm.parentStageId)?.label}"` : "New Stage"}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-cos-slate mb-1 block">Label</label>
                <input type="text" value={stageForm.label} onChange={(e) => setStageForm({ ...stageForm, label: e.target.value })} placeholder="e.g. Qualified Lead" className="w-full rounded-cos-lg border border-cos-border px-3 py-1.5 text-sm focus:border-cos-electric focus:outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-cos-slate mb-1 block">Color</label>
                <div className="flex gap-1.5 flex-wrap">
                  {STAGE_COLORS.map((c) => (
                    <button key={c} onClick={() => setStageForm({ ...stageForm, color: c })} className={`h-6 w-6 rounded-full border-2 transition-all ${stageForm.color === c ? "border-cos-midnight scale-110" : "border-transparent hover:scale-105"}`} style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              {!stageForm.parentStageId && (
                <div className="col-span-2 flex items-center gap-6">
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={stageForm.isClosedWon} onChange={(e) => setStageForm({ ...stageForm, isClosedWon: e.target.checked, isClosedLost: e.target.checked ? false : stageForm.isClosedLost })} className="rounded border-cos-border" />
                    <span className="text-cos-midnight">Closed Won (deal is won at this stage)</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={stageForm.isClosedLost} onChange={(e) => setStageForm({ ...stageForm, isClosedLost: e.target.checked, isClosedWon: e.target.checked ? false : stageForm.isClosedWon })} className="rounded border-cos-border" />
                    <span className="text-cos-midnight">Closed Lost (deal is lost at this stage)</span>
                  </label>
                </div>
              )}
              {stageForm.parentStageId && (
                <div className="col-span-2">
                  <p className="text-[10px] text-cos-slate-dim">Substages inherit won/lost status from their parent stage.</p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 mt-4">
              <button onClick={saveStage} disabled={saving || !stageForm.label.trim()} className="flex items-center gap-1.5 rounded-cos-lg bg-cos-electric px-4 py-1.5 text-xs font-medium text-white hover:bg-cos-electric-hover disabled:opacity-50 transition-colors">
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                {editingStage ? "Update Stage" : "Create Stage"}
              </button>
              <button onClick={() => { setNewStage(false); setEditingStage(null); setStageForm({ label: "", color: "#6366f1", isClosedWon: false, isClosedLost: false, parentStageId: null }); }} className="rounded-cos-lg border border-cos-border px-4 py-1.5 text-xs font-medium text-cos-slate hover:text-cos-midnight transition-colors">Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Deal Sources ─────────────────────────────────── */}
      <div className="rounded-cos-xl border border-cos-border bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-cos-midnight">Deal Sources</h2>
          <button onClick={startNewSource} className="flex items-center gap-1.5 rounded-cos-lg bg-cos-electric px-3 py-1.5 text-xs font-medium text-white hover:bg-cos-electric-hover transition-colors">
            <Plus className="h-3 w-3" /> Add Source
          </button>
        </div>

        <div className="space-y-2">
          {sources.map((source) => (
            <div key={source.id} className="flex items-center gap-3 rounded-cos-lg border border-cos-border p-3 hover:bg-cos-cloud/30 transition-colors">
              <div className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: source.color }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-cos-midnight">{source.label}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-cos-slate-dim font-mono">{source.key}</span>
                  {source.isSystem && <span className="rounded-full bg-cos-cloud px-1.5 py-0.5 text-[9px] font-medium text-cos-slate">System</span>}
                </div>
              </div>
              <button onClick={() => startEditSource(source)} className="text-xs text-cos-electric hover:underline">Edit</button>
              {!source.isSystem && (
                <button onClick={() => deleteSource(source.id)} className="text-cos-slate-dim hover:text-red-500 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
              )}
            </div>
          ))}
        </div>

        {(newSource || editingSource) && (
          <div className="mt-4 rounded-cos-lg border border-cos-electric/30 bg-cos-electric/5 p-4">
            <h3 className="text-sm font-semibold text-cos-midnight mb-3">{editingSource ? `Edit: ${editingSource.label}` : "New Deal Source"}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-cos-slate mb-1 block">Label</label>
                <input type="text" value={sourceForm.label} onChange={(e) => setSourceForm({ ...sourceForm, label: e.target.value, key: editingSource ? sourceForm.key : e.target.value.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") })} placeholder="e.g. Referral" className="w-full rounded-cos-lg border border-cos-border px-3 py-1.5 text-sm focus:border-cos-electric focus:outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-cos-slate mb-1 block">Key (slug)</label>
                <input type="text" value={sourceForm.key} onChange={(e) => setSourceForm({ ...sourceForm, key: e.target.value.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") })} placeholder="e.g. referral" disabled={!!editingSource} className="w-full rounded-cos-lg border border-cos-border px-3 py-1.5 text-sm focus:border-cos-electric focus:outline-none disabled:bg-cos-cloud disabled:text-cos-slate-dim" />
              </div>
              <div>
                <label className="text-xs font-medium text-cos-slate mb-1 block">Color</label>
                <div className="flex gap-1.5 flex-wrap">
                  {STAGE_COLORS.map((c) => (
                    <button key={c} onClick={() => setSourceForm({ ...sourceForm, color: c })} className={`h-6 w-6 rounded-full border-2 transition-all ${sourceForm.color === c ? "border-cos-midnight scale-110" : "border-transparent hover:scale-105"}`} style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-cos-slate mb-1 block">Icon</label>
                <select value={sourceForm.icon} onChange={(e) => setSourceForm({ ...sourceForm, icon: e.target.value })} className="w-full rounded-cos-lg border border-cos-border px-3 py-1.5 text-sm focus:border-cos-electric focus:outline-none">
                  {ICON_OPTIONS.map((i) => (<option key={i} value={i}>{i}</option>))}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-4">
              <button onClick={saveSource} disabled={saving || !sourceForm.label.trim() || (!editingSource && !sourceForm.key.trim())} className="flex items-center gap-1.5 rounded-cos-lg bg-cos-electric px-4 py-1.5 text-xs font-medium text-white hover:bg-cos-electric-hover disabled:opacity-50 transition-colors">
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                {editingSource ? "Update Source" : "Create Source"}
              </button>
              <button onClick={() => { setNewSource(false); setEditingSource(null); }} className="rounded-cos-lg border border-cos-border px-4 py-1.5 text-xs font-medium text-cos-slate hover:text-cos-midnight transition-colors">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// LinkedIn Accounts Settings Tab
// ═══════════════════════════════════════════════════════════════
function LinkedInAccountsSettings({ setError }: { setError: (e: string | null) => void }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [generatingInvite, setGeneratingInvite] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [syncingAccount, setSyncingAccount] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const d = await fetch("/api/admin/growth-ops/linkedin-accounts?sync=true").then((r) => r.json());
      setAccounts(d.accounts ?? []);
    } catch (e) { setError(String(e)); }
    if (!silent) setLoading(false); else setRefreshing(false);
  }, [setError]);

  useEffect(() => {
    load();
    const timer = setInterval(() => load(true), 10_000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  async function connectMyAccount(provider?: "sales_navigator") {
    setConnecting(true);
    try {
      const d = await fetch("/api/admin/growth-ops/unipile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generateAuthLink", ...(provider ? { provider } : {}) }) }).then((r) => r.json());
      const url = d.url ?? d.link ?? d.hosted_url;
      if (url) window.open(url, "_blank");
      else setError(d.error ?? "Failed to generate auth link");
    } finally { setConnecting(false); }
  }

  async function generateInviteLink() {
    setGeneratingInvite(true);
    setInviteLink(null);
    setCopied(false);
    try {
      const d = await fetch("/api/admin/growth-ops/unipile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generateAuthLink" }) }).then((r) => r.json());
      const url = d.url ?? d.link ?? d.hosted_url;
      if (url) setInviteLink(url);
      else setError(d.error ?? "Failed to generate invite link");
    } finally { setGeneratingInvite(false); }
  }

  async function copyLink() {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  async function reconnect(unipileAcctId: string) {
    const d = await fetch("/api/admin/growth-ops/unipile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generateReconnectLink", accountId: unipileAcctId }) }).then((r) => r.json());
    const url = d.url ?? d.link ?? d.hosted_url;
    if (url) window.open(url, "_blank");
  }

  function startPolling(unipileAccountId: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const d = await fetch(`/api/admin/growth-ops/unipile?action=getSyncStatus&accountId=${unipileAccountId}`).then((r) => r.json());
        setSyncStatus(d.syncStatus);
        if (d.progress) setSyncProgress(d.progress);
        if (d.syncStatus === "done" || d.syncStatus === "error" || d.syncStatus === "idle") {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch { /* ignore */ }
    }, 2000);
  }

  async function startFullSync(unipileAccountId: string) {
    setSyncingAccount(unipileAccountId);
    setSyncStatus("syncing");
    setSyncProgress(null);
    try {
      const d = await fetch("/api/admin/growth-ops/unipile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "resyncConversations", accountId: unipileAccountId }) }).then((r) => r.json());
      if (d.alreadySyncing) setSyncProgress(d.progress);
      startPolling(unipileAccountId);
    } catch {
      setSyncStatus("error");
      setSyncProgress({ seeded: 0, pages: 0, phase: "error", error: "Failed to start sync" });
    }
  }

  async function revokeAccount(id: string, name: string) {
    if (!confirm(`Remove "${name || "this account"}" and disconnect it from Unipile? This cannot be undone.`)) return;
    setRevoking(id);
    try {
      await fetch(`/api/admin/growth-ops/linkedin-accounts?id=${id}`, { method: "DELETE" });
      setAccounts((prev) => prev.filter((a) => a.id !== id));
    } finally { setRevoking(null); }
  }

  const isSyncing = syncStatus === "syncing";

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-cos-electric" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Action cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-cos-xl border border-cos-border bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-cos-lg bg-cos-electric/10">
              <Plus className="h-4 w-4 text-cos-electric" />
            </div>
            <div className="flex-1">
              <p className="font-heading text-sm font-semibold text-cos-midnight">Connect my account</p>
              <p className="mt-0.5 text-xs text-cos-slate">Choose your LinkedIn connection type. Use Sales Navigator for premium features.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => connectMyAccount()} disabled={connecting} className="flex items-center gap-1.5 rounded-cos-pill bg-cos-electric px-3.5 py-1.5 text-xs font-medium text-white hover:bg-cos-electric-hover disabled:opacity-60 transition-colors">
                  {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
                  LinkedIn
                </button>
                <button onClick={() => connectMyAccount("sales_navigator")} disabled={connecting} className="flex items-center gap-1.5 rounded-cos-pill bg-amber-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-60 transition-colors">
                  {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
                  Sales Navigator
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-cos-xl border border-cos-border bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-cos-lg bg-cos-electric/10">
              <Link2 className="h-4 w-4 text-cos-electric" />
            </div>
            <div className="flex-1">
              <p className="font-heading text-sm font-semibold text-cos-midnight">Invite someone to connect</p>
              <p className="mt-0.5 text-xs text-cos-slate">Generate a one-time link for a team member.</p>
              <button onClick={generateInviteLink} disabled={generatingInvite} className="mt-3 flex items-center gap-1.5 rounded-cos-pill border border-cos-electric px-3.5 py-1.5 text-xs font-medium text-cos-electric hover:bg-cos-electric/5 disabled:opacity-60 transition-colors">
                {generatingInvite ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                Generate invite link
              </button>
            </div>
          </div>

          {inviteLink && (
            <div className="mt-4 rounded-cos-lg border border-cos-electric/30 bg-cos-electric/5 p-3">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <p className="text-xs font-medium text-cos-electric">One-time invite link (expires in 30 min)</p>
                <button onClick={() => setInviteLink(null)} className="text-cos-slate hover:text-cos-midnight"><X className="h-3.5 w-3.5" /></button>
              </div>
              <div className="flex items-center gap-2">
                <p className="flex-1 truncate rounded-cos-md bg-white px-2.5 py-1.5 text-xs font-mono text-cos-slate border border-cos-border">{inviteLink}</p>
                <button onClick={copyLink} className="flex shrink-0 items-center gap-1 rounded-cos-md bg-cos-electric px-3 py-1.5 text-xs font-medium text-white hover:bg-cos-electric-hover transition-colors">
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Accounts list */}
      <div className="rounded-cos-xl border border-cos-border bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-cos-border bg-cos-cloud/30">
          <h2 className="text-sm font-semibold text-cos-midnight">
            Connected accounts {accounts.length > 0 && <span className="ml-1.5 rounded-full bg-cos-electric/10 px-2 py-0.5 text-xs text-cos-electric">{accounts.length}</span>}
          </h2>
          <button onClick={() => load(true)} disabled={refreshing} className="flex items-center gap-1.5 text-xs text-cos-slate hover:text-cos-electric transition-colors">
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        {accounts.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-cos-slate-dim">No accounts connected yet</p>
            <p className="mt-1 text-xs text-cos-slate">Use one of the options above to connect a LinkedIn account.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cos-border bg-cos-cloud/50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">Display name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">LinkedIn username</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">Connected</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => {
                const style = STATUS_STYLE[a.status] ?? STATUS_STYLE.CONNECTING;
                const isRevoking = revoking === a.id;
                const isThisSyncing = isSyncing && syncingAccount === a.unipileAccountId;
                return (<>
                  <tr key={a.id} className="border-b-0 hover:bg-cos-cloud/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-cos-midnight">{a.displayName || a.unipileAccountId}</td>
                    <td className="px-4 py-3 text-cos-slate">{a.linkedinUsername ? `@${a.linkedinUsername}` : "\u2014"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                        {a.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-cos-slate">
                      {a.createdAt && !isNaN(new Date(a.createdAt).getTime())
                        ? new Date(a.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                        : "\u2014"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-3">
                        {a.status === "OK" && (
                          <button onClick={() => startFullSync(a.unipileAccountId)} disabled={isSyncing} className="inline-flex items-center gap-1 text-xs text-cos-electric hover:underline disabled:opacity-40" title="Full 12-month conversation sync">
                            <RefreshCw className={`h-3.5 w-3.5 ${isThisSyncing ? "animate-spin" : ""}`} />
                            {isThisSyncing ? "Syncing\u2026" : "Full sync"}
                          </button>
                        )}
                        {(a.status === "CREDENTIALS" || a.status === "ERROR") && (
                          <button onClick={() => reconnect(a.unipileAccountId)} className="inline-flex items-center gap-1 text-xs text-cos-ember hover:underline">
                            <AlertTriangle className="h-3.5 w-3.5" /> Reconnect
                          </button>
                        )}
                        <button onClick={() => revokeAccount(a.id, a.displayName)} disabled={isRevoking} className="inline-flex items-center gap-1 text-xs text-cos-slate hover:text-red-600 disabled:opacity-40 transition-colors" title="Remove and disconnect">
                          {isRevoking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Revoke
                        </button>
                      </div>
                    </td>
                  </tr>
                  <tr key={`${a.id}-notes`} className="border-b border-cos-border/50 last:border-0">
                    <td colSpan={5} className="px-4 pb-3 pt-0">
                      <AccountNotes accountId={a.id} initialNotes={a.notes ?? ""} />
                    </td>
                  </tr>
                </>);
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Sync progress */}
      {syncingAccount && syncStatus === "syncing" && (
        <div className="rounded-cos-lg border border-cos-electric/30 bg-cos-electric/5 px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <Loader2 className="h-4 w-4 animate-spin text-cos-electric" />
            <p className="text-sm font-medium text-cos-electric">{syncProgress?.phase === "enriching" ? "Enriching profiles\u2026" : "Syncing conversations\u2026"}</p>
          </div>
          {syncProgress && (
            <p className="text-xs text-cos-slate ml-6">{syncProgress.seeded.toLocaleString()} conversations fetched across {syncProgress.pages} pages{syncProgress.phase === "enriching" && " \u2014 now resolving names and avatars"}</p>
          )}
        </div>
      )}
      {syncingAccount && syncStatus === "done" && syncProgress && (
        <div className="rounded-cos-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <Check className="mb-0.5 mr-1.5 inline h-4 w-4" />
          Full sync complete: {syncProgress.seeded.toLocaleString()} conversations synced.
          {(syncProgress.enriched ?? 0) > 0 && ` ${syncProgress.enriched} profiles enriched.`}
        </div>
      )}
      {syncingAccount && syncStatus === "error" && (
        <div className="rounded-cos-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="mb-0.5 mr-1.5 inline h-4 w-4" />
          Sync failed{syncProgress?.error ? `: ${syncProgress.error}` : ""}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Reply AI Knowledge Base Settings Tab
// ═══════════════════════════════════════════════════════════════

interface KBEntry {
  id: string;
  category: string;
  title: string;
  content: string;
  isActive: boolean;
  displayOrder: number;
}

const KB_CATEGORIES = [
  { key: "tone_guide", label: "Tone Guide" },
  { key: "company_info", label: "Company Info" },
  { key: "product_info", label: "Product Info" },
  { key: "pricing", label: "Pricing" },
  { key: "objection_handling", label: "Objection Handling" },
  { key: "custom", label: "Custom" },
];

function ReplyKnowledgeBaseSettings({
  setError,
  flash,
}: {
  setError: (e: string | null) => void;
  flash: (msg: string) => void;
}) {
  const [entries, setEntries] = useState<KBEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<KBEntry | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState({ category: "custom", title: "", content: "" });

  async function load() {
    try {
      setLoading(true);
      const d = await fetch("/api/admin/growth-ops/knowledge-base").then((r) => r.json());
      setEntries(d.entries ?? []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startNew() {
    setIsNew(true);
    setEditing(null);
    setForm({ category: "custom", title: "", content: "" });
  }

  function startEdit(entry: KBEntry) {
    setEditing(entry);
    setIsNew(false);
    setForm({ category: entry.category, title: entry.title, content: entry.content });
  }

  async function saveEntry() {
    setSaving(true);
    try {
      if (editing) {
        await fetch("/api/admin/growth-ops/knowledge-base", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "update", id: editing.id, ...form }),
        });
        flash("Entry updated");
      } else {
        await fetch("/api/admin/growth-ops/knowledge-base", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "create", ...form }),
        });
        flash("Entry created");
      }
      setEditing(null);
      setIsNew(false);
      setForm({ category: "custom", title: "", content: "" });
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function deleteEntry(id: string) {
    if (!confirm("Delete this knowledge base entry?")) return;
    try {
      await fetch("/api/admin/growth-ops/knowledge-base", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      flash("Entry deleted");
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    try {
      await fetch("/api/admin/growth-ops/knowledge-base", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggleActive", id, isActive }),
      });
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, isActive } : e))
      );
    } catch (e) {
      setError(String(e));
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-cos-electric" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-cos-xl border border-cos-border bg-white p-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-base font-semibold text-cos-midnight">Reply Knowledge Base</h2>
            <p className="text-xs text-cos-slate mt-0.5">
              These entries provide context to the AI when generating LinkedIn reply suggestions. Add product info, objection handling scripts, tone guidelines, etc.
            </p>
          </div>
          <button
            onClick={startNew}
            className="flex items-center gap-1.5 rounded-cos-lg bg-cos-electric px-3 py-1.5 text-xs font-medium text-white hover:bg-cos-electric-hover transition-colors"
          >
            <Plus className="h-3 w-3" /> Add Entry
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {entries.length === 0 && (
            <p className="text-sm text-cos-slate py-8 text-center">
              No entries yet. Add knowledge base entries to improve AI reply quality.
            </p>
          )}
          {entries.map((entry) => {
            const catLabel = KB_CATEGORIES.find((c) => c.key === entry.category)?.label ?? entry.category;
            return (
              <div
                key={entry.id}
                className={`rounded-cos-lg border p-4 transition-colors ${
                  entry.isActive
                    ? "border-cos-border hover:bg-cos-cloud/30"
                    : "border-cos-border/50 bg-cos-cloud/20 opacity-60"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="rounded-full bg-cos-electric/10 px-2 py-0.5 text-[10px] font-medium text-cos-electric">
                        {catLabel}
                      </span>
                      <h3 className="text-sm font-medium text-cos-midnight">{entry.title}</h3>
                    </div>
                    <p className="text-xs text-cos-slate leading-relaxed line-clamp-3">
                      {entry.content}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => toggleActive(entry.id, !entry.isActive)}
                      className="text-cos-slate hover:text-cos-midnight transition-colors"
                      title={entry.isActive ? "Disable" : "Enable"}
                    >
                      {entry.isActive ? (
                        <ToggleRight className="h-5 w-5 text-cos-electric" />
                      ) : (
                        <ToggleLeft className="h-5 w-5" />
                      )}
                    </button>
                    <button
                      onClick={() => startEdit(entry)}
                      className="text-cos-slate hover:text-cos-electric transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => deleteEntry(entry.id)}
                      className="text-cos-slate-dim hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Add/Edit Form */}
        {(isNew || editing) && (
          <div className="mt-4 rounded-cos-lg border border-cos-electric/30 bg-cos-electric/5 p-4">
            <h3 className="text-sm font-semibold text-cos-midnight mb-3">
              {editing ? `Edit: ${editing.title}` : "New Entry"}
            </h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-cos-slate mb-1 block">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full rounded-cos-lg border border-cos-border px-3 py-1.5 text-sm focus:border-cos-electric focus:outline-none"
                  >
                    {KB_CATEGORIES.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-cos-slate mb-1 block">Title</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="e.g. How to handle pricing questions"
                    className="w-full rounded-cos-lg border border-cos-border px-3 py-1.5 text-sm focus:border-cos-electric focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-cos-slate mb-1 block">Content</label>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  rows={4}
                  placeholder="Write the knowledge, talking points, or guidelines the AI should use when generating replies..."
                  className="w-full rounded-cos-lg border border-cos-border px-3 py-2 text-sm focus:border-cos-electric focus:outline-none resize-none"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={saveEntry}
                disabled={saving || !form.title.trim() || !form.content.trim()}
                className="flex items-center gap-1.5 rounded-cos-lg bg-cos-electric px-4 py-1.5 text-xs font-medium text-white hover:bg-cos-electric-hover disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                {editing ? "Update" : "Create"}
              </button>
              <button
                onClick={() => {
                  setIsNew(false);
                  setEditing(null);
                }}
                className="rounded-cos-lg border border-cos-border px-4 py-1.5 text-xs font-medium text-cos-slate hover:text-cos-midnight transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
