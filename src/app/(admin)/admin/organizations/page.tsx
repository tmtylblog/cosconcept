"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Building2,
  Users,
  ChevronDown,
  ChevronRight,
  Save,
  X,
  Globe,
  Database,
  DollarSign,
  Clock,
  Search,
  MapPin,
  Tag,
  UserCheck,
  Briefcase,
  FileText,
  Loader2,
  ExternalLink,
} from "lucide-react";

/* ── Types ────────────────────────────────────────────────────────── */

type Source = "platform" | "graph" | "all";

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

// Unified firm from the /api/admin/firms endpoint
interface DirectoryFirm {
  id: string;
  name: string;
  website: string | null;
  description: string | null;
  employeeCount: number | null;
  foundedYear: number | null;
  categories: string[];
  industries: string[];
  markets: string[];
  firmType: string | null;
  // Platform-specific fields (present when source includes platform)
  sizeBand?: string | null;
  profileCompleteness?: number | null;
  isPlatformMember?: boolean | null;
  organizationId?: string | null;
  createdAt?: string;
  orgName?: string | null;
  orgSlug?: string | null;
  // Imported company fields
  location?: string | null;
  industry?: string | null;
  dataSource?: "service_firm" | "imported";
  labels?: string[];
  // Merged view fields
  onPlatform?: boolean;
  platformData?: Record<string, unknown> | null;
}

// Related data types for firm expansion tabs
interface RelatedExpert {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  classification: string | null;
}

interface RelatedClient {
  id: string;
  name: string;
  industry: string | null;
  employeeCount: string | null;
}

interface RelatedCaseStudy {
  id: string;
  contentPreview: string | null;
  industries: Array<{ id: string; name: string }>;
  skills: Array<{ id: string; name: string }>;
  status: string | null;
}

interface FirmRelatedData {
  experts: RelatedExpert[];
  expertCount: number;
  clients: RelatedClient[];
  clientCount: number;
  caseStudies: RelatedCaseStudy[];
  caseStudyCount: number;
}

type FirmTab = "overview" | "experts" | "clients" | "caseStudies";

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

const SOURCE_TABS: { key: Source; label: string; desc: string }[] = [
  { key: "platform", label: "Platform Customers", desc: "Firms on the COS platform" },
  { key: "graph", label: "Knowledge Graph", desc: "All firms in Neo4j" },
  { key: "all", label: "All Firms", desc: "Combined view" },
];

/* ── Component ────────────────────────────────────────────────────── */

export default function AdminOrganizationsPage() {
  // Platform orgs (original view)
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null);
  const [orgDetails, setOrgDetails] = useState<Record<string, OrgDetails>>({});
  const [editingPlan, setEditingPlan] = useState<string | null>(null);
  const [pendingPlan, setPendingPlan] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Directory view
  const [source, setSource] = useState<Source>("platform");
  const [firms, setFirms] = useState<DirectoryFirm[]>([]);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [totalFirms, setTotalFirms] = useState(0);
  const [page, setPage] = useState(1);
  const [expandedFirm, setExpandedFirm] = useState<string | null>(null);
  const limit = 50;

  // Load platform orgs for the "Platform Customers" tab header stats
  useEffect(() => {
    fetch("/api/admin/organizations")
      .then((r) => r.json())
      .then((data) => setOrgs(data.organizations ?? []))
      .catch(console.error);
  }, []);

  // Load firms from the universal directory API
  const loadFirms = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        source,
        page: String(page),
        limit: String(limit),
      });
      if (search) params.set("q", search);

      const res = await fetch(`/api/admin/firms?${params}`);
      if (res.ok) {
        const data = await res.json();
        setFirms(data.firms ?? []);
        setTotalFirms(data.total ?? data.totalGraph ?? data.firms?.length ?? 0);
      }
    } catch (err) {
      console.error("Failed to load firms:", err);
    } finally {
      setLoading(false);
    }
  }, [source, page, search]);

  useEffect(() => {
    loadFirms();
  }, [loadFirms]);

  // Reset page when source or search changes
  useEffect(() => {
    setPage(1);
  }, [source, search]);

  async function loadDetails(orgId: string) {
    if (orgDetails[orgId]) return;
    try {
      const res = await fetch(`/api/admin/organizations/${orgId}/details`);
      if (res.ok) {
        const data = await res.json();
        setOrgDetails((prev) => ({ ...prev, [orgId]: data }));
      }
    } catch (err) {
      console.error("Failed to load org details:", err);
    }
  }

  function handleExpandOrg(orgId: string) {
    if (expandedOrg === orgId) {
      setExpandedOrg(null);
    } else {
      setExpandedOrg(orgId);
      loadDetails(orgId);
    }
  }

  async function handlePlanChange(orgId: string) {
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
      console.error("Failed to update plan:", err);
    } finally {
      setSaving(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
  }

  const totalPages = Math.ceil(totalFirms / limit);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-cos-midnight">
          Firm Directory
        </h1>
        <p className="mt-1 text-sm text-cos-slate">
          {orgs.length} platform organization{orgs.length !== 1 ? "s" : ""} &middot;{" "}
          Browse all professional services firms across the knowledge graph.
        </p>
      </div>

      {/* Source Tabs */}
      <div className="flex gap-0.5 rounded-cos-lg bg-cos-cloud-dim p-1">
        {SOURCE_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSource(tab.key)}
            className={`flex-1 rounded-cos-md px-3 py-2 text-sm font-medium transition-all ${
              source === tab.key
                ? "bg-cos-surface text-cos-midnight shadow-sm"
                : "text-cos-slate hover:text-cos-midnight"
            }`}
            title={tab.desc}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-cos-slate" />
          <input
            type="text"
            placeholder="Search firms by name or website..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full rounded-cos-xl border border-cos-border bg-cos-surface py-3 pl-11 pr-4 text-sm text-cos-midnight placeholder:text-cos-slate-light transition-colors focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric"
          />
        </div>
        <button
          type="submit"
          className="rounded-cos-xl bg-cos-electric px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-cos-electric-hover"
        >
          Search
        </button>
        {search && (
          <button
            type="button"
            onClick={() => { setSearch(""); setSearchInput(""); }}
            className="rounded-cos-xl border border-cos-border px-4 py-3 text-sm text-cos-slate transition-colors hover:bg-cos-cloud"
          >
            Clear
          </button>
        )}
      </form>

      {/* Stats bar */}
      <div className="flex items-center justify-between text-xs text-cos-slate">
        <span>
          {loading ? "Loading..." : `${totalFirms} firm${totalFirms !== 1 ? "s" : ""} found`}
          {search && (
            <span className="ml-1.5 rounded-cos-pill bg-cos-electric/10 px-2 py-0.5 text-cos-electric">
              &quot;{search}&quot;
            </span>
          )}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-cos-md border border-cos-border px-3 py-1.5 text-xs font-medium transition-colors hover:border-cos-electric/30 disabled:opacity-30"
            >
              Prev
            </button>
            <span className="font-mono text-xs">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-cos-md border border-cos-border px-3 py-1.5 text-xs font-medium transition-colors hover:border-cos-electric/30 disabled:opacity-30"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Platform Customers view: shows orgs with expandable details */}
      {source === "platform" && (
        <div className="space-y-2">
          {/* Organization cards (the original view) */}
          {orgs.map((org) => (
            <div
              key={org.id}
              className="rounded-cos-xl border border-cos-border bg-cos-surface"
            >
              <button
                onClick={() => handleExpandOrg(org.id)}
                className="flex w-full items-center gap-3 p-4 text-left hover:bg-cos-electric/5"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-cos-lg bg-cos-electric/10">
                  <Building2 className="h-4 w-4 text-cos-electric" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-cos-midnight">{org.name}</p>
                  <p className="font-mono text-xs text-cos-slate-light">{org.slug}</p>
                </div>

                {editingPlan === org.id ? (
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={pendingPlan}
                      onChange={(e) => setPendingPlan(e.target.value)}
                      className="rounded-cos-md border border-cos-border bg-cos-cloud px-2 py-1 text-xs"
                    >
                      <option value="free">Free</option>
                      <option value="pro">Pro</option>
                      <option value="enterprise">Enterprise</option>
                    </select>
                    <button
                      onClick={() => handlePlanChange(org.id)}
                      disabled={saving}
                      className="rounded-cos-md bg-cos-electric p-1 text-white hover:bg-cos-electric-hover"
                    >
                      <Save className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => setEditingPlan(null)}
                      className="rounded-cos-md p-1 text-cos-slate hover:bg-cos-cloud"
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
                    className={`rounded-cos-pill px-2.5 py-0.5 text-xs font-medium ${
                      org.plan === "enterprise"
                        ? "bg-cos-electric/10 text-cos-electric"
                        : org.plan === "pro"
                          ? "bg-cos-signal/10 text-cos-signal"
                          : "bg-cos-slate/10 text-cos-slate"
                    }`}
                    title="Click to change plan"
                  >
                    {org.plan}
                  </button>
                )}

                <span className="text-xs text-cos-slate">{org.status}</span>

                <div className="flex items-center gap-1 text-xs text-cos-slate">
                  <Users className="h-3.5 w-3.5" />
                  {org.members}
                </div>

                <span className="text-xs text-cos-slate-light">{org.createdAt}</span>

                {expandedOrg === org.id ? (
                  <ChevronDown className="h-4 w-4 text-cos-slate" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-cos-slate" />
                )}
              </button>

              {expandedOrg === org.id && (
                <OrgExpandedDetails
                  orgId={org.id}
                  details={orgDetails[org.id]}
                />
              )}
            </div>
          ))}

          {orgs.length === 0 && !loading && (
            <div className="rounded-cos-xl border border-dashed border-cos-border py-12 text-center text-sm text-cos-slate">
              No platform organizations yet.
            </div>
          )}

          {/* Also show platform service_firms below orgs */}
          {firms.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-cos-slate">
                Service Firms ({totalFirms})
              </p>
              <div className="space-y-2">
                {firms.map((firm) => (
                  <FirmCard
                    key={firm.id}
                    firm={firm}
                    expanded={expandedFirm === firm.id}
                    onToggle={() => setExpandedFirm(expandedFirm === firm.id ? null : firm.id)}
                    showPlatformBadge={false}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Knowledge Graph / All Firms view */}
      {source !== "platform" && (
        <div className="space-y-2">
          {loading ? (
            <div className="space-y-2 animate-pulse">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 rounded-cos-xl bg-cos-border/30" />
              ))}
            </div>
          ) : firms.length === 0 ? (
            <div className="rounded-cos-xl border border-dashed border-cos-border py-16 text-center">
              <Database className="mx-auto h-10 w-10 text-cos-slate-light mb-3" />
              <p className="text-sm font-medium text-cos-midnight">
                {source === "graph" ? "Knowledge graph is empty" : "No firms found"}
              </p>
              <p className="mt-1 text-xs text-cos-slate max-w-sm mx-auto">
                {source === "graph"
                  ? "Run the legacy migration or enrichment pipeline from the Neo4j admin page to populate the knowledge graph."
                  : "Try a different search or filter."}
              </p>
            </div>
          ) : (
            firms.map((firm) => (
              <FirmCard
                key={firm.id}
                firm={firm}
                expanded={expandedFirm === firm.id}
                onToggle={() => setExpandedFirm(expandedFirm === firm.id ? null : firm.id)}
                showPlatformBadge={source === "all"}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ── Firm Card ────────────────────────────────────────────────────── */

function FirmCard({
  firm,
  expanded,
  onToggle,
  showPlatformBadge,
}: {
  firm: DirectoryFirm;
  expanded: boolean;
  onToggle: () => void;
  showPlatformBadge: boolean;
}) {
  const [activeTab, setActiveTab] = useState<FirmTab>("overview");
  const [relatedData, setRelatedData] = useState<FirmRelatedData | null>(null);
  const [relatedLoading, setRelatedLoading] = useState(false);

  const loadRelatedData = useCallback(async () => {
    if (relatedData || relatedLoading) return;
    setRelatedLoading(true);
    try {
      const res = await fetch(`/api/admin/firms/${firm.id}/related`);
      if (res.ok) {
        const data = await res.json();
        setRelatedData(data);
      }
    } catch (err) {
      console.error("Failed to load related data:", err);
    } finally {
      setRelatedLoading(false);
    }
  }, [firm.id, relatedData, relatedLoading]);

  function handleTabClick(tab: FirmTab) {
    setActiveTab(tab);
    if (tab !== "overview" && !relatedData) {
      loadRelatedData();
    }
  }

  const CLASSIFICATION_COLORS: Record<string, string> = {
    expert: "bg-cos-signal/10 text-cos-signal",
    internal: "bg-cos-slate/10 text-cos-slate",
    ambiguous: "bg-cos-warm/10 text-cos-warm",
  };

  return (
    <div className="rounded-cos-xl border border-cos-border bg-cos-surface">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-4 text-left hover:bg-cos-electric/5"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-cos-lg bg-cos-electric/10">
          <Building2 className="h-4 w-4 text-cos-electric" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-cos-midnight">{firm.name}</p>
            {showPlatformBadge && firm.onPlatform && (
              <span className="rounded-cos-pill bg-cos-signal/10 px-2 py-0.5 text-[10px] font-medium text-cos-signal">
                On Platform
              </span>
            )}
            {firm.dataSource === "imported" && (
              <span className="rounded-cos-pill bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">
                Imported
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {firm.website && (
              <p className="flex items-center gap-1 text-xs text-cos-slate-light">
                <Globe className="h-3 w-3" />
                {firm.website}
              </p>
            )}
            {firm.location && (
              <p className="flex items-center gap-1 text-xs text-cos-slate-light">
                <MapPin className="h-3 w-3" />
                {firm.location}
              </p>
            )}
          </div>
        </div>

        {(firm.firmType || firm.industry) && (
          <span className="rounded-cos-pill bg-cos-slate/10 px-2 py-0.5 text-xs text-cos-slate">
            {(firm.firmType || firm.industry || "").replace(/_/g, " ")}
          </span>
        )}

        {firm.categories && firm.categories.length > 0 && (
          <div className="flex items-center gap-1">
            <Tag className="h-3 w-3 text-cos-electric" />
            <span className="text-xs text-cos-slate">
              {firm.categories.length}
            </span>
          </div>
        )}

        {(firm.profileCompleteness != null && firm.profileCompleteness > 0) && (
          <span className={`font-mono text-xs font-medium ${
            firm.profileCompleteness >= 0.7
              ? "text-cos-signal"
              : firm.profileCompleteness >= 0.4
                ? "text-cos-warm"
                : "text-cos-ember"
          }`}>
            {Math.round(firm.profileCompleteness * 100)}%
          </span>
        )}

        {expanded ? (
          <ChevronDown className="h-4 w-4 text-cos-slate" />
        ) : (
          <ChevronRight className="h-4 w-4 text-cos-slate" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-cos-border">
          {/* Sub-tabs */}
          <div className="flex gap-0 border-b border-cos-border bg-cos-cloud/30">
            {([
              { key: "overview" as FirmTab, label: "Overview", icon: <Building2 className="h-3.5 w-3.5" /> },
              { key: "experts" as FirmTab, label: "Experts", icon: <UserCheck className="h-3.5 w-3.5" />, count: relatedData?.expertCount },
              { key: "clients" as FirmTab, label: "Clients", icon: <Briefcase className="h-3.5 w-3.5" />, count: relatedData?.clientCount },
              { key: "caseStudies" as FirmTab, label: "Case Studies", icon: <FileText className="h-3.5 w-3.5" />, count: relatedData?.caseStudyCount },
            ]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => handleTabClick(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 ${
                  activeTab === tab.key
                    ? "border-cos-electric text-cos-electric"
                    : "border-transparent text-cos-slate hover:text-cos-midnight"
                }`}
              >
                {tab.icon}
                {tab.label}
                {tab.count != null && tab.count > 0 && (
                  <span className="ml-0.5 rounded-cos-pill bg-cos-electric/10 px-1.5 py-0.5 text-[10px] font-semibold text-cos-electric">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="p-4">
            {/* Overview Tab */}
            {activeTab === "overview" && (
              <div className="grid grid-cols-2 gap-4">
                {/* Left: basic info */}
                <div className="space-y-3">
                  {firm.description && (
                    <div>
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-cos-slate">
                        Description
                      </p>
                      <p className="text-sm text-cos-midnight line-clamp-4">
                        {firm.description}
                      </p>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-4 text-xs text-cos-slate">
                    {firm.foundedYear && (
                      <span>Founded {firm.foundedYear}</span>
                    )}
                    {firm.employeeCount && (
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {firm.employeeCount} employees
                      </span>
                    )}
                    {firm.sizeBand && (
                      <span>{firm.sizeBand.replace(/_/g, " ")}</span>
                    )}
                    {firm.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {firm.location}
                      </span>
                    )}
                    {firm.industry && (
                      <span className="flex items-center gap-1">
                        <Tag className="h-3 w-3" />
                        {firm.industry}
                      </span>
                    )}
                  </div>

                  <p className="font-mono text-[10px] text-cos-slate-light">
                    ID: {firm.id}
                  </p>
                </div>

                {/* Right: graph relationships */}
                <div className="space-y-3">
                  {firm.categories && firm.categories.length > 0 && (
                    <div>
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-cos-slate">
                        Categories
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {firm.categories.map((cat) => (
                          <span
                            key={cat}
                            className="rounded-cos-pill bg-cos-electric/10 px-2 py-0.5 text-[10px] font-medium text-cos-electric"
                          >
                            {cat}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {firm.industries && firm.industries.length > 0 && (
                    <div>
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-cos-slate">
                        Industries
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {firm.industries.map((ind) => (
                          <span
                            key={ind}
                            className="rounded-cos-pill bg-cos-warm/10 px-2 py-0.5 text-[10px] font-medium text-cos-warm"
                          >
                            {ind}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {firm.markets && firm.markets.length > 0 && (
                    <div>
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-cos-slate">
                        Markets
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {firm.markets.slice(0, 10).map((mkt) => (
                          <span
                            key={mkt}
                            className="flex items-center gap-0.5 rounded-cos-pill bg-cos-signal/10 px-2 py-0.5 text-[10px] font-medium text-cos-signal"
                          >
                            <MapPin className="h-2.5 w-2.5" />
                            {mkt}
                          </span>
                        ))}
                        {firm.markets.length > 10 && (
                          <span className="text-[10px] text-cos-slate">
                            +{firm.markets.length - 10} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {(!firm.categories || firm.categories.length === 0) &&
                    (!firm.industries || firm.industries.length === 0) &&
                    (!firm.markets || firm.markets.length === 0) && (
                      <p className="text-xs text-cos-slate-light">
                        No knowledge graph data for this firm yet.
                      </p>
                    )}
                </div>
              </div>
            )}

            {/* Experts Tab */}
            {activeTab === "experts" && (
              <div>
                {relatedLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-cos-electric" />
                  </div>
                ) : relatedData?.experts && relatedData.experts.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="text-xs text-cos-slate mb-2">
                      {relatedData.expertCount} expert{relatedData.expertCount !== 1 ? "s" : ""} associated with this firm
                    </p>
                    {relatedData.experts.map((expert) => (
                      <div
                        key={expert.id}
                        className="flex items-center gap-3 rounded-cos-lg bg-cos-cloud/50 px-3 py-2.5"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-cos-full bg-cos-electric/10 text-xs font-semibold text-cos-electric">
                          {expert.name?.charAt(0)?.toUpperCase() || "?"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-cos-midnight truncate">
                            {expert.name}
                          </p>
                          {expert.title && (
                            <p className="text-xs text-cos-slate truncate">{expert.title}</p>
                          )}
                        </div>
                        {expert.email && (
                          <span className="hidden md:block text-xs text-cos-slate-light font-mono truncate max-w-[180px]">
                            {expert.email}
                          </span>
                        )}
                        {expert.classification && (
                          <span className={`rounded-cos-pill px-2 py-0.5 text-[10px] font-semibold ${
                            CLASSIFICATION_COLORS[expert.classification] || "bg-cos-slate/10 text-cos-slate"
                          }`}>
                            {expert.classification}
                          </span>
                        )}
                      </div>
                    ))}
                    {relatedData.expertCount > relatedData.experts.length && (
                      <p className="text-xs text-cos-slate-light pt-1">
                        Showing {relatedData.experts.length} of {relatedData.expertCount} —{" "}
                        <a href="/admin/experts" className="text-cos-electric hover:underline">
                          View all in Experts page
                        </a>
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="py-6 text-center text-sm text-cos-slate">
                    No experts associated with this firm.
                  </p>
                )}
              </div>
            )}

            {/* Clients Tab */}
            {activeTab === "clients" && (
              <div>
                {relatedLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-cos-electric" />
                  </div>
                ) : relatedData?.clients && relatedData.clients.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="text-xs text-cos-slate mb-2">
                      {relatedData.clientCount} client{relatedData.clientCount !== 1 ? "s" : ""} served by this firm
                    </p>
                    {relatedData.clients.map((client) => (
                      <div
                        key={client.id}
                        className="flex items-center gap-3 rounded-cos-lg bg-cos-cloud/50 px-3 py-2.5"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-cos-full bg-cos-warm/10 text-xs font-semibold text-cos-warm">
                          {client.name?.charAt(0)?.toUpperCase() || "?"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-cos-midnight truncate">
                            {client.name}
                          </p>
                        </div>
                        {client.industry && (
                          <span className="rounded-cos-pill bg-cos-signal/10 px-2 py-0.5 text-[10px] font-semibold text-cos-signal">
                            {client.industry}
                          </span>
                        )}
                        {client.employeeCount && (
                          <span className="flex items-center gap-1 text-xs text-cos-slate">
                            <Users className="h-3 w-3" />
                            {client.employeeCount}
                          </span>
                        )}
                      </div>
                    ))}
                    {relatedData.clientCount > relatedData.clients.length && (
                      <p className="text-xs text-cos-slate-light pt-1">
                        Showing {relatedData.clients.length} of {relatedData.clientCount} —{" "}
                        <a href="/admin/clients" className="text-cos-electric hover:underline">
                          View all in Clients page
                        </a>
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="py-6 text-center text-sm text-cos-slate">
                    No clients associated with this firm.
                  </p>
                )}
              </div>
            )}

            {/* Case Studies Tab */}
            {activeTab === "caseStudies" && (
              <div>
                {relatedLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-cos-electric" />
                  </div>
                ) : relatedData?.caseStudies && relatedData.caseStudies.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs text-cos-slate mb-2">
                      {relatedData.caseStudyCount} case stud{relatedData.caseStudyCount !== 1 ? "ies" : "y"} from this firm
                    </p>
                    {relatedData.caseStudies.map((cs) => (
                      <div
                        key={cs.id}
                        className="rounded-cos-lg border border-cos-border bg-cos-cloud/30 p-3"
                      >
                        {cs.contentPreview && (
                          <p className="text-sm text-cos-midnight line-clamp-3 mb-2">
                            {cs.contentPreview}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-1">
                          {cs.industries?.slice(0, 3).map((ind) => (
                            <span
                              key={ind.id}
                              className="rounded-cos-pill bg-cos-warm/10 px-2 py-0.5 text-[10px] font-medium text-cos-warm"
                            >
                              {ind.name}
                            </span>
                          ))}
                          {cs.skills?.slice(0, 4).map((skill) => (
                            <span
                              key={skill.id}
                              className="rounded-cos-pill bg-cos-electric/10 px-2 py-0.5 text-[10px] font-medium text-cos-electric"
                            >
                              {skill.name}
                            </span>
                          ))}
                          {cs.status && cs.status !== "published" && (
                            <span className="rounded-cos-pill bg-cos-slate/10 px-2 py-0.5 text-[10px] font-medium text-cos-slate">
                              {cs.status}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                    {relatedData.caseStudyCount > relatedData.caseStudies.length && (
                      <p className="text-xs text-cos-slate-light pt-1">
                        Showing {relatedData.caseStudies.length} of {relatedData.caseStudyCount}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="py-6 text-center text-sm text-cos-slate">
                    No case studies associated with this firm.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Org Expanded Details (for platform view) ─────────────────────── */

function OrgExpandedDetails({
  orgId,
  details,
}: {
  orgId: string;
  details: OrgDetails | undefined;
}) {
  if (!details) {
    return (
      <div className="border-t border-cos-border p-4 text-xs text-cos-slate">
        Loading details...
      </div>
    );
  }

  return (
    <div className="border-t border-cos-border divide-y divide-cos-border">
      {/* Members */}
      <div className="p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-cos-slate">
          Members ({details.members.length})
        </p>
        {details.members.length > 0 ? (
          <div className="space-y-1">
            {details.members.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-3 rounded-cos-md bg-cos-cloud px-3 py-2"
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-cos-full bg-cos-electric/10 text-[10px] font-medium text-cos-electric">
                  {m.userName?.charAt(0)?.toUpperCase() || "?"}
                </div>
                <span className="flex-1 text-sm text-cos-midnight">
                  {m.userName}
                </span>
                <span className="text-xs text-cos-slate">{m.userEmail}</span>
                <span
                  className={`rounded-cos-pill px-2 py-0.5 text-xs font-medium ${
                    m.role === "owner"
                      ? "bg-cos-electric/10 text-cos-electric"
                      : m.role === "admin"
                        ? "bg-cos-warm/10 text-cos-warm"
                        : "bg-cos-slate/10 text-cos-slate"
                  }`}
                >
                  {m.role}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-cos-slate">No members.</p>
        )}
      </div>

      {/* Service Firms + Enrichment */}
      <div className="p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-cos-slate">
          Service Firms ({details.firms.length})
        </p>
        {details.firms.length > 0 ? (
          <div className="space-y-3">
            {details.firms.map((firm) => {
              const enrichment = details.enrichmentStats[firm.id];
              return (
                <div
                  key={firm.id}
                  className="rounded-cos-lg border border-cos-border bg-cos-cloud p-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-cos-midnight">{firm.name}</p>
                      <div className="mt-0.5 flex items-center gap-3 text-xs text-cos-slate">
                        {firm.website && (
                          <span className="flex items-center gap-1">
                            <Globe className="h-3 w-3" />
                            {firm.website}
                          </span>
                        )}
                        {firm.firmType && (
                          <span>{firm.firmType.replace(/_/g, " ")}</span>
                        )}
                        {firm.sizeBand && (
                          <span>{firm.sizeBand.replace(/_/g, " ")}</span>
                        )}
                      </div>
                    </div>
                    {firm.profileCompleteness != null && (
                      <div className="text-right">
                        <span className="text-xs text-cos-slate">Profile</span>
                        <p
                          className={`font-mono text-sm font-medium ${
                            firm.profileCompleteness >= 0.7
                              ? "text-cos-signal"
                              : firm.profileCompleteness >= 0.4
                                ? "text-cos-warm"
                                : "text-cos-ember"
                          }`}
                        >
                          {Math.round(firm.profileCompleteness * 100)}%
                        </p>
                      </div>
                    )}
                  </div>

                  {enrichment ? (
                    <div className="mt-2 rounded-cos-md bg-cos-surface p-2">
                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-cos-slate">
                        Enrichment
                      </p>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="flex items-center gap-1 text-cos-slate">
                          <Database className="h-3 w-3 text-cos-electric" />
                          {enrichment.entries} entries
                        </span>
                        <span className="flex items-center gap-1 text-cos-slate">
                          <DollarSign className="h-3 w-3 text-cos-warm" />
                          ${enrichment.cost.toFixed(4)}
                        </span>
                        {enrichment.lastEnriched && (
                          <span className="flex items-center gap-1 text-cos-slate">
                            <Clock className="h-3 w-3 text-cos-signal" />
                            {new Date(enrichment.lastEnriched).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {enrichment.phases.map((phase) => (
                          <span
                            key={phase}
                            className={`rounded-cos-pill px-2 py-0.5 text-[10px] font-medium ${
                              PHASE_COLORS[phase] || "bg-cos-slate/10 text-cos-slate"
                            }`}
                          >
                            {phase}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-cos-slate-light">
                      No enrichment data yet.
                    </p>
                  )}

                  <p className="mt-1 font-mono text-[10px] text-cos-slate-light">
                    ID: {firm.id}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-cos-slate">
            No service firms linked to this organization.
          </p>
        )}
      </div>
    </div>
  );
}
