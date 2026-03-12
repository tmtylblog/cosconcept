"use client";

import { useEffect, useState } from "react";
import { Plus, Loader2, Play, Pause } from "lucide-react";

interface Account { id: string; display_name: string; unipile_account_id: string; }
interface TargetList { id: string; name: string; }
interface Campaign { id: string; name: string; status: string; daily_min: number; daily_max: number; target_list_id: string; linkedin_account_id: string; created_at: string; }

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  draft: { bg: "bg-cos-slate/10", text: "text-cos-slate-dim" },
  active: { bg: "bg-cos-signal/10", text: "text-cos-signal" },
  paused: { bg: "bg-cos-warm/10", text: "text-cos-warm" },
  completed: { bg: "bg-cos-electric/10", text: "text-cos-electric" },
};

export default function LinkedInCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [lists, setLists] = useState<TargetList[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", targetListId: "", linkedinAccountId: "", dailyMin: 15, dailyMax: 19, inviteMessage: "" });
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    const [c, a, l] = await Promise.all([
      fetch("/api/admin/growth-ops/invite-campaigns").then((r) => r.json()),
      fetch("/api/admin/growth-ops/linkedin-accounts").then((r) => r.json()),
      fetch("/api/admin/growth-ops/target-lists").then((r) => r.json()),
    ]);
    setCampaigns(c.campaigns ?? []);
    setAccounts(a.accounts ?? []);
    setLists(l.lists ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function createCampaign() {
    setCreating(true);
    await fetch("/api/admin/growth-ops/invite-campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setCreating(false);
    setShowCreate(false);
    setForm({ name: "", targetListId: "", linkedinAccountId: "", dailyMin: 15, dailyMax: 19, inviteMessage: "" });
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

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-cos-midnight">Invite Campaigns</h1>
          <p className="text-sm text-cos-slate mt-1">LinkedIn connection invite campaigns. 15–19 invites/day, Mon–Sat only.</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 rounded-cos-pill bg-cos-electric px-4 py-2 text-sm font-medium text-white hover:bg-cos-electric-hover transition-colors">
          <Plus className="h-4 w-4" /> New Campaign
        </button>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-cos-surface-overlay">
          <div className="w-full max-w-lg rounded-cos-2xl bg-white p-6 shadow-xl">
            <h2 className="font-heading text-lg font-bold text-cos-midnight mb-4">New Campaign</h2>
            <div className="space-y-3">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Campaign name" className="w-full rounded-cos-lg border border-cos-border px-3 py-2.5 text-sm focus:border-cos-electric focus:outline-none" />
              <select value={form.targetListId} onChange={(e) => setForm({ ...form, targetListId: e.target.value })} className="w-full rounded-cos-lg border border-cos-border px-3 py-2.5 text-sm focus:border-cos-electric focus:outline-none">
                <option value="">Select target list…</option>
                {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <select value={form.linkedinAccountId} onChange={(e) => setForm({ ...form, linkedinAccountId: e.target.value })} className="w-full rounded-cos-lg border border-cos-border px-3 py-2.5 text-sm focus:border-cos-electric focus:outline-none">
                <option value="">Select LinkedIn account…</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.display_name}</option>)}
              </select>
              <div className="flex gap-3">
                <input type="number" value={form.dailyMin} onChange={(e) => setForm({ ...form, dailyMin: Number(e.target.value) })} placeholder="Min/day" className="w-full rounded-cos-lg border border-cos-border px-3 py-2.5 text-sm focus:border-cos-electric focus:outline-none" />
                <input type="number" value={form.dailyMax} onChange={(e) => setForm({ ...form, dailyMax: Number(e.target.value) })} placeholder="Max/day" className="w-full rounded-cos-lg border border-cos-border px-3 py-2.5 text-sm focus:border-cos-electric focus:outline-none" />
              </div>
              <textarea value={form.inviteMessage} onChange={(e) => setForm({ ...form, inviteMessage: e.target.value })} placeholder="Invite message (optional)" rows={3} className="w-full rounded-cos-lg border border-cos-border px-3 py-2.5 text-sm focus:border-cos-electric focus:outline-none resize-none" />
            </div>
            <div className="mt-4 flex gap-3">
              <button onClick={() => setShowCreate(false)} className="flex-1 rounded-cos-pill border border-cos-border py-2 text-sm text-cos-slate hover:bg-cos-cloud transition-colors">Cancel</button>
              <button onClick={createCampaign} disabled={creating || !form.name || !form.targetListId || !form.linkedinAccountId} className="flex-1 rounded-cos-pill bg-cos-electric py-2 text-sm font-medium text-white hover:bg-cos-electric-hover disabled:opacity-60 transition-colors">
                {creating ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Create Campaign"}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-cos-electric" /></div>
      ) : (
        <div className="rounded-cos-xl border border-cos-border bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cos-border bg-cos-cloud/50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">Daily</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">Actions</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-xs text-cos-slate">No campaigns yet.</td></tr>}
              {campaigns.map((c) => {
                const style = STATUS_STYLE[c.status] ?? STATUS_STYLE.draft;
                return (
                  <tr key={c.id} className="border-b border-cos-border/50 hover:bg-cos-cloud/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-cos-midnight">{c.name}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-cos-pill px-2.5 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}>{c.status}</span>
                    </td>
                    <td className="px-4 py-3 text-cos-slate">{c.daily_min}–{c.daily_max}</td>
                    <td className="px-4 py-3 flex gap-2">
                      {c.status === "draft" && <button onClick={() => updateStatus(c.id, "active")} className="flex items-center gap-1 text-xs text-cos-signal hover:underline"><Play className="h-3 w-3" /> Start</button>}
                      {c.status === "active" && <button onClick={() => updateStatus(c.id, "paused")} className="flex items-center gap-1 text-xs text-cos-warm hover:underline"><Pause className="h-3 w-3" /> Pause</button>}
                      {c.status === "paused" && <button onClick={() => updateStatus(c.id, "active")} className="flex items-center gap-1 text-xs text-cos-signal hover:underline"><Play className="h-3 w-3" /> Resume</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
