"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Stage {
  id: string;
  label: string;
  displayOrder: number;
  parentStageId: string | null;
  isClosedWon: boolean;
  isClosedLost: boolean;
}

interface SearchResult {
  id: string;
  name: string;
  extra?: string;
}

export default function NewDealPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [stages, setStages] = useState<Stage[]>([]);
  const [dealSources, setDealSources] = useState<{ key: string; label: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [dealValue, setDealValue] = useState("");
  const [priority, setPriority] = useState("normal");
  const [stageId, setStageId] = useState("");
  const [source, setSource] = useState("manual");
  const [notes, setNotes] = useState("");

  // Contact/company linking
  const [contactId, setContactId] = useState<string | null>(searchParams.get("contactId"));
  const [companyId, setCompanyId] = useState<string | null>(searchParams.get("companyId"));
  const [contactName, setContactName] = useState(searchParams.get("contactName") ?? "");
  const [companyName, setCompanyName] = useState(searchParams.get("companyName") ?? "");

  // Contact search
  const [contactQuery, setContactQuery] = useState("");
  const [contactResults, setContactResults] = useState<SearchResult[]>([]);
  const [showContactSearch, setShowContactSearch] = useState(false);

  // Company search
  const [companyQuery, setCompanyQuery] = useState("");
  const [companyResults, setCompanyResults] = useState<SearchResult[]>([]);
  const [showCompanySearch, setShowCompanySearch] = useState(false);

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

  // Build stage hierarchy: parents with their substages grouped
  const stageTree = useMemo(() => {
    const parents = stages.filter((s) => !s.parentStageId);
    const childrenMap = new Map<string, Stage[]>();
    for (const s of stages) {
      if (s.parentStageId) {
        const arr = childrenMap.get(s.parentStageId) ?? [];
        arr.push(s);
        childrenMap.set(s.parentStageId, arr);
      }
    }
    return parents.map((p) => ({
      parent: p,
      children: (childrenMap.get(p.id) ?? []).sort((a, b) => a.displayOrder - b.displayOrder),
    }));
  }, [stages]);

  // Contact search
  useEffect(() => {
    if (!contactQuery.trim() || contactQuery.length < 2) {
      setContactResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/admin/growth-ops/pipeline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "searchContacts", query: contactQuery }),
        });
        const data = await res.json();
        setContactResults((data.results ?? []).map((r: { id: string; firstName?: string; lastName?: string; email?: string }) => ({
          id: r.id,
          name: [r.firstName, r.lastName].filter(Boolean).join(" ") || r.email || r.id,
          extra: r.email,
        })));
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(t);
  }, [contactQuery]);

  // Company search
  useEffect(() => {
    if (!companyQuery.trim() || companyQuery.length < 2) {
      setCompanyResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/admin/growth-ops/pipeline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "searchCompanies", query: companyQuery }),
        });
        const data = await res.json();
        setCompanyResults((data.results ?? []).map((r: { id: string; name?: string; domain?: string }) => ({
          id: r.id,
          name: r.name || r.id,
          extra: r.domain,
        })));
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(t);
  }, [companyQuery]);

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
          stageId: stageId || stages.find((s) => !s.parentStageId)?.id || null,
          priority,
          source,
          notes: notes || null,
          contactId: contactId || null,
          companyId: companyId || null,
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

  const inputClass = "w-full rounded-cos-lg border border-cos-border px-3 py-2.5 text-sm focus:border-cos-electric focus:outline-none";

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
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme Corp - Enterprise Plan" className={inputClass} autoFocus required />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-cos-slate mb-1.5 block">Value ($)</label>
            <input type="number" value={dealValue} onChange={(e) => setDealValue(e.target.value)} placeholder="0" className={inputClass} />
          </div>
          <div>
            <label className="text-xs font-medium text-cos-slate mb-1.5 block">Priority</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className={inputClass}>
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
            <select value={stageId} onChange={(e) => setStageId(e.target.value)} className={inputClass}>
              <option value="">First stage</option>
              {stageTree.map((group) => {
                if (group.children.length === 0) {
                  return <option key={group.parent.id} value={group.parent.id}>{group.parent.label}</option>;
                }
                return (
                  <optgroup key={group.parent.id} label={group.parent.label}>
                    {group.children.map((sub) => (
                      <option key={sub.id} value={sub.id}>{sub.label}</option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-cos-slate mb-1.5 block">Source</label>
            <select value={source} onChange={(e) => setSource(e.target.value)} className={inputClass}>
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

        {/* Contact link */}
        <div>
          <label className="text-xs font-medium text-cos-slate mb-1.5 block">Contact</label>
          {contactId ? (
            <div className="flex items-center gap-2 rounded-cos-lg border border-cos-electric/30 bg-cos-electric/5 px-3 py-2 text-sm">
              <span className="flex-1 text-cos-midnight font-medium">{contactName || contactId}</span>
              <button type="button" onClick={() => { setContactId(null); setContactName(""); }} className="text-xs text-cos-slate hover:text-cos-ember">Remove</button>
            </div>
          ) : (
            <div className="relative">
              <div className="flex items-center gap-2 rounded-cos-lg border border-cos-border px-3 py-2">
                <Search className="h-3.5 w-3.5 text-cos-slate-light shrink-0" />
                <input
                  type="text"
                  value={contactQuery}
                  onChange={(e) => { setContactQuery(e.target.value); setShowContactSearch(true); }}
                  onFocus={() => setShowContactSearch(true)}
                  placeholder="Search contacts by name or email..."
                  className="flex-1 bg-transparent text-sm focus:outline-none"
                />
              </div>
              {showContactSearch && contactResults.length > 0 && (
                <div className="absolute z-20 mt-1 w-full rounded-cos-lg border border-cos-border bg-white shadow-lg max-h-40 overflow-y-auto">
                  {contactResults.map((r) => (
                    <button key={r.id} type="button" onClick={() => { setContactId(r.id); setContactName(r.name); setShowContactSearch(false); setContactQuery(""); }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-cos-electric/5 transition-colors">
                      <span className="font-medium text-cos-midnight">{r.name}</span>
                      {r.extra && <span className="ml-2 text-xs text-cos-slate-light">{r.extra}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Company link */}
        <div>
          <label className="text-xs font-medium text-cos-slate mb-1.5 block">Company</label>
          {companyId ? (
            <div className="flex items-center gap-2 rounded-cos-lg border border-cos-electric/30 bg-cos-electric/5 px-3 py-2 text-sm">
              <span className="flex-1 text-cos-midnight font-medium">{companyName || companyId}</span>
              <button type="button" onClick={() => { setCompanyId(null); setCompanyName(""); }} className="text-xs text-cos-slate hover:text-cos-ember">Remove</button>
            </div>
          ) : (
            <div className="relative">
              <div className="flex items-center gap-2 rounded-cos-lg border border-cos-border px-3 py-2">
                <Search className="h-3.5 w-3.5 text-cos-slate-light shrink-0" />
                <input
                  type="text"
                  value={companyQuery}
                  onChange={(e) => { setCompanyQuery(e.target.value); setShowCompanySearch(true); }}
                  onFocus={() => setShowCompanySearch(true)}
                  placeholder="Search companies by name or domain..."
                  className="flex-1 bg-transparent text-sm focus:outline-none"
                />
              </div>
              {showCompanySearch && companyResults.length > 0 && (
                <div className="absolute z-20 mt-1 w-full rounded-cos-lg border border-cos-border bg-white shadow-lg max-h-40 overflow-y-auto">
                  {companyResults.map((r) => (
                    <button key={r.id} type="button" onClick={() => { setCompanyId(r.id); setCompanyName(r.name); setShowCompanySearch(false); setCompanyQuery(""); }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-cos-electric/5 transition-colors">
                      <span className="font-medium text-cos-midnight">{r.name}</span>
                      {r.extra && <span className="ml-2 text-xs text-cos-slate-light">{r.extra}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div>
          <label className="text-xs font-medium text-cos-slate mb-1.5 block">Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Optional notes about this deal..." className={`${inputClass} resize-none`} />
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
