"use client";

import { useEffect, useState } from "react";
import { BarChart3, Loader2, RefreshCw } from "lucide-react";

interface AttributionResult {
  userId: string;
  name: string;
  email: string;
  matchedInstantly: boolean;
  matchedLinkedIn: boolean;
  instantlyCampaign?: string;
  linkedInCampaign?: string;
}

export default function AttributionPage() {
  const [results, setResults] = useState<AttributionResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [ran, setRan] = useState(false);

  async function runReport() {
    setLoading(true);
    setRan(true);
    try {
      // Fetch platform users
      const usersRes = await fetch("/api/admin/users?limit=500").then((r) => r.json());
      const users = usersRes.users ?? usersRes.data ?? [];

      // Fetch Instantly leads across all campaigns
      const campaignsRes = await fetch("/api/admin/growth-ops/instantly?action=listCampaigns").then((r) => r.json());
      const campaigns = campaignsRes.data ?? campaignsRes.campaigns ?? [];

      const instantlyEmails = new Map<string, string>(); // email → campaign name
      for (const campaign of campaigns.slice(0, 10)) {
        const leadsRes = await fetch("/api/admin/growth-ops/instantly", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "listLeads", campaignId: campaign.id }),
        }).then((r) => r.json());
        for (const lead of (leadsRes.data ?? leadsRes.leads ?? [])) {
          if (lead.email) instantlyEmails.set(lead.email.toLowerCase(), campaign.name);
        }
      }

      // Fetch LinkedIn invited targets
      const listsRes = await fetch("/api/admin/growth-ops/target-lists").then((r) => r.json());
      const lists = listsRes.lists ?? [];
      const linkedInNames = new Map<string, string>(); // firstName (lowercase) → list name
      for (const list of lists) {
        const targetsRes = await fetch(`/api/admin/growth-ops/target-lists/${list.id}/targets`).then((r) => r.json());
        for (const target of (targetsRes.targets ?? [])) {
          if (target.status === "invited") {
            linkedInNames.set((target.first_name ?? "").toLowerCase(), list.name);
          }
        }
      }

      const matched: AttributionResult[] = users.map((u: { id: string; name: string; email: string }) => {
        const email = (u.email ?? "").toLowerCase();
        const firstName = (u.name ?? "").split(" ")[0].toLowerCase();
        const instantlyCampaign = instantlyEmails.get(email);
        const linkedInCampaign = linkedInNames.get(firstName);
        return {
          userId: u.id,
          name: u.name,
          email: u.email,
          matchedInstantly: !!instantlyCampaign,
          matchedLinkedIn: !!linkedInCampaign,
          instantlyCampaign,
          linkedInCampaign,
        };
      }).filter((r: AttributionResult) => r.matchedInstantly || r.matchedLinkedIn);

      setResults(matched);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-cos-midnight">Attribution Report</h1>
          <p className="text-sm text-cos-slate mt-1">Cross-reference COS users against outbound campaigns.</p>
        </div>
        <button onClick={runReport} disabled={loading} className="flex items-center gap-2 rounded-cos-pill bg-cos-electric px-4 py-2 text-sm font-medium text-white hover:bg-cos-electric-hover disabled:opacity-60 transition-colors">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {ran ? "Re-run" : "Run Report"}
        </button>
      </div>

      {loading && <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-cos-electric" /></div>}

      {!loading && ran && results.length === 0 && (
        <div className="rounded-cos-xl border border-cos-border bg-white p-12 text-center shadow-sm">
          <BarChart3 className="h-8 w-8 mx-auto mb-3 text-cos-slate opacity-40" />
          <p className="text-sm text-cos-slate">No attribution matches found.</p>
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="rounded-cos-xl border border-cos-border bg-white shadow-sm overflow-hidden">
          <div className="border-b border-cos-border px-5 py-3">
            <p className="text-sm font-medium text-cos-midnight">{results.length} attributed user{results.length !== 1 ? "s" : ""}</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cos-border bg-cos-cloud/50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">User</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">Email</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">Instantly</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">LinkedIn</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.userId} className="border-b border-cos-border/50 hover:bg-cos-cloud/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-cos-midnight">{r.name}</td>
                  <td className="px-4 py-3 text-cos-slate">{r.email}</td>
                  <td className="px-4 py-3">
                    {r.matchedInstantly ? <span className="rounded-cos-pill bg-cos-signal/10 px-2.5 py-0.5 text-xs font-medium text-cos-signal">{r.instantlyCampaign}</span> : <span className="text-xs text-cos-slate-light">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {r.matchedLinkedIn ? <span className="rounded-cos-pill bg-cos-electric/10 px-2.5 py-0.5 text-xs font-medium text-cos-electric">{r.linkedInCampaign}</span> : <span className="text-xs text-cos-slate-light">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
