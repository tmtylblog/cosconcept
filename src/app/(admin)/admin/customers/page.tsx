"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Building2,
  Users,
  ChevronDown,
  ChevronRight,
  Save,
  X,
  Search,
  Loader2,
  ExternalLink,
  Mail,
  Shield,
  Clock,
  CreditCard,
  Sparkles,
  Globe,
  UserCheck,
} from "lucide-react";

/* ── Types ────────────────────────────────────────────────────────── */

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  members: number;
  createdAt: string;
}

interface OrgMember {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  role: string;
}

interface OrgFirm {
  id: string;
  name: string;
  website: string | null;
  firmType: string | null;
  sizeBand: string | null;
  profileCompleteness: number | null;
  createdAt: string;
}

interface EnrichmentStat {
  entries: number;
  cost: number;
  phases: string[];
  lastEnriched: string | null;
}

interface OrgDetails {
  members: OrgMember[];
  firms: OrgFirm[];
  enrichmentStats: Record<string, EnrichmentStat>;
}

type FilterStatus = "all" | "active" | "free" | "pro" | "enterprise";

const PLAN_COLORS: Record<string, string> = {
  free: "bg-cos-cloud text-cos-slate",
  pro: "bg-cos-electric/10 text-cos-electric",
  enterprise: "bg-cos-warm/10 text-cos-warm",
};

const PHASE_COLORS: Record<string, string> = {
  jina: "bg-cos-electric/10 text-cos-electric",
  classifier: "bg-cos-signal/10 text-cos-signal",
  pdl: "bg-purple-100 text-purple-700",
  linkedin: "bg-blue-100 text-blue-700",
  case_study: "bg-cos-warm/10 text-cos-warm",
  onboarding: "bg-emerald-100 text-emerald-700",
  memory: "bg-pink-100 text-pink-700",
  deep_crawl: "bg-orange-100 text-orange-700",
};

/* ── Component ────────────────────────────────────────────────────── */

export default function CustomersPage() {
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null);
  const [orgDetails, setOrgDetails] = useState<Record<string, OrgDetails>>({});
  const [detailsLoading, setDetailsLoading] = useState<string | null>(null);
  const [editingPlan, setEditingPlan] = useState<string | null>(null);
  const [pendingPlan, setPendingPlan] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Load all organizations
  useEffect(() => {
    fetch("/api/admin/organizations")
      .then((r) => r.json())
      .then((data) => {
        setOrgs(data.organizations ?? []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load orgs:", err);
        setLoading(false);
      });
  }, []);

  // Load org details on expand
  const toggleExpand = useCallback(
    async (orgId: string) => {
      if (expandedOrg === orgId) {
        setExpandedOrg(null);
        return;
      }
      setExpandedOrg(orgId);

      if (orgDetails[orgId]) return; // Already loaded

      setDetailsLoading(orgId);
      try {
        const res = await fetch(`/api/admin/organizations/${orgId}/details`);
        if (res.ok) {
          const data = await res.json();
          setOrgDetails((prev) => ({ ...prev, [orgId]: data }));
        }
      } catch (err) {
        console.error("Failed to load org details:", err);
      } finally {
        setDetailsLoading(null);
      }
    },
    [expandedOrg, orgDetails]
  );

  // Update plan
  const savePlan = useCallback(
    async (orgId: string) => {
      setSaving(true);
      try {
        const res = await fetch(`/api/admin/organizations/${orgId}/plan`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan: pendingPlan }),
        });
        if (res.ok) {
          setOrgs((prev) =>
            prev.map((o) =>
              o.id === orgId ? { ...o, plan: pendingPlan } : o
            )
          );
          setEditingPlan(null);
        }
      } catch (err) {
        console.error("Failed to save plan:", err);
      } finally {
        setSaving(false);
      }
    },
    [pendingPlan]
  );

  // Filter organizations
  const filtered = orgs.filter((org) => {
    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !org.name.toLowerCase().includes(q) &&
        !org.slug.toLowerCase().includes(q)
      ) {
        return false;
      }
    }

    // Plan filter
    if (filterStatus !== "all" && filterStatus !== "active") {
      return org.plan === filterStatus;
    }
    if (filterStatus === "active") {
      return org.status === "active";
    }
    return true;
  });

  // Stats
  const stats = {
    total: orgs.length,
    free: orgs.filter((o) => o.plan === "free").length,
    pro: orgs.filter((o) => o.plan === "pro").length,
    enterprise: orgs.filter((o) => o.plan === "enterprise").length,
    totalMembers: orgs.reduce((sum, o) => sum + o.members, 0),
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-cos-midnight">
            Customer Management
          </h1>
          <p className="mt-1 text-sm text-cos-slate">
            Manage customer organizations, users, and subscription plans.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-cos bg-cos-electric/5 px-3 py-1.5 text-center">
            <div className="text-lg font-bold text-cos-electric">{stats.total}</div>
            <div className="text-[10px] font-medium uppercase text-cos-slate">Customers</div>
          </div>
          <div className="rounded-cos bg-cos-signal/5 px-3 py-1.5 text-center">
            <div className="text-lg font-bold text-cos-signal">{stats.totalMembers}</div>
            <div className="text-[10px] font-medium uppercase text-cos-slate">Users</div>
          </div>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cos-slate-light" />
          <input
            type="text"
            placeholder="Search customers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-cos-lg border border-cos-border bg-white py-2 pl-9 pr-4 text-sm text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric/30"
          />
        </div>
        <div className="flex gap-1">
          {(
            [
              { key: "all", label: "All" },
              { key: "free", label: `Free (${stats.free})` },
              { key: "pro", label: `Pro (${stats.pro})` },
              { key: "enterprise", label: `Enterprise (${stats.enterprise})` },
            ] as { key: FilterStatus; label: string }[]
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilterStatus(key)}
              className={`rounded-cos-pill px-3 py-1.5 text-xs font-medium transition-colors ${
                filterStatus === key
                  ? "bg-cos-electric text-white"
                  : "bg-cos-cloud text-cos-slate hover:bg-cos-cloud-dim"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Customer list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-cos-electric" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-cos-lg border border-cos-border bg-white py-12">
          <Building2 className="h-8 w-8 text-cos-slate-light" />
          <p className="mt-2 text-sm text-cos-slate">No customers found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((org) => {
            const isExpanded = expandedOrg === org.id;
            const details = orgDetails[org.id];
            const isLoadingDetails = detailsLoading === org.id;

            return (
              <div
                key={org.id}
                className="overflow-hidden rounded-cos-lg border border-cos-border bg-white transition-shadow hover:shadow-sm"
              >
                {/* Main row */}
                <button
                  onClick={() => toggleExpand(org.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  <span className="text-cos-slate-light">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </span>

                  {/* Name */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-cos-midnight">
                        {org.name}
                      </span>
                      <span className="text-xs text-cos-slate-light">/{org.slug}</span>
                    </div>
                  </div>

                  {/* Plan badge */}
                  <div className="flex items-center gap-2">
                    {editingPlan === org.id ? (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={pendingPlan}
                          onChange={(e) => setPendingPlan(e.target.value)}
                          className="rounded-cos border border-cos-border px-2 py-1 text-xs"
                        >
                          <option value="free">Free</option>
                          <option value="pro">Pro</option>
                          <option value="enterprise">Enterprise</option>
                        </select>
                        <button
                          onClick={() => savePlan(org.id)}
                          disabled={saving}
                          className="rounded-cos bg-cos-electric p-1 text-white hover:bg-cos-electric-hover disabled:opacity-50"
                        >
                          <Save className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => setEditingPlan(null)}
                          className="rounded-cos p-1 text-cos-slate hover:bg-cos-cloud"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingPlan(org.id);
                          setPendingPlan(org.plan);
                        }}
                        className={`rounded-cos-pill px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                          PLAN_COLORS[org.plan] ?? PLAN_COLORS.free
                        }`}
                        title="Click to edit plan"
                      >
                        {org.plan}
                      </button>
                    )}
                  </div>

                  {/* Member count */}
                  <div className="flex items-center gap-1 text-xs text-cos-slate">
                    <Users className="h-3.5 w-3.5" />
                    <span>{org.members}</span>
                  </div>

                  {/* Created date */}
                  <div className="hidden items-center gap-1 text-xs text-cos-slate-light sm:flex">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{org.createdAt}</span>
                  </div>
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-cos-border bg-cos-cloud/30">
                    {isLoadingDetails ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-cos-electric" />
                      </div>
                    ) : details ? (
                      <div className="grid gap-4 p-4 lg:grid-cols-2">
                        {/* Users section */}
                        <div className="rounded-cos border border-cos-border bg-white p-3">
                          <div className="mb-3 flex items-center gap-2">
                            <UserCheck className="h-4 w-4 text-cos-electric" />
                            <h3 className="text-sm font-semibold text-cos-midnight">
                              Users ({details.members.length})
                            </h3>
                          </div>
                          {details.members.length === 0 ? (
                            <p className="text-xs text-cos-slate-light">No members</p>
                          ) : (
                            <div className="space-y-2">
                              {details.members.map((m) => (
                                <div
                                  key={m.id}
                                  className="flex items-center gap-3 rounded-cos bg-cos-cloud/50 px-3 py-2"
                                >
                                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-cos-electric/10 text-xs font-bold text-cos-electric">
                                    {(m.userName ?? m.userEmail ?? "?")
                                      .charAt(0)
                                      .toUpperCase()}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-xs font-medium text-cos-midnight">
                                      {m.userName ?? "Unnamed"}
                                    </p>
                                    <p className="truncate text-[10px] text-cos-slate">
                                      {m.userEmail}
                                    </p>
                                  </div>
                                  <span
                                    className={`rounded-cos-pill px-2 py-0.5 text-[10px] font-medium ${
                                      m.role === "owner"
                                        ? "bg-cos-warm/10 text-cos-warm"
                                        : m.role === "admin"
                                        ? "bg-cos-electric/10 text-cos-electric"
                                        : "bg-cos-cloud text-cos-slate"
                                    }`}
                                  >
                                    {m.role}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Firms section */}
                        <div className="rounded-cos border border-cos-border bg-white p-3">
                          <div className="mb-3 flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-cos-signal" />
                            <h3 className="text-sm font-semibold text-cos-midnight">
                              Linked Firms ({details.firms.length})
                            </h3>
                          </div>
                          {details.firms.length === 0 ? (
                            <p className="text-xs text-cos-slate-light">No linked firms</p>
                          ) : (
                            <div className="space-y-2">
                              {details.firms.map((firm) => {
                                const enrichment = details.enrichmentStats[firm.id];
                                return (
                                  <div
                                    key={firm.id}
                                    className="rounded-cos bg-cos-cloud/50 p-3"
                                  >
                                    <div className="flex items-start justify-between">
                                      <div className="min-w-0">
                                        <p className="truncate text-xs font-semibold text-cos-midnight">
                                          {firm.name}
                                        </p>
                                        {firm.website && (
                                          <a
                                            href={
                                              firm.website.startsWith("http")
                                                ? firm.website
                                                : `https://${firm.website}`
                                            }
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="mt-0.5 flex items-center gap-1 text-[10px] text-cos-electric hover:underline"
                                          >
                                            <Globe className="h-3 w-3" />
                                            {firm.website}
                                          </a>
                                        )}
                                      </div>
                                      {firm.profileCompleteness !== null && (
                                        <div className="text-right">
                                          <div className="text-[10px] font-medium text-cos-slate">
                                            Profile
                                          </div>
                                          <div className="text-xs font-bold text-cos-electric">
                                            {firm.profileCompleteness}%
                                          </div>
                                        </div>
                                      )}
                                    </div>

                                    <div className="mt-2 flex flex-wrap gap-1">
                                      {firm.firmType && (
                                        <span className="rounded-cos-pill bg-cos-signal/10 px-2 py-0.5 text-[10px] font-medium text-cos-signal">
                                          {firm.firmType}
                                        </span>
                                      )}
                                      {firm.sizeBand && (
                                        <span className="rounded-cos-pill bg-cos-cloud px-2 py-0.5 text-[10px] text-cos-slate">
                                          {firm.sizeBand}
                                        </span>
                                      )}
                                    </div>

                                    {/* Enrichment stats */}
                                    {enrichment && (
                                      <div className="mt-2 border-t border-cos-border/50 pt-2">
                                        <div className="flex items-center gap-1 text-[10px] text-cos-slate">
                                          <Sparkles className="h-3 w-3" />
                                          <span>
                                            {enrichment.entries} enrichment
                                            {enrichment.entries !== 1 ? "s" : ""} ·{" "}
                                            ${enrichment.cost.toFixed(2)}
                                          </span>
                                        </div>
                                        <div className="mt-1 flex flex-wrap gap-1">
                                          {enrichment.phases.map((phase) => (
                                            <span
                                              key={phase}
                                              className={`rounded-cos-pill px-1.5 py-0.5 text-[9px] font-medium ${
                                                PHASE_COLORS[phase] ??
                                                "bg-cos-cloud text-cos-slate"
                                              }`}
                                            >
                                              {phase}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 text-center text-xs text-cos-slate-light">
                        Failed to load details
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
