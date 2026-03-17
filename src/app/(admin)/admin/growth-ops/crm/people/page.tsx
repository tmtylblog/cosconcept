"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  Search,
  Loader2,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface UnifiedPerson {
  id: string;
  sourceTable: string;
  fullName: string;
  email: string | null;
  title: string | null;
  linkedinUrl: string | null;
  photoUrl: string | null;
  headline: string | null;
  entityClass: string;
  companyName: string | null;
  companyDomain: string | null;
  dealCount: number;
  lastActivityAt: string | null;
  createdAt: string | null;
}

type TabFilter = "all" | "expert" | "prospect_contact" | "legacy_contact";

const TAB_CONFIG: { key: TabFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "expert", label: "Experts" },
  { key: "prospect_contact", label: "Prospects" },
  { key: "legacy_contact", label: "Legacy" },
];

const ENTITY_BADGE: Record<string, { label: string; className: string }> = {
  expert: { label: "Expert", className: "bg-green-100 text-green-700" },
  prospect_contact: { label: "Prospect", className: "bg-blue-100 text-blue-700" },
  platform_user: { label: "User", className: "bg-purple-100 text-purple-700" },
  legacy_contact: { label: "Legacy", className: "bg-gray-100 text-gray-600" },
};

export default function CrmPeoplePage() {
  const router = useRouter();
  const [people, setPeople] = useState<UnifiedPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<TabFilter>("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const limit = 100;

  const fetchPeople = useCallback(async () => {
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

      const res = await fetch(`/api/admin/growth-ops/crm/people?${params}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setPeople(data.items || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 0);
    } catch (err) {
      console.error("Failed to fetch people:", err);
    } finally {
      setLoading(false);
    }
  }, [page, search, tab]);

  useEffect(() => {
    fetchPeople();
  }, [fetchPeople]);

  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-heading font-bold text-cos-midnight flex items-center gap-2">
          <Users className="h-6 w-6 text-cos-electric" />
          People
        </h1>
        <p className="text-sm text-cos-slate mt-1">
          Every person in the system — experts, prospect contacts, and legacy contacts.
        </p>
      </div>

      {/* Filter Tabs + Search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex gap-1 bg-cos-cloud rounded-cos-md p-1">
          {TAB_CONFIG.map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setPage(1); }}
              className={`px-3 py-1.5 text-sm font-medium rounded-cos-md transition-colors ${
                tab === t.key
                  ? "bg-white text-cos-midnight shadow-sm"
                  : "text-cos-slate hover:text-cos-midnight"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-cos-slate-light" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search people..."
            className="w-full rounded-cos-md border border-cos-border bg-white pl-9 pr-3 py-2 text-sm text-cos-midnight placeholder:text-cos-slate-light focus:outline-none focus:ring-2 focus:ring-cos-electric/30"
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-cos-lg border border-cos-border bg-cos-surface overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-cos-slate">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading people...
          </div>
        ) : people.length === 0 ? (
          <div className="text-center py-16 text-cos-slate-light text-sm">
            No people found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cos-border bg-cos-cloud/50 text-left">
                  <th className="px-4 py-3 font-medium text-cos-slate-dim">Person</th>
                  <th className="px-4 py-3 font-medium text-cos-slate-dim">Type</th>
                  <th className="px-4 py-3 font-medium text-cos-slate-dim">Title</th>
                  <th className="px-4 py-3 font-medium text-cos-slate-dim">Email</th>
                  <th className="px-4 py-3 font-medium text-cos-slate-dim">Company</th>
                  <th className="px-4 py-3 font-medium text-cos-slate-dim text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => {
                  const badge = ENTITY_BADGE[p.entityClass] || ENTITY_BADGE.legacy_contact;
                  return (
                    <tr
                      key={p.id}
                      className="border-b border-cos-border/50 hover:bg-cos-electric/5 cursor-pointer"
                      onClick={() => router.push(`/admin/growth-ops/crm/people/${encodeURIComponent(p.id)}`)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {p.photoUrl ? (
                            <img
                              src={p.photoUrl}
                              alt=""
                              className="h-8 w-8 rounded-full object-cover shrink-0"
                            />
                          ) : (
                            <div className="h-8 w-8 rounded-full bg-cos-electric/10 flex items-center justify-center text-xs font-bold text-cos-electric shrink-0">
                              {p.fullName.charAt(0)}
                            </div>
                          )}
                          <div>
                            <div className="font-medium text-cos-midnight">{p.fullName}</div>
                            {p.headline && (
                              <div className="text-xs text-cos-slate-light line-clamp-1">{p.headline}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-cos-slate">{p.title || "-"}</td>
                      <td className="px-4 py-3 text-cos-slate text-xs">{p.email || "-"}</td>
                      <td className="px-4 py-3 text-cos-slate">{p.companyName || p.companyDomain || "-"}</td>
                      <td className="px-4 py-3 text-right">
                        {p.linkedinUrl && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(p.linkedinUrl!, "_blank");
                            }}
                            title="Open LinkedIn"
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
              {total.toLocaleString()} people &middot; Page {page} of {totalPages}
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
