"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  Search,
  Loader2,
  ExternalLink,
  Globe,
  Users,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface CrmStats {
  totalCompanies: number;
  customers: number;
  prospects: number;
  knowledgeGraph: number;
  clientsOfCustomers: number;
}

interface UnifiedCompany {
  id: string;
  sourceTable: string;
  name: string;
  domain: string | null;
  industry: string | null;
  sizeEstimate: string | null;
  location: string | null;
  logoUrl: string | null;
  website: string | null;
  entityClass: string;
  enrichmentStatus: string | null;
  profileCompleteness: number | null;
  dealCount: number;
  expertCount: number;
  createdAt: string | null;
}

type TabFilter = "all" | "customer" | "prospect" | "knowledge_graph" | "client_of_customer";

const TAB_CONFIG: { key: TabFilter; label: string; color: string }[] = [
  { key: "all", label: "All", color: "text-cos-midnight" },
  { key: "customer", label: "Customers", color: "text-green-600" },
  { key: "prospect", label: "Prospects", color: "text-blue-600" },
  { key: "knowledge_graph", label: "Knowledge Graph", color: "text-purple-600" },
  { key: "client_of_customer", label: "Clients of Customers", color: "text-amber-600" },
];

const ENTITY_BADGE: Record<string, { label: string; className: string }> = {
  customer: { label: "Customer", className: "bg-green-100 text-green-700" },
  prospect: { label: "Prospect", className: "bg-blue-100 text-blue-700" },
  knowledge_graph: { label: "Graph", className: "bg-purple-100 text-purple-700" },
  client_of_customer: { label: "Client", className: "bg-amber-100 text-amber-700" },
};

export default function CrmCompaniesPage() {
  const router = useRouter();
  const [companies, setCompanies] = useState<UnifiedCompany[]>([]);
  const [stats, setStats] = useState<CrmStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<TabFilter>("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const limit = 100;

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        sort: "name",
        sortDir: "asc",
      });
      if (search) params.set("search", search);
      if (tab !== "all") params.set("entityClass", tab);

      const res = await fetch(`/api/admin/growth-ops/crm/companies?${params}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setCompanies(data.items || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 0);
    } catch (err) {
      console.error("Failed to fetch companies:", err);
    } finally {
      setLoading(false);
    }
  }, [page, search, tab]);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  useEffect(() => {
    fetch("/api/admin/growth-ops/crm/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(console.error);
  }, []);

  // Debounced search
  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  function handleTabChange(newTab: TabFilter) {
    setTab(newTab);
    setPage(1);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-cos-midnight flex items-center gap-2">
            <Building2 className="h-6 w-6 text-cos-electric" />
            Companies
          </h1>
          <p className="text-sm text-cos-slate mt-1">
            Every company in the system — customers, prospects, and knowledge graph entities.
          </p>
        </div>
        <Link
          href="/admin/growth-ops/crm/companies/new"
          className="flex items-center gap-1.5 rounded-cos-lg bg-cos-electric px-3 py-2 text-xs font-medium text-white hover:bg-cos-electric-hover transition-colors shrink-0"
        >
          <Plus className="h-3.5 w-3.5" /> New Company
        </Link>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total Companies" value={stats.totalCompanies} icon={Building2} />
          <StatCard label="Customers" value={stats.customers} icon={Users} color="text-green-600" />
          <StatCard label="Prospects" value={stats.prospects} icon={TrendingUp} color="text-blue-600" />
          <StatCard label="Open Deals" value={(stats as Record<string, number>).openDeals ?? 0} icon={Globe} color="text-amber-600" />
        </div>
      )}

      {/* Filter Tabs + Search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex gap-1 bg-cos-cloud rounded-cos-md p-1">
          {TAB_CONFIG.map((t) => (
            <button
              key={t.key}
              onClick={() => handleTabChange(t.key)}
              className={`px-3 py-1.5 text-sm font-medium rounded-cos-md transition-colors ${
                tab === t.key
                  ? "bg-white text-cos-midnight shadow-sm"
                  : "text-cos-slate hover:text-cos-midnight"
              }`}
            >
              {t.label}
              {stats && t.key !== "all" && (
                <span className="ml-1.5 text-xs text-cos-slate-light">
                  {t.key === "customer" ? stats.customers
                    : t.key === "prospect" ? stats.prospects
                    : t.key === "knowledge_graph" ? stats.knowledgeGraph
                    : stats.clientsOfCustomers}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-cos-slate-light" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search companies..."
            className="w-full rounded-cos-md border border-cos-border bg-white pl-9 pr-3 py-2 text-sm text-cos-midnight placeholder:text-cos-slate-light focus:outline-none focus:ring-2 focus:ring-cos-electric/30"
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-cos-lg border border-cos-border bg-cos-surface overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-cos-slate">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading companies...
          </div>
        ) : companies.length === 0 ? (
          <div className="text-center py-16 text-cos-slate-light text-sm">
            {(tab === "knowledge_graph" || tab === "all") && !search ? (
              <div>
                <p className="mb-1">Knowledge Graph companies (8M+) are search-only.</p>
                <p>Type at least 3 characters to search across the full graph.</p>
              </div>
            ) : (
              "No companies found."
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cos-border bg-cos-cloud/50 text-left">
                  <th className="px-4 py-3 font-medium text-cos-slate-dim">Company</th>
                  <th className="px-4 py-3 font-medium text-cos-slate-dim">Type</th>
                  <th className="px-4 py-3 font-medium text-cos-slate-dim">Industry</th>
                  <th className="px-4 py-3 font-medium text-cos-slate-dim">Size</th>
                  <th className="px-4 py-3 font-medium text-cos-slate-dim">Enrichment</th>
                  <th className="px-4 py-3 font-medium text-cos-slate-dim text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => {
                  const badge = ENTITY_BADGE[c.entityClass] || ENTITY_BADGE.knowledge_graph;
                  return (
                    <tr
                      key={c.id}
                      className="border-b border-cos-border/50 hover:bg-cos-electric/5 cursor-pointer"
                      onClick={() => router.push(`/admin/growth-ops/crm/companies/${encodeURIComponent(c.id)}`)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          {c.logoUrl ? (
                            <img src={c.logoUrl} alt="" className="h-7 w-7 rounded object-contain shrink-0 bg-white" />
                          ) : (
                            <div className="h-7 w-7 rounded bg-cos-electric/10 flex items-center justify-center text-xs font-bold text-cos-electric shrink-0">
                              {c.name.charAt(0)}
                            </div>
                          )}
                          <div>
                            <div className="font-medium text-cos-midnight">{c.name}</div>
                            <div className="text-xs text-cos-slate-light">{c.domain || "(no domain)"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-cos-slate">{c.industry || "-"}</td>
                      <td className="px-4 py-3 text-cos-slate">{c.sizeEstimate || "-"}</td>
                      <td className="px-4 py-3">
                        {c.enrichmentStatus ? (
                          <span className={`text-xs font-medium ${
                            c.enrichmentStatus === "enriched" ? "text-green-600" : "text-amber-600"
                          }`}>
                            {c.enrichmentStatus}
                          </span>
                        ) : (
                          <span className="text-xs text-cos-slate-light">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {c.website && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(c.website!, "_blank");
                            }}
                            title="Open website"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-cos-border bg-cos-cloud/30">
            <span className="text-sm text-cos-slate">
              {total.toLocaleString()} companies &middot; Page {page} of {totalPages}
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color = "text-cos-midnight",
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color?: string;
}) {
  return (
    <div className="rounded-cos-md border border-cos-border bg-cos-surface p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-xs font-medium text-cos-slate-dim">{label}</span>
      </div>
      <div className={`text-2xl font-heading font-bold ${color}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}
