"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Search,
  Loader2,
  Lightbulb,
  Factory,
  Globe,
  Languages,
} from "lucide-react";
import type { AttributeItem } from "@/components/admin/types";

type AttributeType = "skills" | "industries" | "markets" | "languages";

const ATTRIBUTE_TABS: {
  key: AttributeType;
  label: string;
  icon: React.ReactNode;
}[] = [
  { key: "skills", label: "Skills", icon: <Lightbulb className="h-3.5 w-3.5" /> },
  { key: "industries", label: "Industries", icon: <Factory className="h-3.5 w-3.5" /> },
  { key: "markets", label: "Markets", icon: <Globe className="h-3.5 w-3.5" /> },
  { key: "languages", label: "Languages", icon: <Languages className="h-3.5 w-3.5" /> },
];

export default function AttributesTab() {
  const [activeType, setActiveType] = useState<AttributeType>("skills");
  const [items, setItems] = useState<AttributeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchSubmitted, setSearchSubmitted] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 100;

  const fetchAttributes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        type: activeType,
        page: String(page),
        limit: String(limit),
      });
      if (searchSubmitted) params.set("q", searchSubmitted);

      const res = await fetch(`/api/admin/knowledge-graph/attributes?${params}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.attributes ?? []);
        setTotal(data.total ?? 0);
      }
    } catch (err) {
      console.error("Failed to fetch attributes:", err);
    } finally {
      setLoading(false);
    }
  }, [activeType, searchSubmitted, page]);

  useEffect(() => {
    fetchAttributes();
  }, [fetchAttributes]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchSubmitted(search);
    setPage(1);
  }

  function handleTypeChange(type: AttributeType) {
    setActiveType(type);
    setSearch("");
    setSearchSubmitted("");
    setPage(1);
  }

  const totalPages = Math.ceil(total / limit);

  const countColor = (type: AttributeType) => {
    switch (type) {
      case "skills":
        return "bg-cos-signal/10 text-cos-signal";
      case "industries":
        return "bg-cos-warm/10 text-cos-warm";
      case "markets":
        return "bg-cos-electric/10 text-cos-electric";
      case "languages":
        return "bg-purple-100 text-purple-700";
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-tabs */}
      <div className="flex gap-2">
        {ATTRIBUTE_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTypeChange(tab.key)}
            className={`flex items-center gap-2 rounded-cos-lg px-4 py-2 text-sm font-medium transition-all ${
              activeType === tab.key
                ? "bg-cos-electric text-white shadow-sm"
                : "bg-cos-surface text-cos-slate border border-cos-border hover:border-cos-electric/30 hover:text-cos-electric"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="relative">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-cos-slate" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${activeType}...`}
          className="w-full rounded-cos-xl border border-cos-border bg-cos-surface py-3 pl-11 pr-4 text-sm text-cos-midnight placeholder:text-cos-slate-light transition-colors focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric"
        />
        {searchSubmitted && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setSearchSubmitted("");
              setPage(1);
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-cos-pill bg-cos-electric/10 px-2.5 py-0.5 text-xs font-medium text-cos-electric hover:bg-cos-electric/20"
          >
            {total} result{total !== 1 ? "s" : ""} &times;
          </button>
        )}
      </form>

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-cos-electric" />
        </div>
      ) : (
        <>
          {/* Stats bar */}
          <div className="flex items-center justify-between text-xs text-cos-slate">
            <span>
              {total > 0
                ? `${total.toLocaleString()} distinct ${activeType}`
                : `No ${activeType} found`}
              {searchSubmitted && (
                <span className="ml-1.5 rounded-cos-pill bg-cos-electric/10 px-2 py-0.5 text-cos-electric">
                  &quot;{searchSubmitted}&quot;
                </span>
              )}
            </span>
            {totalPages > 1 && (
              <span>
                Page {page} of {totalPages}
              </span>
            )}
          </div>

          {/* Attribute list */}
          <div className="rounded-cos-xl border border-cos-border bg-cos-surface overflow-hidden">
            {items.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <p className="text-sm text-cos-slate">
                  {searchSubmitted
                    ? `No ${activeType} match your search.`
                    : `No ${activeType} found in the knowledge graph.`}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-cos-border">
                {items.map((item, idx) => (
                  <div
                    key={`${item.name}-${idx}`}
                    className="flex items-center justify-between px-5 py-2.5 hover:bg-cos-electric/5 transition-colors"
                  >
                    <span className="text-sm text-cos-midnight truncate">{item.name}</span>
                    <span
                      className={`rounded-cos-pill px-2.5 py-0.5 text-xs font-medium shrink-0 ${countColor(activeType)}`}
                    >
                      {item.count.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-cos-md border border-cos-border px-4 py-2 text-sm font-medium text-cos-slate transition-colors hover:border-cos-electric hover:text-cos-electric disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-cos-slate">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-cos-md border border-cos-border px-4 py-2 text-sm font-medium text-cos-slate transition-colors hover:border-cos-electric hover:text-cos-electric disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
