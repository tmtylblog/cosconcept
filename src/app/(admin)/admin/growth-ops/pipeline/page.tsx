"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  DollarSign,
  AlertCircle,
  RefreshCw,
  LayoutGrid,
  Table2,
  Mail,
  Linkedin,
  Globe,
  Bell,
  Check,
  X,
  ChevronRight,
  Plus,
  Settings,
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

interface Deal {
  id: string;
  name: string;
  stageId: string | null;
  stageLabel: string;
  dealValue: string | null;
  status: string;
  source: string;
  sourceChannel: string | null;
  priority: string;
  lastActivityAt: string | null;
  sentimentScore: number | null;
  hubspotDealId: string | null;
  hubspotStageId: string | null;
  closedAt: string | null;
  createdAt: string;
  contactId: string | null;
  contactEmail: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  companyId: string | null;
  companyName: string | null;
  companyDomain: string | null;
}

interface QueueItem {
  id: string;
  contactEmail: string | null;
  contactName: string | null;
  contactLinkedinUrl: string | null;
  companyName: string | null;
  source: string;
  sourceChannel: string;
  sourceCampaignName: string | null;
  messageText: string | null;
  sentiment: string | null;
  sentimentScore: number | null;
  status: string;
  createdAt: string;
}

interface Column {
  stage: Stage;
  deals: Deal[];
}

const KANBAN_LIMIT = 50;

function sourceIcon(source: string, channel: string | null) {
  if (channel === "linkedin" || source === "linkedin_auto") return <Linkedin className="h-3 w-3 text-blue-600" />;
  if (channel === "instantly" || source === "instantly_auto") return <Mail className="h-3 w-3 text-orange-500" />;
  if (source === "hubspot_sync") return <Globe className="h-3 w-3 text-[#ff7a59]" />;
  return <Globe className="h-3 w-3 text-cos-slate" />;
}

function priorityBadge(priority: string) {
  if (priority === "urgent") return <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-semibold text-red-700 uppercase">Urgent</span>;
  if (priority === "high") return <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700 uppercase">High</span>;
  return null;
}

function daysInStage(createdAt: string, lastActivity: string | null) {
  const ref = lastActivity ? new Date(lastActivity) : new Date(createdAt);
  const days = Math.floor((Date.now() - ref.getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "1d";
  return `${days}d`;
}

export default function PipelinePage() {
  const router = useRouter();
  const [stages, setStages] = useState<Stage[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingDeals, setLoadingDeals] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ dealId: string; fromStageId: string } | null>(null);
  const [view, setView] = useState<"kanban" | "table">("kanban");
  const [tableStageFilter, setTableStageFilter] = useState<string | "all">("all");

  // Queue state
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [showQueue, setShowQueue] = useState(false);
  const [queueLoading, setQueueLoading] = useState(false);

  // New deal modal
  const [showNewDeal, setShowNewDeal] = useState(false);
  const [newDealForm, setNewDealForm] = useState({ name: "", dealValue: "", stageId: "", priority: "normal", source: "manual", notes: "" });
  const [creatingDeal, setCreatingDeal] = useState(false);
  const [dealSources, setDealSources] = useState<{ key: string; label: string }[]>([]);

  const loadData = useCallback(async (isInitial = false) => {
    try {
      setLoadingDeals(true);
      setError(null);
      const res = await fetch("/api/admin/growth-ops/pipeline?action=getDeals");
      const data = await res.json();
      if (data.error) { setError(data.error); return; }

      const s: Stage[] = data.stages ?? [];
      const d: Deal[] = data.deals ?? [];
      setStages(s);

      // Build columns
      const cols: Column[] = s
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((stage) => ({
          stage,
          deals: d.filter((deal) => deal.stageId === stage.id),
        }));

      // Deals without a stage go in a special "Unassigned" bucket
      const unassigned = d.filter((deal) => !deal.stageId);
      if (unassigned.length > 0 && s.length > 0) {
        cols[0] = { ...cols[0], deals: [...unassigned, ...cols[0].deals] };
      }

      setColumns(cols);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadingDeals(false);
      if (isInitial) setInitialLoading(false);
    }
  }, []);

  const loadQueue = useCallback(async () => {
    try {
      setQueueLoading(true);
      const res = await fetch("/api/admin/growth-ops/pipeline/queue?status=pending");
      const data = await res.json();
      setQueueItems(data.items ?? []);
    } catch {
      // silent
    } finally {
      setQueueLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(true);
    loadQueue();
    fetch("/api/admin/growth-ops/pipeline?action=getDealSources")
      .then((r) => r.json())
      .then((d) => setDealSources(d.sources ?? []))
      .catch(() => {});
  }, [loadData, loadQueue]);

  async function handleDrop(toStageId: string) {
    if (!dragging || dragging.fromStageId === toStageId) { setDragging(null); return; }
    const { dealId, fromStageId } = dragging;
    setDragging(null);

    // Optimistic update
    setColumns((prev) =>
      prev.map((col) => {
        if (col.stage.id === fromStageId) return { ...col, deals: col.deals.filter((d) => d.id !== dealId) };
        if (col.stage.id === toStageId) {
          const deal = prev.find((c) => c.stage.id === fromStageId)?.deals.find((d) => d.id === dealId);
          if (!deal) return col;
          return { ...col, deals: [...col.deals, { ...deal, stageId: toStageId, stageLabel: col.stage.label }] };
        }
        return col;
      })
    );

    await fetch("/api/admin/growth-ops/pipeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "moveDeal", dealId, stageId: toStageId }),
    });
  }

  async function handleQueueAction(queueId: string, action: "approve" | "reject") {
    try {
      await fetch("/api/admin/growth-ops/pipeline/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, queueId }),
      });
      setQueueItems((prev) => prev.filter((i) => i.id !== queueId));
      if (action === "approve") await loadData();
    } catch {
      // silent
    }
  }

  async function handleCreateDeal() {
    setCreatingDeal(true);
    try {
      await fetch("/api/admin/growth-ops/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "createDeal",
          name: newDealForm.name || "New Deal",
          dealValue: newDealForm.dealValue || null,
          stageId: newDealForm.stageId || stages[0]?.id || null,
          priority: newDealForm.priority,
          source: newDealForm.source,
          notes: newDealForm.notes || null,
        }),
      });
      setShowNewDeal(false);
      setNewDealForm({ name: "", dealValue: "", stageId: "", priority: "normal", source: "manual", notes: "" });
      await loadData();
    } catch {
      // silent
    } finally {
      setCreatingDeal(false);
    }
  }

  function switchToTableForStage(stageId: string) {
    setTableStageFilter(stageId);
    setView("table");
  }

  const totalDeals = columns.reduce((n, c) => n + c.deals.length, 0);
  const tableDeals = columns.flatMap((col) =>
    col.deals.map((deal) => ({ ...deal, _stageLabel: col.stage.label, _stageOrder: col.stage.displayOrder, _stageColor: col.stage.color }))
  );
  const filteredTableDeals = tableStageFilter === "all"
    ? tableDeals
    : tableDeals.filter((d) => d.stageId === tableStageFilter);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-cos-midnight">Pipeline</h1>
          <p className="text-sm text-cos-slate mt-1">
            {view === "kanban" ? "Drag and drop to move deals between stages." : "All deals in table format."}
            {totalDeals > 0 && <span className="ml-2 text-cos-slate-dim">({totalDeals.toLocaleString()} total deals)</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* New Deal */}
          <button
            onClick={() => setShowNewDeal(true)}
            className="flex items-center gap-1.5 rounded-cos-lg bg-cos-electric px-3 py-2 text-xs font-medium text-white hover:bg-cos-electric-hover transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> New Deal
          </button>

          {/* Settings */}
          <Link
            href="/admin/growth-ops/pipeline/settings"
            className="flex items-center gap-1.5 rounded-cos-lg border border-cos-border bg-white px-3 py-2 text-sm text-cos-slate hover:text-cos-midnight transition-colors"
          >
            <Settings className="h-3.5 w-3.5" />
          </Link>

          {/* Queue badge */}
          {queueItems.length > 0 && (
            <button
              onClick={() => setShowQueue(!showQueue)}
              className={`relative flex items-center gap-1.5 rounded-cos-lg border px-3 py-2 text-xs font-medium transition-colors ${showQueue ? "border-cos-electric bg-cos-electric/5 text-cos-electric" : "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"}`}
            >
              <Bell className="h-3.5 w-3.5" />
              {queueItems.length} pending
            </button>
          )}

          {/* View toggle */}
          <div className="flex rounded-cos-lg border border-cos-border bg-white overflow-hidden">
            <button
              onClick={() => setView("kanban")}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${view === "kanban" ? "bg-cos-electric text-white" : "text-cos-slate hover:text-cos-midnight"}`}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Kanban
            </button>
            <button
              onClick={() => { setView("table"); setTableStageFilter("all"); }}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${view === "table" ? "bg-cos-electric text-white" : "text-cos-slate hover:text-cos-midnight"}`}
            >
              <Table2 className="h-3.5 w-3.5" /> Table
            </button>
          </div>

          <button
            onClick={() => loadData()}
            disabled={loadingDeals}
            className="flex items-center gap-1.5 rounded-cos-lg border border-cos-border bg-white px-3 py-2 text-sm text-cos-slate hover:text-cos-midnight disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingDeals ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-cos-lg bg-red-50 border border-red-200 px-4 py-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-700">Failed to load pipeline data</p>
            <p className="text-xs text-red-600 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Approval Queue Panel */}
      {showQueue && queueItems.length > 0 && (
        <div className="mb-4 rounded-cos-xl border border-amber-200 bg-amber-50/50 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-amber-800 flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Pending Deal Approvals ({queueItems.length})
            </h2>
            <button onClick={() => setShowQueue(false)} className="text-amber-600 hover:text-amber-800">
              <X className="h-4 w-4" />
            </button>
          </div>
          {queueLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-amber-600 mx-auto" />
          ) : (
            <div className="space-y-2">
              {queueItems.map((item) => (
                <div key={item.id} className="flex items-center gap-3 rounded-cos-lg bg-white border border-amber-200 p-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {sourceIcon(item.source, item.sourceChannel)}
                      <span className="text-sm font-medium text-cos-midnight truncate">
                        {item.contactName || item.contactEmail || item.contactLinkedinUrl || "Unknown"}
                      </span>
                      {item.companyName && (
                        <span className="text-xs text-cos-slate">at {item.companyName}</span>
                      )}
                    </div>
                    {item.messageText && (
                      <p className="text-xs text-cos-slate mt-1 truncate">&ldquo;{item.messageText.slice(0, 120)}&rdquo;</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      {item.sourceCampaignName && (
                        <span className="text-[10px] text-cos-slate-dim">Campaign: {item.sourceCampaignName}</span>
                      )}
                      {item.sentiment && (
                        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${item.sentiment === "positive" ? "bg-emerald-100 text-emerald-700" : item.sentiment === "negative" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"}`}>
                          {item.sentiment}
                        </span>
                      )}
                      <span className="text-[10px] text-cos-slate-dim">
                        {new Date(item.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleQueueAction(item.id, "approve")}
                      className="flex items-center gap-1 rounded-cos-lg bg-emerald-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-600 transition-colors"
                    >
                      <Check className="h-3 w-3" /> Approve
                    </button>
                    <button
                      onClick={() => handleQueueAction(item.id, "reject")}
                      className="flex items-center gap-1 rounded-cos-lg border border-cos-border bg-white px-2.5 py-1.5 text-xs font-medium text-cos-slate hover:text-red-600 hover:border-red-200 transition-colors"
                    >
                      <X className="h-3 w-3" /> Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* New Deal Modal */}
      {showNewDeal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowNewDeal(false)}>
          <div className="w-full max-w-md rounded-cos-xl border border-cos-border bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-cos-midnight">New Deal</h2>
              <button onClick={() => setShowNewDeal(false)}><X className="h-4 w-4 text-cos-slate" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-cos-slate mb-1 block">Deal Name</label>
                <input
                  type="text"
                  value={newDealForm.name}
                  onChange={(e) => setNewDealForm({ ...newDealForm, name: e.target.value })}
                  placeholder="e.g. Acme Corp - Enterprise Plan"
                  className="w-full rounded-cos-lg border border-cos-border px-3 py-2 text-sm focus:border-cos-electric focus:outline-none"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-cos-slate mb-1 block">Value ($)</label>
                  <input
                    type="number"
                    value={newDealForm.dealValue}
                    onChange={(e) => setNewDealForm({ ...newDealForm, dealValue: e.target.value })}
                    placeholder="0"
                    className="w-full rounded-cos-lg border border-cos-border px-3 py-2 text-sm focus:border-cos-electric focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-cos-slate mb-1 block">Priority</label>
                  <select
                    value={newDealForm.priority}
                    onChange={(e) => setNewDealForm({ ...newDealForm, priority: e.target.value })}
                    className="w-full rounded-cos-lg border border-cos-border px-3 py-2 text-sm focus:border-cos-electric focus:outline-none"
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-cos-slate mb-1 block">Stage</label>
                  <select
                    value={newDealForm.stageId}
                    onChange={(e) => setNewDealForm({ ...newDealForm, stageId: e.target.value })}
                    className="w-full rounded-cos-lg border border-cos-border px-3 py-2 text-sm focus:border-cos-electric focus:outline-none"
                  >
                    <option value="">First stage</option>
                    {stages.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-cos-slate mb-1 block">Source</label>
                  <select
                    value={newDealForm.source}
                    onChange={(e) => setNewDealForm({ ...newDealForm, source: e.target.value })}
                    className="w-full rounded-cos-lg border border-cos-border px-3 py-2 text-sm focus:border-cos-electric focus:outline-none"
                  >
                    {dealSources.length > 0
                      ? dealSources.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)
                      : <>
                          <option value="manual">Manual</option>
                          <option value="hubspot_sync">HubSpot Sync</option>
                          <option value="linkedin_auto">LinkedIn Auto</option>
                          <option value="instantly_auto">Instantly Auto</option>
                        </>
                    }
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-cos-slate mb-1 block">Notes</label>
                <textarea
                  value={newDealForm.notes}
                  onChange={(e) => setNewDealForm({ ...newDealForm, notes: e.target.value })}
                  rows={2}
                  placeholder="Optional notes..."
                  className="w-full rounded-cos-lg border border-cos-border px-3 py-2 text-sm focus:border-cos-electric focus:outline-none resize-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-4">
              <button onClick={() => setShowNewDeal(false)} className="rounded-cos-lg border border-cos-border px-4 py-2 text-xs font-medium text-cos-slate hover:text-cos-midnight transition-colors">
                Cancel
              </button>
              <button
                onClick={handleCreateDeal}
                disabled={creatingDeal || !newDealForm.name.trim()}
                className="flex items-center gap-1.5 rounded-cos-lg bg-cos-electric px-4 py-2 text-xs font-medium text-white hover:bg-cos-electric-hover disabled:opacity-50 transition-colors"
              >
                {creatingDeal ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                Create Deal
              </button>
            </div>
          </div>
        </div>
      )}

      {initialLoading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-cos-electric" />
          <p className="text-sm text-cos-slate">Loading pipeline&hellip;</p>
        </div>
      ) : !error && stages.length === 0 ? (
        <div className="rounded-cos-xl border border-dashed border-cos-border bg-white p-12 text-center">
          <p className="text-sm font-medium text-cos-slate">No pipeline stages configured</p>
          <p className="text-xs text-cos-slate mt-1">Run the pipeline seed script to import stages.</p>
        </div>
      ) : !error && view === "kanban" ? (
        <>
          <div className="flex gap-4 overflow-x-auto pb-2" style={{ height: "calc(100vh - 260px)" }}>
            {columns.map((col) => {
              const shown = col.deals.slice(0, KANBAN_LIMIT);
              const overflow = col.deals.length - KANBAN_LIMIT;
              return (
                <div
                  key={col.stage.id}
                  className="w-72 shrink-0 flex flex-col"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(col.stage.id)}
                >
                  <div className="mb-2 flex items-center justify-between px-1 shrink-0">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full" style={{ backgroundColor: col.stage.color }} />
                      <p className="text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">{col.stage.label}</p>
                    </div>
                    <span className="rounded-full bg-cos-cloud text-cos-slate text-[10px] font-medium px-2 py-0.5">{col.deals.length.toLocaleString()}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-2 rounded-cos-xl bg-cos-cloud/50 p-2">
                    {loadingDeals ? (
                      <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-cos-electric opacity-50" /></div>
                    ) : shown.map((deal) => (
                      <Link
                        key={deal.id}
                        href={`/admin/growth-ops/pipeline/${deal.id}`}
                        draggable
                        onDragStart={(e) => { e.stopPropagation(); setDragging({ dealId: deal.id, fromStageId: col.stage.id }); }}
                        className="block cursor-grab rounded-cos-lg border border-cos-border bg-white p-3 shadow-sm hover:border-cos-electric/30 transition-colors active:cursor-grabbing group"
                      >
                        <div className="flex items-start justify-between gap-1">
                          <p className="text-xs font-medium text-cos-midnight truncate flex-1">{deal.name}</p>
                          <ChevronRight className="h-3 w-3 text-cos-slate-dim opacity-0 group-hover:opacity-100 shrink-0 mt-0.5" />
                        </div>
                        {deal.companyName && (
                          <p className="text-[10px] text-cos-slate mt-0.5 truncate">{deal.companyName}</p>
                        )}
                        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                          {sourceIcon(deal.source, deal.sourceChannel)}
                          {deal.dealValue && (
                            <span className="flex items-center gap-0.5 text-[10px] text-cos-signal font-medium">
                              <DollarSign className="h-2.5 w-2.5" />
                              {Number(deal.dealValue).toLocaleString()}
                            </span>
                          )}
                          {priorityBadge(deal.priority)}
                          <span className="text-[10px] text-cos-slate-dim ml-auto">{daysInStage(deal.createdAt, deal.lastActivityAt)}</span>
                        </div>
                      </Link>
                    ))}
                    {overflow > 0 && (
                      <button
                        onClick={() => switchToTableForStage(col.stage.id)}
                        className="w-full rounded-cos-lg border border-dashed border-cos-border bg-white/70 px-3 py-2.5 text-center hover:bg-white hover:border-cos-electric/40 transition-colors group"
                      >
                        <span className="text-xs font-medium text-cos-electric group-hover:underline">
                          View all {col.deals.length.toLocaleString()} deals
                        </span>
                        <span className="block text-[10px] text-cos-slate mt-0.5">
                          +{overflow.toLocaleString()} more not shown
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : !error && view === "table" ? (
        <div>
          <div className="mb-4 flex items-center gap-2">
            <label className="text-xs font-semibold text-cos-slate-dim uppercase tracking-wider">Stage:</label>
            <select
              value={tableStageFilter}
              onChange={(e) => setTableStageFilter(e.target.value)}
              className="rounded-cos-lg border border-cos-border bg-white px-3 py-1.5 text-sm focus:border-cos-electric focus:outline-none"
            >
              <option value="all">All stages ({totalDeals.toLocaleString()})</option>
              {columns.map((col) => (
                <option key={col.stage.id} value={col.stage.id}>
                  {col.stage.label} ({col.deals.length.toLocaleString()})
                </option>
              ))}
            </select>
            <span className="text-xs text-cos-slate ml-2">
              Showing {filteredTableDeals.length.toLocaleString()} deals
            </span>
          </div>

          <div className="rounded-cos-xl border border-cos-border bg-white shadow-sm overflow-hidden">
            <div className="max-h-[calc(100vh-310px)] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-cos-border bg-cos-cloud">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">Deal</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">Company</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">Stage</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">Source</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">Priority</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">Activity</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTableDeals.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-cos-slate">No deals found.</td></tr>
                  )}
                  {filteredTableDeals.map((deal) => (
                    <tr key={deal.id} className="border-b border-cos-border/50 last:border-0 hover:bg-cos-cloud/30 transition-colors cursor-pointer" onClick={() => router.push(`/admin/growth-ops/pipeline/${deal.id}`)}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-cos-midnight">{deal.name}</p>
                        {deal.contactEmail && <p className="text-[10px] text-cos-slate mt-0.5">{deal.contactEmail}</p>}
                      </td>
                      <td className="px-4 py-3 text-cos-slate">{deal.companyName || <span className="text-cos-slate-dim">&mdash;</span>}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: deal._stageColor + "1a", color: deal._stageColor }}>
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: deal._stageColor }} />
                          {deal._stageLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3">{sourceIcon(deal.source, deal.sourceChannel)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {deal.dealValue
                          ? <span className="text-cos-signal font-medium">${Number(deal.dealValue).toLocaleString()}</span>
                          : <span className="text-cos-slate-dim">&mdash;</span>}
                      </td>
                      <td className="px-4 py-3">{priorityBadge(deal.priority) || <span className="text-xs text-cos-slate-dim">Normal</span>}</td>
                      <td className="px-4 py-3 text-xs text-cos-slate">{daysInStage(deal.createdAt, deal.lastActivityAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
