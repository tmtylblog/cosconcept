"use client";

import { useEffect, useState } from "react";
import {
  Plus, Loader2, Play, Pause, X, ChevronDown, ChevronUp, ChevronRight,
  AlertTriangle, CheckCircle2, Clock, Ban, Users, Upload,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Account {
  id: string;
  displayName: string;
  unipileAccountId: string;
  status: string;
}

interface TargetList {
  id: string;
  name: string;
  description?: string | null;
  created_at?: string;
}

interface Target {
  id: string;
  first_name: string;
  linkedin_url: string;
  status: string;
  invited_at: string | null;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  dailyMin: number;
  dailyMax: number;
  activeDays: string[];
  activeHoursStart: number;
  activeHoursEnd: number;
  inviteMessage: string | null;
  totalSent: number;
  totalAccepted: number;
  pauseReason: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  // enriched
  accountName: string;
  accountStatus: string;
  listName: string;
  queuedCount: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ALL_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_LABELS: Record<string, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu",
  fri: "Fri", sat: "Sat", sun: "Sun",
};

const STATUS_STYLE: Record<string, { bg: string; text: string; dot: string }> = {
  draft:     { bg: "bg-cos-slate/10",    text: "text-cos-slate-dim",  dot: "bg-cos-slate-dim" },
  active:    { bg: "bg-emerald-50",      text: "text-emerald-700",    dot: "bg-emerald-500" },
  paused:    { bg: "bg-amber-50",        text: "text-amber-700",      dot: "bg-amber-500" },
  completed: { bg: "bg-cos-electric/10", text: "text-cos-electric",   dot: "bg-cos-electric" },
  cancelled: { bg: "bg-red-50",          text: "text-red-600",        dot: "bg-red-400" },
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  active:    <CheckCircle2 className="h-3.5 w-3.5" />,
  paused:    <AlertTriangle className="h-3.5 w-3.5" />,
  completed: <CheckCircle2 className="h-3.5 w-3.5" />,
  cancelled: <Ban className="h-3.5 w-3.5" />,
  draft:     <Clock className="h-3.5 w-3.5" />,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function AcceptanceBar({ sent, accepted }: { sent: number; accepted: number }) {
  if (sent === 0) return <span className="text-cos-slate-dim text-xs">—</span>;
  const rate = Math.round((accepted / sent) * 100);
  const color = rate >= 30 ? "bg-emerald-500" : rate >= 20 ? "bg-amber-500" : "bg-red-400";
  const textColor = rate >= 30 ? "text-emerald-700" : rate >= 20 ? "text-amber-600" : "text-red-600";
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="h-1.5 w-16 rounded-full bg-cos-border overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(rate, 100)}%` }} />
      </div>
      <span className={`text-xs font-medium tabular-nums ${textColor}`}>{rate}%</span>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function LinkedInCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [lists, setLists] = useState<TargetList[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const defaultForm = {
    name: "",
    targetListId: "",
    linkedinAccountId: "",
    dailyMin: 15,
    dailyMax: 19,
    activeDays: ["mon", "tue", "wed", "thu", "fri", "sat"],
    activeHoursStart: 8,
    activeHoursEnd: 18,
    inviteMessage: "",
  };
  const [form, setForm] = useState(defaultForm);
  const [creating, setCreating] = useState(false);

  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [c, a, l] = await Promise.all([
        fetch("/api/admin/growth-ops/invite-campaigns").then((r) => r.ok ? r.json() : { campaigns: [] }),
        fetch("/api/admin/growth-ops/linkedin-accounts").then((r) => r.ok ? r.json() : { accounts: [] }),
        fetch("/api/admin/growth-ops/target-lists").then((r) => r.ok ? r.json() : { lists: [] }),
      ]);
      setCampaigns(c.campaigns ?? []);
      setAccounts(a.accounts ?? []);
      setLists(l.lists ?? []);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function createCampaign() {
    if (!form.name || !form.targetListId || !form.linkedinAccountId) return;
    setCreating(true);
    await fetch("/api/admin/growth-ops/invite-campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        inviteMessage: form.inviteMessage || undefined,
      }),
    });
    setCreating(false);
    setShowCreate(false);
    setForm(defaultForm);
    load();
  }

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/admin/growth-ops/invite-campaigns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  function toggleDay(day: string) {
    setForm((f) => ({
      ...f,
      activeDays: f.activeDays.includes(day)
        ? f.activeDays.filter((d) => d !== day)
        : [...f.activeDays, day],
    }));
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-cos-midnight">Invite Campaigns</h1>
          <p className="text-sm text-cos-slate mt-1">
            LinkedIn connection campaigns with five-tier safety controls.
            Max 25/day · 80/week · 30% acceptance floor · 5 consecutive days max.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-cos-pill bg-cos-electric px-4 py-2 text-sm font-medium text-white hover:bg-cos-electric-hover transition-colors"
        >
          <Plus className="h-4 w-4" /> New Campaign
        </button>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-cos-2xl bg-white shadow-xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-cos-border px-6 py-4">
              <h2 className="font-heading text-lg font-bold text-cos-midnight">New Campaign</h2>
              <button onClick={() => setShowCreate(false)} className="text-cos-slate hover:text-cos-midnight">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-cos-slate mb-1 block">Campaign name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Agency CEOs Q1 2026"
                  className="w-full rounded-cos-lg border border-cos-border px-3 py-2.5 text-sm focus:border-cos-electric focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-cos-slate mb-1 block">Target list</label>
                  <select
                    value={form.targetListId}
                    onChange={(e) => setForm({ ...form, targetListId: e.target.value })}
                    className="w-full rounded-cos-lg border border-cos-border px-3 py-2.5 text-sm focus:border-cos-electric focus:outline-none"
                  >
                    <option value="">Select list…</option>
                    {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-cos-slate mb-1 block">LinkedIn account</label>
                  <select
                    value={form.linkedinAccountId}
                    onChange={(e) => setForm({ ...form, linkedinAccountId: e.target.value })}
                    className="w-full rounded-cos-lg border border-cos-border px-3 py-2.5 text-sm focus:border-cos-electric focus:outline-none"
                  >
                    <option value="">Select account…</option>
                    {accounts.filter((a) => a.status === "OK").map((a) => (
                      <option key={a.id} value={a.id}>{a.displayName || a.unipileAccountId}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-cos-slate mb-1 block">Min invites/day</label>
                  <input
                    type="number" min={1} max={25}
                    value={form.dailyMin}
                    onChange={(e) => setForm({ ...form, dailyMin: Number(e.target.value) })}
                    className="w-full rounded-cos-lg border border-cos-border px-3 py-2.5 text-sm focus:border-cos-electric focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-cos-slate mb-1 block">Max invites/day (≤ 25)</label>
                  <input
                    type="number" min={1} max={25}
                    value={form.dailyMax}
                    onChange={(e) => setForm({ ...form, dailyMax: Number(e.target.value) })}
                    className="w-full rounded-cos-lg border border-cos-border px-3 py-2.5 text-sm focus:border-cos-electric focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-cos-slate mb-2 block">Active days</label>
                <div className="flex gap-1.5 flex-wrap">
                  {ALL_DAYS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleDay(d)}
                      className={`rounded-cos-pill px-3 py-1 text-xs font-medium transition-colors ${
                        form.activeDays.includes(d)
                          ? "bg-cos-electric text-white"
                          : "border border-cos-border bg-white text-cos-slate hover:border-cos-electric"
                      }`}
                    >
                      {DAY_LABELS[d]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-cos-slate mb-1 block">Active from (UTC hour)</label>
                  <input
                    type="number" min={0} max={23}
                    value={form.activeHoursStart}
                    onChange={(e) => setForm({ ...form, activeHoursStart: Number(e.target.value) })}
                    className="w-full rounded-cos-lg border border-cos-border px-3 py-2.5 text-sm focus:border-cos-electric focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-cos-slate mb-1 block">Active until (UTC hour)</label>
                  <input
                    type="number" min={0} max={23}
                    value={form.activeHoursEnd}
                    onChange={(e) => setForm({ ...form, activeHoursEnd: Number(e.target.value) })}
                    className="w-full rounded-cos-lg border border-cos-border px-3 py-2.5 text-sm focus:border-cos-electric focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-cos-slate mb-1 block">
                  Invite message <span className="font-normal text-cos-slate-dim">(optional · 300 char max)</span>
                </label>
                <textarea
                  value={form.inviteMessage}
                  onChange={(e) => setForm({ ...form, inviteMessage: e.target.value.slice(0, 300) })}
                  placeholder="Hi {{firstName}}, I'd love to connect…"
                  rows={3}
                  className="w-full rounded-cos-lg border border-cos-border px-3 py-2.5 text-sm focus:border-cos-electric focus:outline-none resize-none"
                />
                <p className="mt-0.5 text-right text-[10px] text-cos-slate-dim">{form.inviteMessage.length}/300</p>
              </div>
            </div>

            <div className="flex gap-3 border-t border-cos-border px-6 py-4">
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 rounded-cos-pill border border-cos-border py-2 text-sm text-cos-slate hover:bg-cos-cloud transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createCampaign}
                disabled={creating || !form.name || !form.targetListId || !form.linkedinAccountId || form.activeDays.length === 0}
                className="flex-1 rounded-cos-pill bg-cos-electric py-2 text-sm font-medium text-white hover:bg-cos-electric-hover disabled:opacity-60 transition-colors"
              >
                {creating ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Create Campaign"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Campaign list */}
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-cos-lg bg-red-50 border border-red-200 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-600">Failed to load: {error}</p>
          <button onClick={load} className="ml-auto text-xs text-red-600 hover:underline">Retry</button>
        </div>
      )}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-cos-electric" />
        </div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-cos-xl border border-dashed border-cos-border bg-white p-12 text-center">
          <p className="text-sm font-medium text-cos-slate-dim">No campaigns yet</p>
          <p className="mt-1 text-xs text-cos-slate">Create a campaign to start sending LinkedIn connection invites.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => {
            const style = STATUS_STYLE[c.status] ?? STATUS_STYLE.draft;
            const totalTargets = c.totalSent + c.queuedCount;
            const progressPct = totalTargets > 0 ? Math.round((c.totalSent / totalTargets) * 100) : 0;
            const isExpanded = expandedId === c.id;
            const isPausedBySafety = c.status === "paused" && c.pauseReason;

            return (
              <div key={c.id} className="rounded-cos-xl border border-cos-border bg-white shadow-sm overflow-hidden">
                {/* Main row */}
                <div className="flex items-center gap-4 px-5 py-4">
                  {/* Status badge */}
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0 ${style.bg} ${style.text}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                    {c.status}
                  </span>

                  {/* Name + meta */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-cos-midnight truncate">{c.name}</p>
                    <p className="text-[11px] text-cos-slate mt-0.5 truncate">
                      {c.accountName || "—"} · {c.listName || "—"}
                    </p>
                  </div>

                  {/* Stats */}
                  <div className="hidden sm:flex items-center gap-6 shrink-0">
                    {/* Progress */}
                    <div className="text-center min-w-[60px]">
                      <p className="text-xs font-semibold text-cos-midnight tabular-nums">{c.totalSent}<span className="font-normal text-cos-slate">/{totalTargets}</span></p>
                      <p className="text-[10px] text-cos-slate-dim">sent</p>
                    </div>

                    {/* Acceptance */}
                    <div className="text-center">
                      <AcceptanceBar sent={c.totalSent} accepted={c.totalAccepted} />
                      <p className="text-[10px] text-cos-slate-dim mt-0.5">accepted</p>
                    </div>

                    {/* Daily */}
                    <div className="text-center min-w-[48px]">
                      <p className="text-xs font-semibold text-cos-midnight">{c.dailyMin}–{c.dailyMax}</p>
                      <p className="text-[10px] text-cos-slate-dim">per day</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {c.status === "draft" && (
                      <button
                        onClick={() => updateStatus(c.id, "active")}
                        className="flex items-center gap-1 rounded-cos-pill bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
                      >
                        <Play className="h-3 w-3" /> Start
                      </button>
                    )}
                    {c.status === "active" && (
                      <button
                        onClick={() => updateStatus(c.id, "paused")}
                        className="flex items-center gap-1 rounded-cos-pill bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors"
                      >
                        <Pause className="h-3 w-3" /> Pause
                      </button>
                    )}
                    {c.status === "paused" && (
                      <button
                        onClick={() => updateStatus(c.id, "active")}
                        className="flex items-center gap-1 rounded-cos-pill bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
                      >
                        <Play className="h-3 w-3" /> Resume
                      </button>
                    )}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : c.id)}
                      className="text-cos-slate hover:text-cos-midnight transition-colors p-1"
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Progress bar */}
                {totalTargets > 0 && (
                  <div className="mx-5 mb-3 h-1 rounded-full bg-cos-border overflow-hidden">
                    <div
                      className="h-full rounded-full bg-cos-electric transition-all"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                )}

                {/* Safety pause warning */}
                {isPausedBySafety && (
                  <div className="mx-5 mb-3 flex items-center gap-2 rounded-cos-lg bg-amber-50 border border-amber-200 px-3 py-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                    <p className="text-xs text-amber-700">
                      <span className="font-medium">Auto-paused:</span> {c.pauseReason}
                    </p>
                  </div>
                )}

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-cos-border/60 bg-cos-cloud/30 px-5 py-4">
                    <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-xs sm:grid-cols-4">
                      <div>
                        <p className="text-cos-slate-dim mb-0.5">Active days</p>
                        <p className="font-medium text-cos-midnight">
                          {(c.activeDays ?? []).map((d) => DAY_LABELS[d] ?? d).join(", ") || "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-cos-slate-dim mb-0.5">Active hours (UTC)</p>
                        <p className="font-medium text-cos-midnight">{c.activeHoursStart}:00 – {c.activeHoursEnd}:00</p>
                      </div>
                      <div>
                        <p className="text-cos-slate-dim mb-0.5">Started</p>
                        <p className="font-medium text-cos-midnight">
                          {c.startedAt ? new Date(c.startedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-cos-slate-dim mb-0.5">Created</p>
                        <p className="font-medium text-cos-midnight">
                          {new Date(c.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                      </div>
                      {c.inviteMessage && (
                        <div className="col-span-2 sm:col-span-4">
                          <p className="text-cos-slate-dim mb-0.5">Invite message</p>
                          <p className="font-medium text-cos-midnight leading-relaxed">{c.inviteMessage}</p>
                        </div>
                      )}
                    </div>
                    {(c.status === "active" || c.status === "paused") && (
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => updateStatus(c.id, "cancelled")}
                          className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 hover:underline"
                        >
                          <Ban className="h-3 w-3" /> Cancel campaign
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Target Lists Section ──────────────────────────────────────── */}
      <TargetListsSection lists={lists} onListsChanged={load} />
    </div>
  );
}

// ── Target List Status Styles ─────────────────────────────────────────────────

const TARGET_STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  pending: { bg: "bg-cos-slate/10", text: "text-cos-slate-dim" },
  invited: { bg: "bg-emerald-50", text: "text-emerald-700" },
  failed: { bg: "bg-red-50", text: "text-red-600" },
  skipped: { bg: "bg-amber-50", text: "text-amber-600" },
};

// ── Target Lists Sub-Section ──────────────────────────────────────────────────

function TargetListsSection({
  lists,
  onListsChanged,
}: {
  lists: TargetList[];
  onListsChanged: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [targets, setTargets] = useState<Record<string, Target[]>>({});
  const [loadingTargets, setLoadingTargets] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [csvText, setCsvText] = useState("");
  const [importing, setImporting] = useState<string | null>(null);

  async function toggleList(id: string) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!targets[id]) {
      setLoadingTargets(id);
      const d = await fetch(`/api/admin/growth-ops/target-lists/${id}/targets`).then((r) => r.json());
      setTargets((prev) => ({ ...prev, [id]: d.targets ?? [] }));
      setLoadingTargets(null);
    }
  }

  async function createList() {
    await fetch("/api/admin/growth-ops/target-lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, description: newDesc }),
    });
    setShowCreate(false);
    setNewName("");
    setNewDesc("");
    onListsChanged();
  }

  async function importCSV(listId: string) {
    const lines = csvText.trim().split("\n").filter(Boolean);
    const parsed = lines.map((line) => {
      const [firstName, linkedinUrl] = line.split(",").map((s) => s.trim());
      return { firstName: firstName ?? "", linkedinUrl: linkedinUrl ?? "" };
    }).filter((t) => t.linkedinUrl);

    if (parsed.length === 0) return;
    setImporting(listId);
    await fetch(`/api/admin/growth-ops/target-lists/${listId}/targets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targets: parsed }),
    });
    setCsvText("");
    setImporting(null);
    const d = await fetch(`/api/admin/growth-ops/target-lists/${listId}/targets`).then((r) => r.json());
    setTargets((prev) => ({ ...prev, [listId]: d.targets ?? [] }));
  }

  return (
    <div className="mt-10">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-heading text-lg font-bold text-cos-midnight">Target Lists</h2>
          <p className="text-sm text-cos-slate mt-0.5">LinkedIn invite target lists. Import via CSV (firstName, linkedinUrl).</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 rounded-cos-pill bg-cos-electric px-4 py-2 text-sm font-medium text-white hover:bg-cos-electric-hover transition-colors">
          <Plus className="h-4 w-4" /> New List
        </button>
      </div>

      {showCreate && (
        <div className="mb-4 rounded-cos-xl border border-cos-border bg-white p-4 shadow-sm">
          <div className="flex gap-3">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="List name" className="flex-1 rounded-cos-lg border border-cos-border px-3 py-2 text-sm focus:border-cos-electric focus:outline-none" />
            <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Description (optional)" className="flex-1 rounded-cos-lg border border-cos-border px-3 py-2 text-sm focus:border-cos-electric focus:outline-none" />
            <button onClick={createList} disabled={!newName} className="rounded-cos-pill bg-cos-electric px-4 py-2 text-sm font-medium text-white disabled:opacity-60 hover:bg-cos-electric-hover">Create</button>
            <button onClick={() => setShowCreate(false)} className="rounded-cos-pill border border-cos-border px-4 py-2 text-sm text-cos-slate hover:bg-cos-cloud">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {lists.length === 0 && (
          <div className="rounded-cos-xl border border-dashed border-cos-border bg-white p-8 text-center">
            <p className="text-sm text-cos-slate">No target lists yet. Create one to start building invite campaigns.</p>
          </div>
        )}
        {lists.map((list) => (
          <div key={list.id} className="rounded-cos-xl border border-cos-border bg-white shadow-sm overflow-hidden">
            <button onClick={() => toggleList(list.id)} className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-cos-cloud/30 transition-colors text-left">
              {expanded === list.id ? <ChevronDown className="h-4 w-4 text-cos-slate shrink-0" /> : <ChevronRight className="h-4 w-4 text-cos-slate shrink-0" />}
              <Users className="h-4 w-4 text-cos-electric shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-cos-midnight">{list.name}</p>
                {list.description && <p className="text-xs text-cos-slate">{list.description}</p>}
              </div>
              {targets[list.id] && <span className="text-xs text-cos-slate">{targets[list.id].length} targets</span>}
            </button>

            {expanded === list.id && (
              <div className="border-t border-cos-border px-5 py-4">
                {/* CSV import */}
                <div className="mb-4">
                  <label className="text-xs font-semibold text-cos-slate-dim uppercase tracking-wider mb-1.5 block">Import CSV (firstName, linkedinUrl)</label>
                  <div className="flex gap-2">
                    <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} placeholder={"John Doe, https://linkedin.com/in/johndoe\nJane Smith, https://linkedin.com/in/janesmith"} rows={3} className="flex-1 rounded-cos-lg border border-cos-border px-3 py-2 text-xs font-mono focus:border-cos-electric focus:outline-none resize-none" />
                    <button onClick={() => importCSV(list.id)} disabled={!csvText.trim() || importing === list.id} className="self-end rounded-cos-pill bg-cos-electric px-4 py-2 text-sm font-medium text-white disabled:opacity-60 hover:bg-cos-electric-hover flex items-center gap-2">
                      {importing === list.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />} Import
                    </button>
                  </div>
                </div>

                {/* Target table */}
                {loadingTargets === list.id ? (
                  <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-cos-electric" /></div>
                ) : (
                  <div className="rounded-cos-lg border border-cos-border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead><tr className="border-b border-cos-border bg-cos-cloud/50">
                        <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-cos-slate-dim">Name</th>
                        <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-cos-slate-dim">LinkedIn</th>
                        <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-cos-slate-dim">Status</th>
                      </tr></thead>
                      <tbody>
                        {(targets[list.id] ?? []).length === 0 && <tr><td colSpan={3} className="px-3 py-4 text-center text-cos-slate">No targets yet.</td></tr>}
                        {(targets[list.id] ?? []).map((t) => {
                          const s = TARGET_STATUS_STYLE[t.status] ?? TARGET_STATUS_STYLE.pending;
                          return <tr key={t.id} className="border-b border-cos-border/50 hover:bg-cos-cloud/20">
                            <td className="px-3 py-2 font-medium text-cos-midnight">{t.first_name}</td>
                            <td className="px-3 py-2 text-cos-electric truncate max-w-[200px]"><a href={t.linkedin_url} target="_blank" rel="noreferrer" className="hover:underline">{t.linkedin_url}</a></td>
                            <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 font-medium ${s.bg} ${s.text}`}>{t.status}</span></td>
                          </tr>;
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
