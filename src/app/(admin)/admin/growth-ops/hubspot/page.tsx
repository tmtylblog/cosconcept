"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, DollarSign, AlertCircle, RefreshCw, Play, LayoutGrid, Table2 } from "lucide-react";

interface Pipeline { id: string; label: string; stages: Stage[]; }
interface Stage { id: string; label: string; displayOrder: number; }
interface Deal { id: string; properties: { dealname: string; dealstage: string; pipeline: string; amount?: string; closedate?: string; }; }
interface Column { stageId: string; label: string; order: number; deals: Deal[]; }

const KANBAN_LIMIT = 50;

export default function HubSpotPage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipeline, setSelectedPipeline] = useState("");
  const [columns, setColumns] = useState<Column[]>([]);
  const [initialLoading, setInitialLoading] = useState(true); // true until first deals load
  const [loadingDeals, setLoadingDeals] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ dealId: string; fromStage: string } | null>(null);
  const [view, setView] = useState<"kanban" | "table">("kanban");
  const [tableStageFilter, setTableStageFilter] = useState<string | "all">("all");

  // Load pipelines
  useEffect(() => {
    fetch("/api/admin/growth-ops/hubspot?action=listPipelines")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(`HubSpot error: ${d.error}`); setInitialLoading(false); return; }
        const pips: Pipeline[] = d.results ?? d.pipelines ?? [];
        setPipelines(pips);
        const selfSignUp = pips.find((p) =>
          p.label?.toLowerCase().replace(/[^a-z]/g, "").includes("selfsignup") ||
          p.label?.toLowerCase().includes("self") ||
          p.label?.toLowerCase().includes("sign up") ||
          p.label?.toLowerCase().includes("signup")
        );
        if (selfSignUp) setSelectedPipeline(selfSignUp.id);
        else if (pips.length > 0) setSelectedPipeline(pips[0].id);
        // Don't clear initialLoading here — wait for deals
        if (pips.length === 0) setInitialLoading(false);
      })
      .catch((e) => { setError(String(e)); setInitialLoading(false); });
  }, []);

  // Load deals when pipeline changes
  const loadDeals = useCallback((pipelineId: string, pipelineList: Pipeline[], isInitial = false) => {
    if (!pipelineId) return;
    const pipeline = pipelineList.find((p) => p.id === pipelineId);
    if (!pipeline) return;
    setLoadingDeals(true);
    setError(null);
    fetch(`/api/admin/growth-ops/hubspot?action=getAllDeals&pipelineId=${pipelineId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(`Deals error: ${d.error}`); setLoadingDeals(false); if (isInitial) setInitialLoading(false); return; }
        const deals: Deal[] = d.deals ?? [];
        const cols: Column[] = (pipeline.stages ?? [])
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((stage) => ({
            stageId: stage.id,
            label: stage.label,
            order: stage.displayOrder,
            deals: deals.filter((deal) => deal.properties.dealstage === stage.id),
          }));
        setColumns(cols);
        setLoadingDeals(false);
        if (isInitial) setInitialLoading(false);
      })
      .catch((e) => { setError(String(e)); setLoadingDeals(false); if (isInitial) setInitialLoading(false); });
  }, []);

  useEffect(() => {
    if (selectedPipeline && pipelines.length > 0) {
      loadDeals(selectedPipeline, pipelines, initialLoading);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPipeline, pipelines, loadDeals]);

  async function runSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const d = await fetch("/api/admin/growth-ops/hubspot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "runSync" }),
      }).then((r) => r.json());
      setSyncMsg(d.error ? `Error: ${d.error}` : `Synced — ${d.companiesUpserted ?? 0} companies, ${d.contactsUpserted ?? 0} contacts, ${d.dealsUpserted ?? 0} deals`);
      if (!d.error) loadDeals(selectedPipeline, pipelines);
    } catch (e) {
      setSyncMsg(String(e));
    }
    setSyncing(false);
  }

  async function handleDrop(stageId: string) {
    if (!dragging || dragging.fromStage === stageId) { setDragging(null); return; }
    const { dealId, fromStage } = dragging;
    setDragging(null);
    setColumns((prev) => prev.map((col) => {
      if (col.stageId === fromStage) return { ...col, deals: col.deals.filter((d) => d.id !== dealId) };
      if (col.stageId === stageId) {
        const deal = prev.find((c) => c.stageId === fromStage)?.deals.find((d) => d.id === dealId);
        if (!deal) return col;
        return { ...col, deals: [...col.deals, { ...deal, properties: { ...deal.properties, dealstage: stageId } }] };
      }
      return col;
    }));
    await fetch("/api/admin/growth-ops/hubspot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "updateDealStage", dealId, stageId }),
    });
  }

  function switchToTableForStage(stageId: string) {
    setTableStageFilter(stageId);
    setView("table");
  }

  const totalDeals = columns.reduce((n, c) => n + c.deals.length, 0);

  // Flat deal list for table view
  const tableDeals = columns.flatMap((col) =>
    col.deals.map((deal) => ({ ...deal, stageLabel: col.label, stageOrder: col.order }))
  );
  const filteredTableDeals = tableStageFilter === "all"
    ? tableDeals
    : tableDeals.filter((d) => d.properties.dealstage === tableStageFilter);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-cos-midnight">HubSpot Pipeline</h1>
          <p className="text-sm text-cos-slate mt-1">
            {view === "kanban" ? "Drag and drop to move deals between stages." : "All deals in table format."}
            {totalDeals > 0 && <span className="ml-2 text-cos-slate-dim">({totalDeals.toLocaleString()} total deals)</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
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
          {pipelines.length > 1 && (
            <select
              value={selectedPipeline}
              onChange={(e) => setSelectedPipeline(e.target.value)}
              className="rounded-cos-lg border border-cos-border bg-white px-3 py-2 text-sm focus:border-cos-electric focus:outline-none"
            >
              {pipelines.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          )}
          <button
            onClick={() => loadDeals(selectedPipeline, pipelines)}
            disabled={loadingDeals}
            className="flex items-center gap-1.5 rounded-cos-lg border border-cos-border bg-white px-3 py-2 text-sm text-cos-slate hover:text-cos-midnight disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingDeals ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={runSync}
            disabled={syncing}
            className="flex items-center gap-1.5 rounded-cos-lg bg-cos-electric px-3 py-2 text-sm font-medium text-white hover:bg-cos-electric-hover disabled:opacity-50 transition-colors"
          >
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Sync from HubSpot
          </button>
        </div>
      </div>

      {/* Sync result */}
      {syncMsg && (
        <div className={`mb-4 rounded-cos-lg px-4 py-2.5 text-sm flex items-center gap-2 ${syncMsg.startsWith("Error") ? "bg-red-50 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
          {syncMsg.startsWith("Error") ? <AlertCircle className="h-4 w-4 shrink-0" /> : <RefreshCw className="h-4 w-4 shrink-0" />}
          {syncMsg}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-cos-lg bg-red-50 border border-red-200 px-4 py-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-700">Failed to load HubSpot data</p>
            <p className="text-xs text-red-600 mt-0.5">{error}</p>
            <p className="text-xs text-red-500 mt-1">Check that HUBSPOT_ACCESS_TOKEN is set and the Private App has the required CRM scopes.</p>
          </div>
        </div>
      )}

      {initialLoading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-cos-electric" />
          <p className="text-sm text-cos-slate">Loading pipeline&hellip;</p>
        </div>
      ) : !error && columns.length === 0 ? (
        <div className="rounded-cos-xl border border-dashed border-cos-border bg-white p-12 text-center">
          <p className="text-sm font-medium text-cos-slate">No pipeline stages found</p>
          <p className="text-xs text-cos-slate mt-1">Make sure your HubSpot Private App has <code className="bg-cos-cloud px-1 rounded">crm.schemas.deals.read</code> scope.</p>
        </div>
      ) : !error && view === "kanban" ? (
        <>
          {totalDeals === 0 && !loadingDeals && (
            <div className="mb-4 rounded-cos-lg bg-amber-50 border border-amber-200 px-4 py-2.5 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
              <p className="text-sm text-amber-700">
                Pipeline loaded but no deals found. Click <strong>Sync from HubSpot</strong> to pull your deals.
              </p>
            </div>
          )}
          <div className="flex gap-4 overflow-x-auto pb-2" style={{ height: "calc(100vh - 230px)" }}>
            {columns.map((col) => {
              const shown = col.deals.slice(0, KANBAN_LIMIT);
              const overflow = col.deals.length - KANBAN_LIMIT;
              return (
                <div
                  key={col.stageId}
                  className="w-64 shrink-0 flex flex-col"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(col.stageId)}
                >
                  <div className="mb-2 flex items-center justify-between px-1 shrink-0">
                    <p className="text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">{col.label}</p>
                    <span className="rounded-full bg-cos-cloud text-cos-slate text-[10px] font-medium px-2 py-0.5">{col.deals.length.toLocaleString()}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-2 rounded-cos-xl bg-cos-cloud/50 p-2">
                    {loadingDeals ? (
                      <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-cos-electric opacity-50" /></div>
                    ) : shown.map((deal) => (
                      <div
                        key={deal.id}
                        draggable
                        onDragStart={() => setDragging({ dealId: deal.id, fromStage: col.stageId })}
                        className="cursor-grab rounded-cos-lg border border-cos-border bg-white p-3 shadow-sm hover:border-cos-electric/30 transition-colors active:cursor-grabbing"
                      >
                        <p className="text-xs font-medium text-cos-midnight truncate">{deal.properties.dealname}</p>
                        {deal.properties.amount && (
                          <p className="mt-1 flex items-center gap-1 text-[10px] text-cos-signal">
                            <DollarSign className="h-3 w-3" />
                            {Number(deal.properties.amount).toLocaleString()}
                          </p>
                        )}
                      </div>
                    ))}
                    {overflow > 0 && (
                      <button
                        onClick={() => switchToTableForStage(col.stageId)}
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
          {/* Stage filter */}
          <div className="mb-4 flex items-center gap-2">
            <label className="text-xs font-semibold text-cos-slate-dim uppercase tracking-wider">Stage:</label>
            <select
              value={tableStageFilter}
              onChange={(e) => setTableStageFilter(e.target.value)}
              className="rounded-cos-lg border border-cos-border bg-white px-3 py-1.5 text-sm focus:border-cos-electric focus:outline-none"
            >
              <option value="all">All stages ({totalDeals.toLocaleString()})</option>
              {columns.map((col) => (
                <option key={col.stageId} value={col.stageId}>
                  {col.label} ({col.deals.length.toLocaleString()})
                </option>
              ))}
            </select>
            <span className="text-xs text-cos-slate ml-2">
              Showing {filteredTableDeals.length.toLocaleString()} deals
            </span>
          </div>

          {/* Table */}
          <div className="rounded-cos-xl border border-cos-border bg-white shadow-sm overflow-hidden">
            <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-cos-border bg-cos-cloud">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">Deal name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">Stage</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">Close date</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTableDeals.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-cos-slate">No deals in this stage.</td></tr>
                  )}
                  {filteredTableDeals.map((deal) => (
                    <tr key={deal.id} className="border-b border-cos-border/50 last:border-0 hover:bg-cos-cloud/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-cos-midnight">{deal.properties.dealname}</td>
                      <td className="px-4 py-3">
                        <span className="inline-block rounded-full bg-cos-electric/10 px-2.5 py-0.5 text-xs font-medium text-cos-electric">
                          {deal.stageLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-cos-slate">
                        {deal.properties.amount
                          ? <span className="text-cos-signal font-medium">${Number(deal.properties.amount).toLocaleString()}</span>
                          : <span className="text-cos-slate-dim">&mdash;</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-cos-slate">
                        {deal.properties.closedate
                          ? new Date(deal.properties.closedate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                          : <span className="text-cos-slate-dim">&mdash;</span>}
                      </td>
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
