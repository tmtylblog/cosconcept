"use client";

import { useEffect, useState } from "react";
import { Plus, Loader2, Users, Upload, ChevronDown, ChevronRight } from "lucide-react";

interface TargetList { id: string; name: string; description: string | null; created_at: string; }
interface Target { id: string; first_name: string; linkedin_url: string; status: string; invited_at: string | null; }

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  pending: { bg: "bg-cos-slate/10", text: "text-cos-slate-dim" },
  invited: { bg: "bg-cos-signal/10", text: "text-cos-signal" },
  failed: { bg: "bg-cos-ember/10", text: "text-cos-ember" },
  skipped: { bg: "bg-cos-warm/10", text: "text-cos-warm" },
};

export default function LinkedInTargetsPage() {
  const [lists, setLists] = useState<TargetList[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [targets, setTargets] = useState<Record<string, Target[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadingTargets, setLoadingTargets] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [csvText, setCsvText] = useState("");
  const [importing, setImporting] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const d = await fetch("/api/admin/growth-ops/target-lists").then((r) => r.json());
    setLists(d.lists ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

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
    load();
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
    // Reload targets
    const d = await fetch(`/api/admin/growth-ops/target-lists/${listId}/targets`).then((r) => r.json());
    setTargets((prev) => ({ ...prev, [listId]: d.targets ?? [] }));
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-cos-midnight">Target Lists</h1>
          <p className="text-sm text-cos-slate mt-1">LinkedIn invite target lists. Import via CSV (firstName, linkedinUrl).</p>
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

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-cos-electric" /></div>
      ) : (
        <div className="space-y-2">
          {lists.length === 0 && <div className="rounded-cos-xl border border-cos-border bg-white p-12 text-center shadow-sm"><p className="text-sm text-cos-slate">No target lists yet.</p></div>}
          {lists.map((list) => (
            <div key={list.id} className="rounded-cos-xl border border-cos-border bg-white shadow-sm overflow-hidden">
              <button onClick={() => toggleList(list.id)} className="w-full flex items-center gap-3 px-5 py-4 hover:bg-cos-cloud/30 transition-colors text-left">
                {expanded === list.id ? <ChevronDown className="h-4 w-4 text-cos-slate shrink-0" /> : <ChevronRight className="h-4 w-4 text-cos-slate shrink-0" />}
                <Users className="h-4 w-4 text-cos-electric shrink-0" />
                <div className="flex-1">
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
                            const s = STATUS_STYLE[t.status] ?? STATUS_STYLE.pending;
                            return <tr key={t.id} className="border-b border-cos-border/50 hover:bg-cos-cloud/20">
                              <td className="px-3 py-2 font-medium text-cos-midnight">{t.first_name}</td>
                              <td className="px-3 py-2 text-cos-electric truncate max-w-[200px]"><a href={t.linkedin_url} target="_blank" rel="noreferrer" className="hover:underline">{t.linkedin_url}</a></td>
                              <td className="px-3 py-2"><span className={`rounded-cos-pill px-2 py-0.5 font-medium ${s.bg} ${s.text}`}>{t.status}</span></td>
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
      )}
    </div>
  );
}
