"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { X, Loader2, Search, Building2, Plus, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

interface CompanyResult {
  name: string;
  industry?: string | null;
  domain?: string | null;
}

interface CompanySearchProps {
  value: string;
  industry: string;
  onSelect: (company: { name: string; industry: string }) => void;
  placeholder?: string;
}

export function CompanySearch({
  value,
  industry,
  onSelect,
  placeholder = "Search companies...",
}: CompanySearchProps) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<CompanyResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [showAddModal, setShowAddModal] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Sync external value changes
  useEffect(() => {
    setQuery(value);
  }, [value]);

  const handleSearch = useCallback((val: string) => {
    setQuery(val);
    setSelectedIdx(-1);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (val.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/graph/search?q=${encodeURIComponent(val)}&type=Company&limit=10`);
        const data = await res.json();
        const items: CompanyResult[] = (data.results ?? []).map((r: { name: string; industry?: string; domain?: string }) => ({
          name: r.name,
          industry: r.industry ?? null,
          domain: r.domain ?? null,
        }));
        setResults(items);
        setIsOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
  }, []);

  const handleSelectCompany = useCallback(
    (company: CompanyResult) => {
      onSelect({
        name: company.name,
        industry: company.industry ?? industry ?? "",
      });
      setQuery(company.name);
      setIsOpen(false);
    },
    [onSelect, industry]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" && isOpen) {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, results.length));
    } else if (e.key === "ArrowUp" && isOpen) {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIdx >= 0 && selectedIdx < results.length) {
        handleSelectCompany(results[selectedIdx]);
      } else if (selectedIdx === results.length) {
        setShowAddModal(true);
        setIsOpen(false);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <>
      <div ref={containerRef} className="relative flex-1">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-cos-slate-light" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => query.length >= 2 && results.length > 0 && setIsOpen(true)}
            placeholder={placeholder}
            className="w-full rounded-cos-md border border-cos-border bg-cos-cloud/30 pl-7 pr-7 py-1.5 text-xs text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none"
          />
          {loading && (
            <Loader2 className="absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 animate-spin text-cos-electric" />
          )}
        </div>

        {/* Dropdown */}
        {isOpen && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-cos-lg border border-cos-border bg-white shadow-lg">
            {results.map((item, idx) => (
              <button
                key={`${item.name}-${idx}`}
                onClick={() => handleSelectCompany(item)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors",
                  idx === selectedIdx
                    ? "bg-cos-electric/10 text-cos-midnight"
                    : "text-cos-midnight hover:bg-cos-cloud/50"
                )}
              >
                <Building2 className="h-3 w-3 shrink-0 text-cos-slate-light" />
                <span className="flex-1 truncate">{item.name}</span>
                {item.industry && (
                  <span className="shrink-0 text-[9px] text-cos-slate-light">{item.industry}</span>
                )}
              </button>
            ))}
            {/* Add new option */}
            <button
              onClick={() => { setShowAddModal(true); setIsOpen(false); }}
              className={cn(
                "flex w-full items-center gap-2 border-t border-cos-border/50 px-3 py-2 text-left text-xs transition-colors",
                selectedIdx === results.length
                  ? "bg-cos-electric/10 text-cos-electric"
                  : "text-cos-electric hover:bg-cos-electric/5"
              )}
            >
              <Plus className="h-3 w-3" />
              Add new company{query.length > 1 ? `: "${query}"` : ""}
            </button>
          </div>
        )}
      </div>

      {/* Add company modal */}
      {showAddModal && (
        <AddCompanyModal
          initialName={query}
          onAdd={(company) => {
            onSelect({ name: company.name, industry: company.industry });
            setQuery(company.name);
            setShowAddModal(false);
          }}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </>
  );
}

// ─── Add Company Modal ───────────────────────────────────

function AddCompanyModal({
  initialName,
  onAdd,
  onClose,
}: {
  initialName: string;
  onAdd: (company: { name: string; industry: string; domain: string }) => void;
  onClose: () => void;
}) {
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!domain.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/companies/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domain.trim(), name: initialName }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to add company");
      }

      const data = await res.json();
      onAdd({
        name: data.name ?? initialName,
        industry: data.industry ?? "",
        domain: data.domain ?? domain.trim(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-cos-xl border border-cos-border bg-cos-surface p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-cos-midnight">Add New Company</h3>
          <button onClick={onClose} className="text-cos-slate-light hover:text-cos-midnight">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs text-cos-slate-dim mb-3">
          Enter the company&apos;s website domain to look it up and add it to the knowledge graph.
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-medium text-cos-midnight">Company Name</label>
            <input
              type="text"
              value={initialName}
              disabled
              className="mt-1 w-full rounded-cos-md border border-cos-border bg-cos-cloud/50 px-3 py-1.5 text-xs text-cos-slate"
            />
          </div>

          <div>
            <label className="text-[10px] font-medium text-cos-midnight">Website Domain</label>
            <div className="mt-1 flex items-center gap-2">
              <Globe className="h-3.5 w-3.5 shrink-0 text-cos-slate-light" />
              <input
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                placeholder="e.g. acme.com"
                className="flex-1 rounded-cos-md border border-cos-border bg-white px-3 py-1.5 text-xs text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none"
                autoFocus
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-cos-ember">{error}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSubmit}
              disabled={loading || !domain.trim()}
              className="flex items-center gap-1.5 rounded-cos-lg bg-cos-electric px-4 py-2 text-xs font-medium text-white hover:bg-cos-electric/90 disabled:opacity-50 transition-colors"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              {loading ? "Looking up..." : "Add Company"}
            </button>
            <button
              onClick={onClose}
              className="text-xs text-cos-slate-dim hover:text-cos-midnight transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
