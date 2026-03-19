"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Handshake,
  ArrowRight,
  TrendingUp,
  Users,
  DollarSign,
  Mail,
  Sparkles,
  SendHorizonal,
  Zap,
} from "lucide-react";

interface Partnership {
  id: string;
  firmAName: string;
  firmAOrgId: string | null;
  firmBName: string;
  firmBOrgId: string | null;
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

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  suggested: { bg: "bg-cos-slate/8", text: "text-cos-slate", dot: "bg-cos-slate" },
  requested: { bg: "bg-cos-warm/8", text: "text-cos-warm", dot: "bg-cos-warm" },
  accepted: { bg: "bg-cos-signal/8", text: "text-cos-signal", dot: "bg-cos-signal" },
  declined: { bg: "bg-cos-ember/8", text: "text-cos-ember", dot: "bg-cos-ember" },
  inactive: { bg: "bg-cos-slate/8", text: "text-cos-slate-dim", dot: "bg-cos-slate-dim" },
};

const PAGE_SIZE = 100;

// ─── Simple toggle switch ─────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "bg-cos-electric" : "bg-slate-300"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export default function AdminPartnershipsPage() {
  const router = useRouter();
  const [partnerships, setPartnerships] = useState<Partnership[]>([]);
  const [stats, setStats] = useState<PartnershipStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [introSending, setIntroSending] = useState<string | null>(null);
  const [introFeedback, setIntroFeedback] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);

  // Email settings toggles
  const [introAutoSend, setIntroAutoSend] = useState(false);
  const [followupAutoSend, setFollowupAutoSend] = useState(false);
  const [toggleSaving, setToggleSaving] = useState<string | null>(null);

  async function saveToggle(key: string, value: boolean) {
    setToggleSaving(key);
    try {
      await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: String(value) }),
      });
    } finally {
      setToggleSaving(null);
    }
  }

  async function handleIntroToggle(val: boolean) {
    setIntroAutoSend(val);
    await saveToggle("partnership_intro_auto_send", val);
  }

  async function handleFollowupToggle(val: boolean) {
    setFollowupAutoSend(val);
    await saveToggle("partnership_followup_auto_send", val);
  }

  async function sendIntro(partnershipId: string) {
    setIntroSending(partnershipId);
    try {
      const res = await fetch("/api/admin/partnerships/intro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnershipId }),
      });
      const data = await res.json();
      if (data.ok) {
        setIntroFeedback((prev) => ({
          ...prev,
          [partnershipId]: data.autoSent ? "Sent!" : "Queued!",
        }));
      } else {
        setIntroFeedback((prev) => ({ ...prev, [partnershipId]: data.error ?? "Error" }));
      }
    } catch {
      setIntroFeedback((prev) => ({ ...prev, [partnershipId]: "Failed" }));
    } finally {
      setIntroSending(null);
    }
  }

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/partnerships").then((r) => r.json()),
      fetch("/api/admin/partnerships/stats").then((r) => r.json()),
      fetch("/api/admin/settings?key=partnership_intro_auto_send").then((r) => r.json()),
      fetch("/api/admin/settings?key=partnership_followup_auto_send").then((r) => r.json()),
    ])
      .then(([partnerData, statsData, introSetting, followupSetting]) => {
        setPartnerships(partnerData.partnerships ?? []);
        setStats(statsData);
        setIntroAutoSend(introSetting.value === "true");
        setFollowupAutoSend(followupSetting.value === "true");
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered =
    statusFilter === "all"
      ? partnerships
      : partnerships.filter((p) => p.status === statusFilter);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-56 rounded-cos-md bg-cos-border" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 rounded-cos-xl bg-cos-border/50" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-cos-midnight">
            Partnerships & Referrals
          </h1>
          <p className="mt-1 text-sm text-cos-slate">
            Platform-wide partnership activity and referral tracking.
          </p>
        </div>
        <Link
          href="/admin/partnerships/simulator"
          className="flex items-center gap-2 rounded-cos-lg bg-cos-electric/10 px-4 py-2.5 text-sm font-semibold text-cos-electric transition-colors hover:bg-cos-electric hover:text-white"
        >
          <Sparkles className="h-4 w-4" />
          Partnership Simulator
        </Link>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            icon={<Handshake className="h-4 w-4" />}
            iconColor="text-cos-electric"
            iconBg="bg-cos-electric/10"
            label="Total Partnerships"
            value={stats.total}
          />
          <StatCard
            icon={<Users className="h-4 w-4" />}
            iconColor="text-cos-signal"
            iconBg="bg-cos-signal/10"
            label="Accepted"
            value={stats.accepted}
          />
          <StatCard
            icon={<TrendingUp className="h-4 w-4" />}
            iconColor="text-cos-warm"
            iconBg="bg-cos-warm/10"
            label="Referrals"
            value={`${stats.referralsConverted}/${stats.referrals}`}
            sublabel="converted"
          />
          <StatCard
            icon={<DollarSign className="h-4 w-4" />}
            iconColor="text-cos-electric"
            iconBg="bg-cos-electric/10"
            label="Opportunities"
            value={stats.opportunities}
          />
        </div>
      )}

      {/* Pipeline flow */}
      {stats && (
        <div className="rounded-cos-xl border border-cos-border bg-cos-surface px-5 py-4">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-cos-slate-light">
            Pipeline
          </p>
          <div className="flex items-center gap-2 text-sm">
            <PipelineBadge count={stats.suggested} label="suggested" status="suggested" />
            <ArrowRight className="h-3.5 w-3.5 text-cos-border-strong" />
            <PipelineBadge count={stats.requested} label="requested" status="requested" />
            <ArrowRight className="h-3.5 w-3.5 text-cos-border-strong" />
            <PipelineBadge count={stats.accepted} label="accepted" status="accepted" />
            {stats.declined > 0 && (
              <>
                <div className="h-4 w-px bg-cos-border mx-1" />
                <PipelineBadge count={stats.declined} label="declined" status="declined" />
              </>
            )}
          </div>
        </div>
      )}

      {/* Email Settings */}
      <div className="rounded-cos-xl border border-cos-border bg-cos-surface px-5 py-4">
        <p className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-cos-slate-light">
          Email Settings
        </p>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <SendHorizonal className="h-3.5 w-3.5 text-cos-electric" />
                <p className="text-sm font-medium text-cos-midnight">Auto-send intro emails</p>
                {introAutoSend && (
                  <span className="inline-flex items-center gap-1 rounded-cos-pill bg-cos-signal/10 px-2 py-0.5 text-[10px] font-semibold text-cos-signal">
                    <Zap className="h-2.5 w-2.5" /> LIVE
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-cos-slate">
                {introAutoSend
                  ? "Intro emails send immediately to masa+{firm}@joincollectiveos.com"
                  : "Intro emails queue for manual admin review"}
              </p>
            </div>
            <Toggle
              checked={introAutoSend}
              onChange={handleIntroToggle}
              disabled={toggleSaving === "partnership_intro_auto_send"}
            />
          </div>
          <div className="h-px bg-cos-border/60" />
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-cos-warm" />
                <p className="text-sm font-medium text-cos-midnight">Auto-send follow-up emails</p>
                {followupAutoSend && (
                  <span className="inline-flex items-center gap-1 rounded-cos-pill bg-cos-signal/10 px-2 py-0.5 text-[10px] font-semibold text-cos-signal">
                    <Zap className="h-2.5 w-2.5" /> LIVE
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-cos-slate">
                {followupAutoSend
                  ? "Follow-up emails send automatically after transcript analysis finds opportunities"
                  : "Follow-up emails queue for manual admin review after transcript analysis"}
              </p>
            </div>
            <Toggle
              checked={followupAutoSend}
              onChange={handleFollowupToggle}
              disabled={toggleSaving === "partnership_followup_auto_send"}
            />
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-0.5 rounded-cos-lg bg-cos-cloud-dim p-1">
        {["all", "suggested", "requested", "accepted", "declined"].map((s) => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`rounded-cos-md px-3.5 py-1.5 text-xs font-medium capitalize transition-all ${
              statusFilter === s
                ? "bg-cos-surface text-cos-midnight shadow-sm"
                : "text-cos-slate hover:text-cos-midnight"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-cos-xl border border-cos-border bg-cos-surface">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-cos-border bg-cos-cloud/50">
              <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                Firm A
              </th>
              <th className="w-10 px-2 py-3.5" />
              <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                Firm B
              </th>
              <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                Status
              </th>
              <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                Type
              </th>
              <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                Match
              </th>
              <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                Created
              </th>
              <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cos-border/60">
            {paginated.map((p) => {
              const style = STATUS_STYLES[p.status] ?? STATUS_STYLES.inactive;
              return (
                <tr
                  key={p.id}
                  className="transition-colors hover:bg-cos-electric/[0.02]"
                >
                  <td className="px-5 py-3.5">
                    {p.firmAOrgId ? (
                      <button onClick={() => router.push(`/admin/customers/${p.firmAOrgId}`)} className="font-medium text-cos-midnight hover:text-cos-electric hover:underline text-left">
                        {p.firmAName}
                      </button>
                    ) : (
                      <span className="font-medium text-cos-midnight">{p.firmAName}</span>
                    )}
                  </td>
                  <td className="px-2 py-3.5">
                    <Handshake className="h-3.5 w-3.5 text-cos-slate-light" />
                  </td>
                  <td className="px-5 py-3.5">
                    {p.firmBOrgId ? (
                      <button onClick={() => router.push(`/admin/customers/${p.firmBOrgId}`)} className="font-medium text-cos-midnight hover:text-cos-electric hover:underline text-left">
                        {p.firmBName}
                      </button>
                    ) : (
                      <span className="font-medium text-cos-midnight">{p.firmBName}</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-cos-pill px-2.5 py-1 text-xs font-medium ${style.bg} ${style.text}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                      {p.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-cos-slate">
                    {p.type.replace(/_/g, " ")}
                  </td>
                  <td className="px-5 py-3.5">
                    {p.matchScore != null ? (
                      <span
                        className={`font-mono text-xs font-semibold ${
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
                      <span className="text-xs text-cos-slate-light">&mdash;</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-cos-slate">
                    {new Date(p.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-3.5">
                    {["requested", "accepted"].includes(p.status) && (
                      introFeedback[p.id] ? (
                        <span className={`text-xs font-medium ${introFeedback[p.id] === "Sent!" ? "text-cos-signal" : introFeedback[p.id] === "Queued!" ? "text-cos-electric" : "text-cos-ember"}`}>
                          {introFeedback[p.id]}
                        </span>
                      ) : (
                        <button
                          onClick={() => sendIntro(p.id)}
                          disabled={introSending === p.id}
                          className="flex items-center gap-1.5 rounded-cos-md bg-cos-electric/10 px-3 py-1.5 text-xs font-semibold text-cos-electric transition-colors hover:bg-cos-electric hover:text-white disabled:opacity-50"
                        >
                          {introAutoSend ? <Zap className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
                          {introSending === p.id ? "Generating…" : introAutoSend ? "Send Now" : "Queue Intro"}
                        </button>
                      )
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-5 py-12 text-center text-sm text-cos-slate"
                >
                  No partnerships found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-cos-border px-5 py-3">
            <span className="text-xs text-cos-slate">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-cos-md border border-cos-border px-3 py-1.5 text-xs font-medium text-cos-slate transition-colors hover:bg-cos-cloud disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-xs text-cos-slate">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded-cos-md border border-cos-border px-3 py-1.5 text-xs font-medium text-cos-slate transition-colors hover:bg-cos-cloud disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  iconColor,
  iconBg,
  label,
  value,
  sublabel,
}: {
  icon: React.ReactNode;
  iconColor: string;
  iconBg: string;
  label: string;
  value: string | number;
  sublabel?: string;
}) {
  return (
    <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-5 transition-shadow hover:shadow-sm">
      <div className={`inline-flex h-9 w-9 items-center justify-center rounded-cos-lg ${iconBg} ${iconColor} mb-3`}>
        {icon}
      </div>
      <p className="text-xs font-medium uppercase tracking-wider text-cos-slate">
        {label}
      </p>
      <p className="mt-1 font-heading text-2xl font-bold tracking-tight text-cos-midnight">
        {value}
      </p>
      {sublabel && (
        <p className="mt-0.5 text-xs text-cos-slate-light">{sublabel}</p>
      )}
    </div>
  );
}

function PipelineBadge({
  count,
  label,
  status,
}: {
  count: number;
  label: string;
  status: string;
}) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.inactive;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-cos-pill px-3 py-1.5 text-xs font-medium ${style.bg} ${style.text}`}>
      <span className="font-heading text-sm font-bold">{count}</span>
      {label}
    </span>
  );
}
