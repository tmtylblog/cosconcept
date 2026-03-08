"use client";

import { useEffect, useState } from "react";
import { Handshake, ArrowRight, TrendingUp, Users, DollarSign } from "lucide-react";

interface Partnership {
  id: string;
  firmAName: string;
  firmBName: string;
  status: string;
  type: string;
  matchScore: number | null;
  matchExplanation: string | null;
  createdAt: string;
  acceptedAt: string | null;
}

interface PartnershipStats {
  total: number;
  suggested: number;
  requested: number;
  accepted: number;
  declined: number;
  referrals: number;
  referralsConverted: number;
  opportunities: number;
}

export default function AdminPartnershipsPage() {
  const [partnerships, setPartnerships] = useState<Partnership[]>([]);
  const [stats, setStats] = useState<PartnershipStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/partnerships").then((r) => r.json()),
      fetch("/api/admin/partnerships/stats").then((r) => r.json()),
    ])
      .then(([partnerData, statsData]) => {
        setPartnerships(partnerData.partnerships ?? []);
        setStats(statsData);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered =
    statusFilter === "all"
      ? partnerships
      : partnerships.filter((p) => p.status === statusFilter);

  const statusColors: Record<string, string> = {
    suggested: "bg-cos-slate/10 text-cos-slate",
    requested: "bg-cos-warm/10 text-cos-warm",
    accepted: "bg-cos-signal/10 text-cos-signal",
    declined: "bg-cos-ember/10 text-cos-ember",
    inactive: "bg-cos-slate/10 text-cos-slate-dim",
  };

  if (loading) {
    return <div className="text-sm text-cos-slate">Loading partnerships...</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-bold text-cos-midnight">
          Partnerships & Referrals
        </h1>
        <p className="mt-1 text-sm text-cos-slate">
          Platform-wide partnership activity and referral tracking.
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            icon={<Handshake className="h-4 w-4 text-cos-electric" />}
            label="Total Partnerships"
            value={stats.total}
          />
          <StatCard
            icon={<Users className="h-4 w-4 text-cos-signal" />}
            label="Accepted"
            value={stats.accepted}
          />
          <StatCard
            icon={<TrendingUp className="h-4 w-4 text-cos-warm" />}
            label="Referrals"
            value={`${stats.referralsConverted}/${stats.referrals}`}
            sublabel="converted"
          />
          <StatCard
            icon={<DollarSign className="h-4 w-4 text-cos-electric" />}
            label="Opportunities"
            value={stats.opportunities}
          />
        </div>
      )}

      {/* Pipeline summary */}
      {stats && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-cos-slate">Pipeline:</span>
          <span className="rounded-cos-pill bg-cos-slate/10 px-2.5 py-0.5 text-xs font-medium text-cos-slate">
            {stats.suggested} suggested
          </span>
          <ArrowRight className="h-3 w-3 text-cos-slate-light" />
          <span className="rounded-cos-pill bg-cos-warm/10 px-2.5 py-0.5 text-xs font-medium text-cos-warm">
            {stats.requested} requested
          </span>
          <ArrowRight className="h-3 w-3 text-cos-slate-light" />
          <span className="rounded-cos-pill bg-cos-signal/10 px-2.5 py-0.5 text-xs font-medium text-cos-signal">
            {stats.accepted} accepted
          </span>
          {stats.declined > 0 && (
            <>
              <span className="text-cos-slate-light">|</span>
              <span className="rounded-cos-pill bg-cos-ember/10 px-2.5 py-0.5 text-xs font-medium text-cos-ember">
                {stats.declined} declined
              </span>
            </>
          )}
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-1 rounded-cos-lg border border-cos-border bg-cos-surface p-0.5">
        {["all", "suggested", "requested", "accepted", "declined"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-cos-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
              statusFilter === s
                ? "bg-cos-electric text-white"
                : "text-cos-slate hover:text-cos-midnight"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-cos-xl border border-cos-border">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-cos-border bg-cos-surface">
            <tr>
              <th className="px-4 py-3 font-medium text-cos-slate">Firm A</th>
              <th className="px-4 py-3 font-medium text-cos-slate" />
              <th className="px-4 py-3 font-medium text-cos-slate">Firm B</th>
              <th className="px-4 py-3 font-medium text-cos-slate">Status</th>
              <th className="px-4 py-3 font-medium text-cos-slate">Type</th>
              <th className="px-4 py-3 font-medium text-cos-slate">Match</th>
              <th className="px-4 py-3 font-medium text-cos-slate">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cos-border">
            {filtered.map((p) => (
              <tr key={p.id} className="hover:bg-cos-electric/5">
                <td className="px-4 py-3 font-medium text-cos-midnight">
                  {p.firmAName}
                </td>
                <td className="px-2 py-3">
                  <Handshake className="h-3.5 w-3.5 text-cos-slate-light" />
                </td>
                <td className="px-4 py-3 font-medium text-cos-midnight">
                  {p.firmBName}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block rounded-cos-pill px-2 py-0.5 text-xs font-medium ${
                      statusColors[p.status] || "bg-cos-slate/10 text-cos-slate"
                    }`}
                  >
                    {p.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-cos-slate">
                  {p.type.replace(/_/g, " ")}
                </td>
                <td className="px-4 py-3">
                  {p.matchScore != null ? (
                    <span
                      className={`font-mono text-xs ${
                        p.matchScore >= 0.8
                          ? "text-cos-signal"
                          : p.matchScore >= 0.6
                            ? "text-cos-electric"
                            : "text-cos-slate"
                      }`}
                    >
                      {Math.round(p.matchScore * 100)}%
                    </span>
                  ) : (
                    <span className="text-xs text-cos-slate-light">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-cos-slate">
                  {new Date(p.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-cos-slate">
                  No partnerships found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sublabel,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sublabel?: string;
}) {
  return (
    <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-4">
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-xs uppercase tracking-wider text-cos-slate">
          {label}
        </p>
      </div>
      <p className="mt-2 font-heading text-2xl font-bold text-cos-midnight">
        {value}
      </p>
      {sublabel && (
        <p className="text-xs text-cos-slate-light">{sublabel}</p>
      )}
    </div>
  );
}
