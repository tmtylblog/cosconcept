"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Stage {
  id: string;
  label: string;
  displayOrder: number;
}

export default function NewDealPage() {
  const router = useRouter();
  const [stages, setStages] = useState<Stage[]>([]);
  const [dealSources, setDealSources] = useState<{ key: string; label: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [dealValue, setDealValue] = useState("");
  const [priority, setPriority] = useState("normal");
  const [stageId, setStageId] = useState("");
  const [source, setSource] = useState("manual");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    fetch("/api/admin/growth-ops/pipeline?action=getStages")
      .then((r) => r.json())
      .then((d) => {
        const s = (d.stages ?? []).sort((a: Stage, b: Stage) => a.displayOrder - b.displayOrder);
        setStages(s);
      })
      .catch(() => {});
    fetch("/api/admin/growth-ops/pipeline?action=getDealSources")
      .then((r) => r.json())
      .then((d) => setDealSources(d.sources ?? []))
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/growth-ops/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "createDeal",
          name: name.trim(),
          dealValue: dealValue || null,
          stageId: stageId || stages[0]?.id || null,
          priority,
          source,
          notes: notes || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create deal");
      }
      const data = await res.json();
      router.push(data.dealId ? `/admin/growth-ops/pipeline/${data.dealId}` : "/admin/growth-ops/pipeline");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create deal");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto">
      <Link href="/admin/growth-ops/pipeline" className="flex items-center gap-1.5 text-sm text-cos-slate hover:text-cos-electric mb-6 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Pipeline
      </Link>

      <h1 className="text-2xl font-heading font-bold text-cos-midnight mb-1">New Deal</h1>
      <p className="text-sm text-cos-slate mb-6">Create a new deal in the pipeline.</p>

      {error && (
        <div className="rounded-cos-lg bg-cos-ember/10 px-4 py-3 text-sm text-cos-ember mb-4">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 rounded-cos-xl border border-cos-border bg-white p-6">
        <div>
          <label className="text-xs font-medium text-cos-slate mb-1.5 block">Deal Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Acme Corp - Enterprise Plan"
            className="w-full rounded-cos-lg border border-cos-border px-3 py-2.5 text-sm focus:border-cos-electric focus:outline-none"
            autoFocus
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-cos-slate mb-1.5 block">Value ($)</label>
            <input
              type="number"
              value={dealValue}
              onChange={(e) => setDealValue(e.target.value)}
              placeholder="0"
              className="w-full rounded-cos-lg border border-cos-border px-3 py-2.5 text-sm focus:border-cos-electric focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-cos-slate mb-1.5 block">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full rounded-cos-lg border border-cos-border px-3 py-2.5 text-sm focus:border-cos-electric focus:outline-none"
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-cos-slate mb-1.5 block">Stage</label>
            <select
              value={stageId}
              onChange={(e) => setStageId(e.target.value)}
              className="w-full rounded-cos-lg border border-cos-border px-3 py-2.5 text-sm focus:border-cos-electric focus:outline-none"
            >
              <option value="">First stage</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-cos-slate mb-1.5 block">Source</label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full rounded-cos-lg border border-cos-border px-3 py-2.5 text-sm focus:border-cos-electric focus:outline-none"
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
          <label className="text-xs font-medium text-cos-slate mb-1.5 block">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Optional notes about this deal..."
            className="w-full rounded-cos-lg border border-cos-border px-3 py-2.5 text-sm focus:border-cos-electric focus:outline-none resize-none"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Link href="/admin/growth-ops/pipeline" className="rounded-cos-lg border border-cos-border px-4 py-2.5 text-sm font-medium text-cos-slate hover:text-cos-midnight transition-colors">
            Cancel
          </Link>
          <Button type="submit" disabled={saving || !name.trim()}>
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
            Create Deal
          </Button>
        </div>
      </form>
    </div>
  );
}
