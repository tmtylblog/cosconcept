"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  ArrowLeft,
  Plus,
  Trash2,
  GripVertical,
  Save,
  AlertCircle,
  X,
} from "lucide-react";

interface Stage {
  id: string;
  label: string;
  displayOrder: number;
  color: string;
  isClosedWon: boolean;
  isClosedLost: boolean;
  hubspotStageId: string | null;
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

export default function PipelineSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Stages
  const [stages, setStages] = useState<Stage[]>([]);
  const [editingStage, setEditingStage] = useState<Stage | null>(null);
  const [newStage, setNewStage] = useState(false);
  const [stageForm, setStageForm] = useState({ label: "", color: "#6366f1", isClosedWon: false, isClosedLost: false });

  // Sources
  const [sources, setSources] = useState<DealSource[]>([]);
  const [editingSource, setEditingSource] = useState<DealSource | null>(null);
  const [newSource, setNewSource] = useState(false);
  const [sourceForm, setSourceForm] = useState({ key: "", label: "", color: "#6366f1", icon: "globe" });

  const [saving, setSaving] = useState(false);

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

  useEffect(() => { loadData(); }, []);

  function flash(msg: string) {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  }

  // ── Stage actions ─────────────────────────────────────
  async function saveStage() {
    setSaving(true);
    try {
      if (editingStage) {
        await fetch("/api/admin/growth-ops/pipeline/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "updateStage",
            stageId: editingStage.id,
            label: stageForm.label,
            color: stageForm.color,
            isClosedWon: stageForm.isClosedWon,
            isClosedLost: stageForm.isClosedLost,
          }),
        });
        flash("Stage updated");
      } else {
        const maxOrder = stages.reduce((m, s) => Math.max(m, s.displayOrder), -1);
        await fetch("/api/admin/growth-ops/pipeline/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "createStage",
            label: stageForm.label,
            color: stageForm.color,
            displayOrder: maxOrder + 1,
            isClosedWon: stageForm.isClosedWon,
            isClosedLost: stageForm.isClosedLost,
          }),
        });
        flash("Stage created");
      }
      setEditingStage(null);
      setNewStage(false);
      setStageForm({ label: "", color: "#6366f1", isClosedWon: false, isClosedLost: false });
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
      await fetch("/api/admin/growth-ops/pipeline/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deleteStage", stageId }),
      });
      flash("Stage deleted");
      await loadData();
    } catch (e) {
      setError(String(e));
    }
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
      await fetch("/api/admin/growth-ops/pipeline/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reorderStages", order: newOrder }),
      });
      await loadData();
    } catch (e) {
      setError(String(e));
    }
  }

  function startEditStage(stage: Stage) {
    setEditingStage(stage);
    setNewStage(false);
    setStageForm({ label: stage.label, color: stage.color, isClosedWon: stage.isClosedWon, isClosedLost: stage.isClosedLost });
  }

  function startNewStage() {
    setNewStage(true);
    setEditingStage(null);
    setStageForm({ label: "", color: "#6366f1", isClosedWon: false, isClosedLost: false });
  }

  // ── Source actions ────────────────────────────────────
  async function saveSource() {
    setSaving(true);
    try {
      if (editingSource) {
        await fetch("/api/admin/growth-ops/pipeline/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "updateSource",
            sourceId: editingSource.id,
            label: sourceForm.label,
            color: sourceForm.color,
            icon: sourceForm.icon,
          }),
        });
        flash("Source updated");
      } else {
        const maxOrder = sources.reduce((m, s) => Math.max(m, s.displayOrder), -1);
        await fetch("/api/admin/growth-ops/pipeline/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "createSource",
            key: sourceForm.key,
            label: sourceForm.label,
            color: sourceForm.color,
            icon: sourceForm.icon,
            displayOrder: maxOrder + 1,
          }),
        });
        flash("Source created");
      }
      setEditingSource(null);
      setNewSource(false);
      setSourceForm({ key: "", label: "", color: "#6366f1", icon: "globe" });
      await loadData();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function deleteSource(sourceId: string) {
    if (!confirm("Delete this deal source?")) return;
    try {
      const res = await fetch("/api/admin/growth-ops/pipeline/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deleteSource", sourceId }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      flash("Source deleted");
      await loadData();
    } catch (e) {
      setError(String(e));
    }
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

  const STAGE_COLORS = ["#6366f1", "#8b5cf6", "#3b82f6", "#06b6d4", "#10b981", "#22c55e", "#f59e0b", "#ef4444", "#ec4899", "#64748b"];
  const ICON_OPTIONS = ["globe", "mail", "linkedin", "plus-circle", "phone", "zap", "users", "star", "target", "megaphone"];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-cos-electric" />
        <p className="text-sm text-cos-slate">Loading settings&hellip;</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <Link href="/admin/growth-ops/pipeline" className="text-xs text-cos-electric hover:underline flex items-center gap-1 mb-3">
          <ArrowLeft className="h-3 w-3" /> Back to Pipeline
        </Link>
        <h1 className="font-heading text-2xl font-bold text-cos-midnight">Pipeline Settings</h1>
        <p className="text-sm text-cos-slate mt-1">Manage pipeline stages, deal sources, and other configuration.</p>
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

      {/* ── Pipeline Stages ──────────────────────────────── */}
      <div className="rounded-cos-xl border border-cos-border bg-white p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-cos-midnight">Pipeline Stages</h2>
          <button onClick={startNewStage} className="flex items-center gap-1.5 rounded-cos-lg bg-cos-electric px-3 py-1.5 text-xs font-medium text-white hover:bg-cos-electric-hover transition-colors">
            <Plus className="h-3 w-3" /> Add Stage
          </button>
        </div>

        <div className="space-y-2">
          {stages.map((stage, idx) => (
            <div key={stage.id} className="flex items-center gap-3 rounded-cos-lg border border-cos-border p-3 hover:bg-cos-cloud/30 transition-colors">
              <div className="flex flex-col gap-0.5">
                <button onClick={() => moveStage(stage.id, "up")} disabled={idx === 0} className="text-cos-slate-dim hover:text-cos-midnight disabled:opacity-20 text-[10px]">&uarr;</button>
                <GripVertical className="h-3.5 w-3.5 text-cos-slate-dim" />
                <button onClick={() => moveStage(stage.id, "down")} disabled={idx === stages.length - 1} className="text-cos-slate-dim hover:text-cos-midnight disabled:opacity-20 text-[10px]">&darr;</button>
              </div>
              <div className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-cos-midnight">{stage.label}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {stage.isClosedWon && <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700">Won</span>}
                  {stage.isClosedLost && <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-medium text-red-700">Lost</span>}
                  {stage.hubspotStageId && <span className="text-[10px] text-cos-slate-dim">HS: {stage.hubspotStageId.slice(0, 12)}&hellip;</span>}
                  <span className="text-[10px] text-cos-slate-dim">Order: {stage.displayOrder}</span>
                </div>
              </div>
              <button onClick={() => startEditStage(stage)} className="text-xs text-cos-electric hover:underline">Edit</button>
              <button onClick={() => deleteStage(stage.id)} className="text-cos-slate-dim hover:text-red-500 transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        {/* Stage form (create/edit) */}
        {(newStage || editingStage) && (
          <div className="mt-4 rounded-cos-lg border border-cos-electric/30 bg-cos-electric/5 p-4">
            <h3 className="text-sm font-semibold text-cos-midnight mb-3">
              {editingStage ? `Edit: ${editingStage.label}` : "New Stage"}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-cos-slate mb-1 block">Label</label>
                <input
                  type="text"
                  value={stageForm.label}
                  onChange={(e) => setStageForm({ ...stageForm, label: e.target.value })}
                  placeholder="e.g. Qualified Lead"
                  className="w-full rounded-cos-lg border border-cos-border px-3 py-1.5 text-sm focus:border-cos-electric focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-cos-slate mb-1 block">Color</label>
                <div className="flex gap-1.5 flex-wrap">
                  {STAGE_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setStageForm({ ...stageForm, color: c })}
                      className={`h-6 w-6 rounded-full border-2 transition-all ${stageForm.color === c ? "border-cos-midnight scale-110" : "border-transparent hover:scale-105"}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <div className="col-span-2 flex items-center gap-6">
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={stageForm.isClosedWon}
                    onChange={(e) => setStageForm({ ...stageForm, isClosedWon: e.target.checked, isClosedLost: e.target.checked ? false : stageForm.isClosedLost })}
                    className="rounded border-cos-border"
                  />
                  <span className="text-cos-midnight">Closed Won (deal is won at this stage)</span>
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={stageForm.isClosedLost}
                    onChange={(e) => setStageForm({ ...stageForm, isClosedLost: e.target.checked, isClosedWon: e.target.checked ? false : stageForm.isClosedWon })}
                    className="rounded border-cos-border"
                  />
                  <span className="text-cos-midnight">Closed Lost (deal is lost at this stage)</span>
                </label>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={saveStage}
                disabled={saving || !stageForm.label.trim()}
                className="flex items-center gap-1.5 rounded-cos-lg bg-cos-electric px-4 py-1.5 text-xs font-medium text-white hover:bg-cos-electric-hover disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                {editingStage ? "Update Stage" : "Create Stage"}
              </button>
              <button
                onClick={() => { setNewStage(false); setEditingStage(null); }}
                className="rounded-cos-lg border border-cos-border px-4 py-1.5 text-xs font-medium text-cos-slate hover:text-cos-midnight transition-colors"
              >
                Cancel
              </button>
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
                <button onClick={() => deleteSource(source.id)} className="text-cos-slate-dim hover:text-red-500 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Source form (create/edit) */}
        {(newSource || editingSource) && (
          <div className="mt-4 rounded-cos-lg border border-cos-electric/30 bg-cos-electric/5 p-4">
            <h3 className="text-sm font-semibold text-cos-midnight mb-3">
              {editingSource ? `Edit: ${editingSource.label}` : "New Deal Source"}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-cos-slate mb-1 block">Label</label>
                <input
                  type="text"
                  value={sourceForm.label}
                  onChange={(e) => setSourceForm({ ...sourceForm, label: e.target.value, key: editingSource ? sourceForm.key : e.target.value.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") })}
                  placeholder="e.g. Referral"
                  className="w-full rounded-cos-lg border border-cos-border px-3 py-1.5 text-sm focus:border-cos-electric focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-cos-slate mb-1 block">Key (slug)</label>
                <input
                  type="text"
                  value={sourceForm.key}
                  onChange={(e) => setSourceForm({ ...sourceForm, key: e.target.value.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") })}
                  placeholder="e.g. referral"
                  disabled={!!editingSource}
                  className="w-full rounded-cos-lg border border-cos-border px-3 py-1.5 text-sm focus:border-cos-electric focus:outline-none disabled:bg-cos-cloud disabled:text-cos-slate-dim"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-cos-slate mb-1 block">Color</label>
                <div className="flex gap-1.5 flex-wrap">
                  {STAGE_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setSourceForm({ ...sourceForm, color: c })}
                      className={`h-6 w-6 rounded-full border-2 transition-all ${sourceForm.color === c ? "border-cos-midnight scale-110" : "border-transparent hover:scale-105"}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-cos-slate mb-1 block">Icon</label>
                <select
                  value={sourceForm.icon}
                  onChange={(e) => setSourceForm({ ...sourceForm, icon: e.target.value })}
                  className="w-full rounded-cos-lg border border-cos-border px-3 py-1.5 text-sm focus:border-cos-electric focus:outline-none"
                >
                  {ICON_OPTIONS.map((i) => (
                    <option key={i} value={i}>{i}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={saveSource}
                disabled={saving || !sourceForm.label.trim() || (!editingSource && !sourceForm.key.trim())}
                className="flex items-center gap-1.5 rounded-cos-lg bg-cos-electric px-4 py-1.5 text-xs font-medium text-white hover:bg-cos-electric-hover disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                {editingSource ? "Update Source" : "Create Source"}
              </button>
              <button
                onClick={() => { setNewSource(false); setEditingSource(null); }}
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
