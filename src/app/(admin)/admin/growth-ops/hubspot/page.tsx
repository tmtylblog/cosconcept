"use client";

import { useEffect, useState } from "react";
import { Loader2, DollarSign, RefreshCw } from "lucide-react";

interface Pipeline { id: string; label: string; stages: Stage[]; }
interface Stage { id: string; label: string; displayOrder: number; }
interface Deal { id: string; properties: { dealname: string; dealstage: string; pipeline: string; amount?: string; closedate?: string; }; }

interface Column { stageId: string; label: string; order: number; deals: Deal[]; }

export default function HubSpotPage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipeline, setSelectedPipeline] = useState<string>("");
  const [columns, setColumns] = useState<Column[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDeals, setLoadingDeals] = useState(false);
  const [dragging, setDragging] = useState<{ dealId: string; fromStage: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/growth-ops/hubspot?action=listPipelines")
      .then((r) => r.json())
      .then((d) => {
        const pips: Pipeline[] = d.results ?? d.pipelines ?? [];
        setPipelines(pips);
        if (pips.length > 0) setSelectedPipeline(pips[0].id);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!selectedPipeline) return;
    setLoadingDeals(true);
    const pipeline = pipelines.find((p) => p.id === selectedPipeline);
    if (!pipeline) return;

    fetch(`/api/admin/growth-ops/hubspot?action=getAllDeals&pipelineId=${selectedPipeline}`)
      .then((r) => r.json())
      .then((d) => {
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
      });
  }, [selectedPipeline, pipelines]);

  async function handleDrop(stageId: string) {
    if (!dragging || dragging.fromStage === stageId) { setDragging(null); return; }
    const { dealId, fromStage } = dragging;
    setDragging(null);

    // Optimistic update
    setColumns((prev) => prev.map((col) => {
      if (col.stageId === fromStage) return { ...col, deals: col.deals.filter((d) => d.id !== dealId) };
      if (col.stageId === stageId) {
        const deal = prev.find((c) => c.stageId === fromStage)?.deals.find((d) => d.id === dealId);
        if (!deal) return col;
        const updated = { ...deal, properties: { ...deal.properties, dealstage: stageId } };
        return { ...col, deals: [...col.deals, updated] };
      }
      return col;
    }));

    await fetch("/api/admin/growth-ops/hubspot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "updateDealStage", dealId, stageId }),
    });
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-cos-midnight">HubSpot Pipeline</h1>
          <p className="text-sm text-cos-slate mt-1">Drag and drop to move deals between stages.</p>
        </div>
        {pipelines.length > 1 && (
          <select value={selectedPipeline} onChange={(e) => setSelectedPipeline(e.target.value)} className="rounded-cos-lg border border-cos-border bg-white px-3 py-2 text-sm focus:border-cos-electric focus:outline-none">
            {pipelines.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        )}
      </div>

      {loading || loadingDeals ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-cos-electric" /></div>
      ) : (
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
                <span className="rounded-cos-full bg-cos-cloud text-cos-slate text-[10px] font-medium px-2 py-0.5">{col.deals.length}</span>
              </div>
              <div className="space-y-2 min-h-[200px] rounded-cos-xl bg-cos-cloud/50 p-2">
                {col.deals.map((deal) => (
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
      )}
    </div>
  );
}
