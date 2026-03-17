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
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
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

type SortKey = "name" | "title" | "company";
type SortDir = "asc" | "desc";

export default function CrmPeoplePage() {
  const router = useRouter();
  const [people, setPeople] = useState<UnifiedPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expertOnly, setExpertOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
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
        sort,
        sortDir,
      });
      if (search) params.set("search", search);
      if (expertOnly) params.set("entityClass", "expert");

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
  }, [page, search, expertOnly, sort, sortDir]);

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

  function toggleSort(key: SortKey) {
    if (sort === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(key);
      setSortDir("asc");
    }
    setPage(1);
  }

  function SortIcon({ column }: { column: SortKey }) {
    if (sort !== column) return <ArrowUpDown className="h-3 w-3 ml-1 text-cos-slate-light" />;
    return sortDir === "asc"
      ? <ArrowUp className="h-3 w-3 ml-1 text-cos-electric" />
      : <ArrowDown className="h-3 w-3 ml-1 text-cos-electric" />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-cos-midnight flex items-center gap-2">
          <Users className="h-6 w-6 text-cos-electric" />
          People
        </h1>
        <p className="text-sm text-cos-slate mt-1">
          Everyone in the system. Search 3+ characters to include legacy contacts (1.9M+).
        </p>
      </div>

      {/* Filters + Search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={expertOnly}
            onChange={(e) => { setExpertOnly(e.target.checked); setPage(1); }}
            className="accent-cos-electric h-4 w-4 rounded"
          />
          <span className="text-sm font-medium text-cos-midnight">Expert On Platform</span>
        </label>

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
            {!search ? "No people found. Try searching by name or email." : "No people found."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cos-border bg-cos-cloud/50 text-left">
                  <th
                    className="px-4 py-3 font-medium text-cos-slate-dim cursor-pointer hover:text-cos-midnight select-none w-[35%]"
                    onClick={() => toggleSort("name")}
                  >
                    <span className="inline-flex items-center">
                      Name <SortIcon column="name" />
                    </span>
                  </th>
                  <th
                    className="px-4 py-3 font-medium text-cos-slate-dim cursor-pointer hover:text-cos-midnight select-none w-[30%]"
                    onClick={() => toggleSort("title")}
                  >
                    <span className="inline-flex items-center">
                      Title <SortIcon column="title" />
                    </span>
                  </th>
                  <th
                    className="px-4 py-3 font-medium text-cos-slate-dim cursor-pointer hover:text-cos-midnight select-none w-[25%]"
                    onClick={() => toggleSort("company")}
                  >
                    <span className="inline-flex items-center">
                      Company <SortIcon column="company" />
                    </span>
                  </th>
                  <th className="px-4 py-3 font-medium text-cos-slate-dim text-right w-[10%]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => {
                  const isExpert = p.entityClass === "expert";
                  return (
                    <tr
                      key={p.id}
                      className="border-b border-cos-border/50 hover:bg-cos-electric/5 cursor-pointer"
                      onClick={() => router.push(`/admin/growth-ops/crm/people/${encodeURIComponent(p.id)}`)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {p.photoUrl ? (
                            <img src={p.photoUrl} alt="" className="h-8 w-8 rounded-full object-cover shrink-0" />
                          ) : (
                            <div className="h-8 w-8 rounded-full bg-cos-electric/10 flex items-center justify-center text-xs font-bold text-cos-electric shrink-0">
                              {p.fullName.charAt(0)}
                            </div>
                          )}
                          <div>
                            <div className="font-medium text-cos-midnight flex items-center gap-1.5">
                              {p.fullName}
                              {isExpert && (
                                <span className="inline-flex items-center rounded-full bg-green-100 text-green-700 px-1.5 py-0.5 text-[10px] font-medium leading-none">
                                  Expert
                                </span>
                              )}
                            </div>
                            {p.headline && (
                              <div className="text-xs text-cos-slate-light line-clamp-1">{p.headline}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-cos-slate">{p.title || "-"}</td>
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

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-cos-border bg-cos-cloud/30">
            <span className="text-sm text-cos-slate">
              {total.toLocaleString()} people &middot; Page {page} of {totalPages}
            </span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
