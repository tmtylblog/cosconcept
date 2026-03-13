"use client";

import { useEffect, useState, useCallback } from "react";
import {
  BarChart3, Loader2, RefreshCw, ChevronDown, ChevronRight,
  MessageCircle, Megaphone, AlertTriangle, Download, Users,
  TrendingUp, Target, Zap, CreditCard, Building2, UserSearch, Linkedin,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

interface ConvoSummary { participantName: string; lastMessageAt: string | null; messageCount: number }
interface CampaignActivity { campaignName: string; inviteStatus: string; sentAt: string | null; acceptedAt: string | null }

interface CompanyMatchDetail { participantName: string; headline: string; conversationId: string }
interface NameFuzzyDetail { participantName: string; headline: string; profileUrl: string; conversationId: string }

interface AttributionRow {
  id: string;
  userId: string;
  matchMethod: string;
  instantlyCampaignId: string | null;
  instantlyCampaignName: string | null;
  linkedinCampaignId: string | null;
  hasLinkedinOrganic: boolean;
  hasLinkedinCampaign: boolean;
  hasCompanyLinkedinMatch: boolean;
  companyLinkedinDetails: CompanyMatchDetail[] | null;
  hasNameFuzzyMatch: boolean;
  nameFuzzyDetails: NameFuzzyDetail[] | null;
  pdlLookupStatus: string | null;
  matchedAt: string | null;
  createdAt: string;
  userName: string | null;
  userEmail: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactEmail: string | null;
  orgName: string | null;
  firmName: string | null;
  firmProfileCompleteness: number | null;
  subscriptionPlan: string | null;
  subscriptionStatus: string | null;
  onboardingComplete: boolean;
  dealStatus: string | null;
  dealValue: string | null;
  dealStage: string | null;
  linkedinOrganicConversations: ConvoSummary[];
  linkedinCampaignActivity: CampaignActivity[];
  timeToConversionDays: number | null;
  engagementScore: number;
  journeyStage: string;
  touchpointCount: number;
  atRisk: boolean;
}

interface Summary {
  total: number;
  matched: number;
  matchRate: number;
  byMethod: Record<string, number>;
  byChannel: { instantly: number; linkedinCampaign: number; linkedinOrganic: number; companyLinkedin: number; nameFuzzy: number; direct: number; unattributed: number };
  conversion: { signedUp: number; onboarded: number; paying: number; conversionRate: number };
  avgTimeToConversion: number | null;
}

interface Funnel {
  totalProspects: number;
  contacted: number;
  engaged: number;
  signedUp: number;
  onboarded: number;
  paying: number;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════════ */

const METHOD_STYLE: Record<string, { label: string; bg: string; text: string }> = {
  email_exact:      { label: "Email exact",      bg: "bg-emerald-50",        text: "text-emerald-700" },
  instantly:        { label: "Instantly",         bg: "bg-cos-signal/10",     text: "text-cos-signal" },
  linkedin_url:     { label: "LinkedIn URL",     bg: "bg-cos-electric/10",   text: "text-cos-electric" },
  linkedin_pdl:     { label: "LinkedIn (PDL)",   bg: "bg-indigo-50",         text: "text-indigo-700" },
  name_domain:      { label: "Name + domain",    bg: "bg-amber-50",          text: "text-amber-700" },
  name_fuzzy:       { label: "Name match",       bg: "bg-orange-50",         text: "text-orange-700" },
  company_linkedin: { label: "2nd Degree",       bg: "bg-violet-50",         text: "text-violet-700" },
  none:             { label: "Unattributed",     bg: "bg-cos-cloud",         text: "text-cos-slate-dim" },
};

const JOURNEY_STAGES = [
  { key: "signed_up", label: "Signed Up", color: "bg-cos-slate" },
  { key: "engaged", label: "Engaged", color: "bg-amber-400" },
  { key: "onboarded", label: "Onboarded", color: "bg-cos-electric" },
  { key: "paying", label: "Paying", color: "bg-emerald-500" },
];

type TabKey = "all" | "linkedin_organic" | "linkedin_campaign" | "company_match" | "instantly" | "unattributed" | "converted";
const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All Users" },
  { key: "linkedin_organic", label: "LinkedIn Organic" },
  { key: "linkedin_campaign", label: "LinkedIn Campaign" },
  { key: "company_match", label: "2nd Degree" },
  { key: "instantly", label: "Instantly" },
  { key: "unattributed", label: "Unattributed" },
  { key: "converted", label: "Converted" },
];

/* ═══════════════════════════════════════════════════════════════════════════
   Page Component
   ═══════════════════════════════════════════════════════════════════════ */

export default function AttributionPage() {
  const [rows, setRows] = useState<AttributionRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetch("/api/admin/growth-ops/attribution").then((r) => r.json());
      setRows(d.rows ?? []);
      setSummary(d.summary ?? null);
      setFunnel(d.funnel ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = filterRows(rows, tab);

  function exportCSV() {
    const header = "Name,Email,Org,Source,Campaign,LinkedIn Organic,LinkedIn Campaign,Journey,Plan,Engagement,Days to Convert,Signup Date\n";
    const csv = filtered.map((r) =>
      [
        r.userName ?? "", r.userEmail ?? "", r.orgName ?? "", r.matchMethod,
        r.instantlyCampaignName ?? "", r.linkedinOrganicConversations.length,
        r.linkedinCampaignActivity.length, r.journeyStage, r.subscriptionPlan ?? "free",
        r.engagementScore, r.timeToConversionDays ?? "", r.createdAt.split("T")[0],
      ].map((v) => `"${v}"`).join(",")
    ).join("\n");
    const blob = new Blob([header + csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attribution-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-cos-midnight">Attribution</h1>
          <p className="text-sm text-cos-slate mt-1">
            Multi-touch attribution across Instantly, LinkedIn campaigns, and organic conversations.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={exportCSV} className="flex items-center gap-1.5 text-xs text-cos-slate hover:text-cos-electric transition-colors">
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
          <button onClick={load} disabled={loading} className="flex items-center gap-1.5 text-xs text-cos-slate hover:text-cos-electric transition-colors">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && <SummaryCards summary={summary} />}

      {/* Funnel */}
      {funnel && funnel.totalProspects > 0 && <FunnelChart funnel={funnel} />}

      {/* Tabs */}
      <div className="mb-4 flex gap-1 border-b border-cos-border overflow-x-auto">
        {TABS.map((t) => {
          const count = filterRows(rows, t.key).length;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`shrink-0 px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
                tab === t.key ? "border-cos-electric text-cos-electric" : "border-transparent text-cos-slate hover:text-cos-midnight"
              }`}
            >
              {t.label} <span className="ml-1 text-[10px] opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-cos-electric" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState hasData={rows.length > 0} />
      ) : (
        <div className="rounded-cos-xl border border-cos-border bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cos-border bg-cos-cloud/50">
                <th className="w-8 px-2" />
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">User</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">Source</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">LinkedIn</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">Journey</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">Engagement</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-cos-slate-dim">Signed Up</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <AttributionTableRow
                  key={r.id}
                  row={r}
                  expanded={expandedId === r.id}
                  onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════════════════ */

function SummaryCards({ summary }: { summary: Summary }) {
  const cards = [
    { label: "Total Signups", value: summary.total, icon: Users, color: "text-cos-midnight" },
    { label: "Attribution Rate", value: `${summary.matchRate}%`, icon: Target, color: "text-cos-electric" },
    { label: "Via Instantly", value: summary.byChannel.instantly, icon: Zap, color: "text-cos-signal" },
    { label: "Via LinkedIn Campaign", value: summary.byChannel.linkedinCampaign, icon: Megaphone, color: "text-cos-electric" },
    { label: "Via LinkedIn Organic", value: summary.byChannel.linkedinOrganic, icon: MessageCircle, color: "text-blue-600" },
    { label: "2nd Degree (Company)", value: summary.byChannel.companyLinkedin, icon: Building2, color: "text-violet-600" },
    { label: "Avg Days to Convert", value: summary.avgTimeToConversion ?? "&mdash;", icon: TrendingUp, color: "text-amber-600" },
    { label: "Active Paying", value: summary.conversion.paying, icon: CreditCard, color: "text-emerald-600" },
  ];

  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
      {cards.map((c) => (
        <div key={c.label} className="rounded-cos-xl border border-cos-border bg-white p-3 shadow-sm">
          <div className="flex items-center gap-1.5 mb-1">
            <c.icon className={`h-3.5 w-3.5 ${c.color}`} />
            <p className="text-[10px] font-medium text-cos-slate uppercase tracking-wide">{c.label}</p>
          </div>
          <p className="font-heading text-xl font-bold text-cos-midnight">{c.value}</p>
        </div>
      ))}
    </div>
  );
}

function FunnelChart({ funnel }: { funnel: Funnel }) {
  const stages = [
    { label: "Total Prospects", value: funnel.totalProspects, color: "bg-cos-slate/20" },
    { label: "Contacted", value: funnel.contacted, color: "bg-cos-slate/40" },
    { label: "Engaged", value: funnel.engaged, color: "bg-amber-200" },
    { label: "Signed Up", value: funnel.signedUp, color: "bg-cos-electric/40" },
    { label: "Onboarded", value: funnel.onboarded, color: "bg-cos-electric/70" },
    { label: "Paying", value: funnel.paying, color: "bg-emerald-400" },
  ];

  const max = Math.max(...stages.map((s) => s.value), 1);

  return (
    <div className="mb-6 rounded-cos-xl border border-cos-border bg-white p-5 shadow-sm">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-cos-slate-dim mb-4">Acquisition Funnel</h3>
      <div className="space-y-2">
        {stages.map((s, i) => {
          const pct = Math.max((s.value / max) * 100, 4);
          const prevValue = i > 0 ? stages[i - 1].value : null;
          const dropoff = prevValue && prevValue > 0 ? Math.round(((prevValue - s.value) / prevValue) * 100) : null;
          return (
            <div key={s.label} className="flex items-center gap-3">
              <div className="w-24 shrink-0 text-right">
                <p className="text-xs font-medium text-cos-midnight">{s.label}</p>
              </div>
              <div className="flex-1 relative">
                <div className={`h-7 rounded-cos-md ${s.color} transition-all duration-500`} style={{ width: `${pct}%` }}>
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-bold text-cos-midnight">
                    {s.value.toLocaleString()}
                  </span>
                </div>
              </div>
              {dropoff !== null && dropoff > 0 && (
                <span className="w-12 shrink-0 text-[10px] text-red-400">-{dropoff}%</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AttributionTableRow({ row, expanded, onToggle }: { row: AttributionRow; expanded: boolean; onToggle: () => void }) {
  const m = METHOD_STYLE[row.matchMethod] ?? METHOD_STYLE.none;
  const organicCount = row.linkedinOrganicConversations.length;
  const campaignCount = row.linkedinCampaignActivity.length;

  return (
    <>
      <tr
        onClick={onToggle}
        className="border-b border-cos-border/50 last:border-0 hover:bg-cos-cloud/30 transition-colors cursor-pointer"
      >
        {/* Expand toggle */}
        <td className="px-2 py-3">
          {expanded ? <ChevronDown className="h-3.5 w-3.5 text-cos-slate" /> : <ChevronRight className="h-3.5 w-3.5 text-cos-slate" />}
        </td>
        {/* User */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {row.atRisk && <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" title="At risk" />}
            <div>
              <p className="font-medium text-cos-midnight">{row.userName ?? "\u2014"}</p>
              <p className="text-xs text-cos-slate">{row.userEmail ?? row.userId}</p>
              {row.orgName && <p className="text-[10px] text-cos-slate-dim">{row.orgName}</p>}
            </div>
          </div>
        </td>
        {/* Source */}
        <td className="px-4 py-3">
          <span className={`inline-flex rounded-cos-pill px-2.5 py-0.5 text-xs font-medium ${m.bg} ${m.text}`}>
            {m.label}
          </span>
          {row.instantlyCampaignName && (
            <p className="mt-0.5 text-[10px] text-cos-slate truncate max-w-[140px]">{row.instantlyCampaignName}</p>
          )}
        </td>
        {/* LinkedIn */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            {organicCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-cos-pill bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                <MessageCircle className="h-3 w-3" /> {organicCount}
              </span>
            )}
            {campaignCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-cos-pill bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-700">
                <Megaphone className="h-3 w-3" /> {campaignCount}
              </span>
            )}
            {row.hasCompanyLinkedinMatch && (
              <span className="inline-flex items-center gap-1 rounded-cos-pill bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700" title="2nd degree: company match">
                <Building2 className="h-3 w-3" /> 2nd°
              </span>
            )}
            {row.hasNameFuzzyMatch && (
              <span className="inline-flex items-center gap-1 rounded-cos-pill bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-orange-700" title="Matched by name">
                <UserSearch className="h-3 w-3" /> Name
              </span>
            )}
            {row.pdlLookupStatus === "found" && (
              <span className="inline-flex items-center gap-0.5 rounded-cos-pill bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600" title="LinkedIn URL found via PDL">
                <Linkedin className="h-2.5 w-2.5" />
              </span>
            )}
            {organicCount === 0 && campaignCount === 0 && !row.hasCompanyLinkedinMatch && !row.hasNameFuzzyMatch && (
              <span className="text-[10px] text-cos-slate-dim">&mdash;</span>
            )}
          </div>
        </td>
        {/* Journey */}
        <td className="px-4 py-3">
          <JourneyDots stage={row.journeyStage} />
        </td>
        {/* Engagement */}
        <td className="px-4 py-3">
          <EngagementBadge score={row.engagementScore} />
        </td>
        {/* Signup date */}
        <td className="px-4 py-3 text-xs text-cos-slate">
          {row.createdAt ? new Date(row.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "\u2014"}
        </td>
      </tr>

      {/* Expanded detail */}
      {expanded && <ExpandedRow row={row} />}
    </>
  );
}

function JourneyDots({ stage }: { stage: string }) {
  const stageIndex = JOURNEY_STAGES.findIndex((s) => s.key === stage);
  return (
    <div className="flex items-center gap-1">
      {JOURNEY_STAGES.map((s, i) => (
        <div key={s.key} className="flex items-center gap-1">
          <div
            className={`h-2.5 w-2.5 rounded-full ${i <= stageIndex ? s.color : "bg-cos-border"}`}
            title={s.label}
          />
          {i < JOURNEY_STAGES.length - 1 && (
            <div className={`h-px w-3 ${i < stageIndex ? "bg-cos-slate/30" : "bg-cos-border"}`} />
          )}
        </div>
      ))}
      <span className="ml-1.5 text-[10px] text-cos-slate capitalize">{stage.replace("_", " ")}</span>
    </div>
  );
}

function EngagementBadge({ score }: { score: number }) {
  const color = score >= 7 ? "bg-emerald-100 text-emerald-700" : score >= 4 ? "bg-amber-100 text-amber-700" : "bg-cos-cloud text-cos-slate-dim";
  return (
    <span className={`inline-flex items-center rounded-cos-pill px-2 py-0.5 text-[10px] font-bold ${color}`}>
      {score}/10
    </span>
  );
}

function ExpandedRow({ row }: { row: AttributionRow }) {
  // Build timeline events from available data
  const events: { date: string; label: string; icon: string; color: string }[] = [];

  for (const ca of row.linkedinCampaignActivity) {
    if (ca.sentAt) events.push({ date: ca.sentAt, label: `LinkedIn invite sent (${ca.campaignName})`, icon: "send", color: "text-purple-600" });
    if (ca.acceptedAt) events.push({ date: ca.acceptedAt, label: `Invite accepted (${ca.campaignName})`, icon: "check", color: "text-emerald-600" });
  }

  for (const oc of row.linkedinOrganicConversations) {
    if (oc.lastMessageAt) events.push({
      date: oc.lastMessageAt,
      label: `Organic conversation with ${oc.participantName} (${oc.messageCount} msgs)`,
      icon: "chat",
      color: "text-blue-600",
    });
  }

  if (row.instantlyCampaignName) {
    events.push({ date: row.matchedAt ?? row.createdAt, label: `Instantly campaign: ${row.instantlyCampaignName}`, icon: "zap", color: "text-cos-signal" });
  }

  // Company-level matches
  if (row.companyLinkedinDetails) {
    for (const cm of row.companyLinkedinDetails) {
      events.push({
        date: row.createdAt, // best we have
        label: `2nd degree: ${cm.participantName} (${cm.headline})`,
        icon: "building",
        color: "text-violet-600",
      });
    }
  }

  // Name fuzzy matches
  if (row.nameFuzzyDetails) {
    for (const nf of row.nameFuzzyDetails) {
      events.push({
        date: row.createdAt,
        label: `Name match: ${nf.participantName} (${nf.headline})`,
        icon: "search",
        color: "text-orange-600",
      });
    }
  }

  events.push({ date: row.createdAt, label: "Signed up on COS", icon: "user", color: "text-cos-electric" });

  if (row.onboardingComplete) {
    events.push({ date: row.createdAt, label: "Onboarding complete", icon: "check", color: "text-emerald-600" });
  }

  if (row.subscriptionPlan && row.subscriptionPlan !== "free") {
    events.push({ date: row.createdAt, label: `Upgraded to ${row.subscriptionPlan}`, icon: "star", color: "text-amber-600" });
  }

  events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <tr className="bg-cos-cloud/50">
      <td colSpan={7} className="px-6 py-4">
        <div className="grid grid-cols-2 gap-6">
          {/* Timeline */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-cos-slate-dim mb-3">Journey Timeline</h4>
            {events.length > 0 ? (
              <div className="space-y-2">
                {events.map((e, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`h-2.5 w-2.5 rounded-full bg-current ${e.color}`} />
                      {i < events.length - 1 && <div className="w-px h-4 bg-cos-border" />}
                    </div>
                    <div className="-mt-0.5">
                      <p className="text-xs text-cos-midnight">{e.label}</p>
                      <p className="text-[10px] text-cos-slate">
                        {new Date(e.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-cos-slate">No touchpoints recorded</p>
            )}
          </div>

          {/* Details */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-cos-slate-dim mb-3">Details</h4>
            <DetailRow label="Firm" value={row.firmName} />
            <DetailRow label="Plan" value={row.subscriptionPlan ?? "free"} />
            <DetailRow label="Deal" value={row.dealStatus ? `${row.dealStage} (${row.dealStatus})${row.dealValue ? ` \u2014 ${row.dealValue}` : ""}` : null} />
            <DetailRow label="Profile Complete" value={row.firmProfileCompleteness ? `${Math.round(row.firmProfileCompleteness * 100)}%` : null} />
            <DetailRow label="Time to Convert" value={row.timeToConversionDays !== null ? `${row.timeToConversionDays} days` : null} />
            {row.contactEmail && row.contactEmail !== row.userEmail && (
              <DetailRow label="Prospect Email" value={row.contactEmail} />
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-medium text-cos-slate-dim w-24">{label}</span>
      <span className="text-xs text-cos-midnight">{value ?? "\u2014"}</span>
    </div>
  );
}

function EmptyState({ hasData }: { hasData: boolean }) {
  return (
    <div className="rounded-cos-xl border border-dashed border-cos-border bg-white p-12 text-center shadow-sm">
      <BarChart3 className="h-8 w-8 mx-auto mb-3 text-cos-slate opacity-30" />
      <p className="text-sm text-cos-slate">
        {hasData
          ? "No signups match this filter."
          : "No signups recorded yet. Attribution events are created automatically on each new signup."}
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════════ */

function filterRows(rows: AttributionRow[], tab: TabKey): AttributionRow[] {
  switch (tab) {
    case "linkedin_organic":
      return rows.filter((r) => r.hasLinkedinOrganic || r.linkedinOrganicConversations.length > 0);
    case "linkedin_campaign":
      return rows.filter((r) => r.hasLinkedinCampaign || r.linkedinCampaignActivity.length > 0);
    case "company_match":
      return rows.filter((r) => r.hasCompanyLinkedinMatch || r.hasNameFuzzyMatch);
    case "instantly":
      return rows.filter((r) => r.instantlyCampaignId != null);
    case "unattributed":
      return rows.filter((r) => r.matchMethod === "none" && !r.hasLinkedinOrganic && !r.hasLinkedinCampaign && !r.hasCompanyLinkedinMatch);
    case "converted":
      return rows.filter((r) => r.subscriptionPlan != null && r.subscriptionPlan !== "free");
    default:
      return rows;
  }
}
