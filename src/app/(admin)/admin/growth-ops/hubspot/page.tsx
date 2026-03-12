"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, DollarSign, AlertCircle, RefreshCw, Play } from "lucide-react";

interface Pipeline { id: string; label: string; stages: Stage[]; }
interface Stage { id: string; label: string; displayOrder: number; }
interface Deal { id: string; properties: { dealname: string; dealstage: string; pipeline: string; amount?: string; closedate?: string; }; }
interface Column { stageId: string; label: string; order: number; deals: Deal[]; }

export default function HubSpotPage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipeline, setSelectedPipeline] = useState("");
  const [columns, setColumns] = useState<Column[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDeals, setLoadingDeals] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ dealId: string; fromStage: string } | null>(null);

  // Load pipelines
  useEffect(() => {
    fetch("/api/admin/growth-ops/hubspot?action=listPipelines")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(`HubSpot error: ${d.error}`); setLoading(false); return; }
        const pips: Pipeline[] = d.results ?? d.pipelines ?? [];
        setPipelines(pips);
        if (pips.length > 0) setSelectedPipeline(pips[0].id);
        setLoading(false);
      })
      .catch((e) => { setError(String(e)); setLoading(false); });
  }, []);

  // Load deals when pipeline changes
  const loadDeals = useCallback((pipelineId: string, pipelineList: Pipeline[]) => {
    if (!pipelineId) return;
    const pipeline = pipelineList.find((p) => p.id === pipelineId);
    if (!pipeline) return;
    setLoadingDeals(true);
    setError(null);
    fetch(`/api/admin/growth-ops/hubspot?action=getAllDeals&pipelineId=${pipelineId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(`Deals error: ${d.error}`); setLoadingDeals(false); return; }
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
      })
      .catch((e) => { setError(String(e)); setLoadingDeals(false); });
  }, []);

  useEffect(() => {
    if (selectedPipeline && pipelines.length > 0) {
      loadDeals(selectedPipeline, pipelines);
    }
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

  const totalDeals = columns.reduce((n, c) => n + c.deals.length, 0);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-cos-midnight">HubSpot Pipeline</h1>
          <p className="text-sm text-cos-slate mt-1">Drag and drop to move deals between stages.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
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

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-cos-electric" /></div>
      ) : !error && columns.length === 0 ? (
        <div className="rounded-cos-xl border border-dashed border-cos-border bg-white p-12 text-center">
          <p className="text-sm font-medium text-cos-slate">No pipeline stages found</p>
          <p className="text-xs text-cos-slate mt-1">Make sure your HubSpot Private App has <code className="bg-cos-cloud px-1 rounded">crm.schemas.deals.read</code> scope.</p>
        </div>
      ) : !error && (
        <>
          {totalDeals === 0 && !loadingDeals && (
            <div className="mb-4 rounded-cos-lg bg-amber-50 border border-amber-200 px-4 py-2.5 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
              <p className="text-sm text-amber-700">
                Pipeline loaded but no deals found. Click <strong>Sync from HubSpot</strong> to pull your deals.
              </p>
            </div>
          )}
          <div className="flex gap-4 overflow-x-auto pb-4">
            {columns.map((col) => (
              <div
                key={col.stageId}
                className="w-64 shrink-0"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(col.stageId)}
              >
                <div className="mb-2 flex items-center justify-between px-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">{col.label}</p>
                  <span className="rounded-full bg-cos-cloud text-cos-slate text-[10px] font-medium px-2 py-0.5">{col.deals.length}</span>
                </div>
                <div className="space-y-2 min-h-[200px] rounded-cos-xl bg-cos-cloud/50 p-2">
                  {loadingDeals ? (
                    <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-cos-electric opacity-50" /></div>
                  ) : col.deals.map((deal) => (
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
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
